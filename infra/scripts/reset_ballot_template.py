#!/usr/bin/env python3
"""
Reset a ballot back to a fresh "project start" template.

Keeps the official seed arguments (source = sourceOfficial) and removes EVERYTHING
a community generates on top: community arguments, their Bluesky crossposts, all
peer-review records, plus all derived Postgres rows (comments, ratings/likes,
peer-reviews, the whole taxonomy). After running, the ballot looks like a brand-new
project: only the official arguments, nothing else.

Deletes in BOTH places so the reset is immediate and reindex-safe:
  - PDS governance repo  → community argument records + their crossposts + reviews
  - Postgres             → community args + all derived/calculator tables

This is a DEV tool — safe to run repeatedly. Dry-run by default.

Usage:
    # Dry run (default — shows what would be deleted, touches nothing):
    BALLOT_RKEY=663 \\
    DB_URL=postgresql://allforone:<pw>@localhost:5432/appview \\
    MASTER_KEY_B64=<APPVIEW_PDS_CREDS_MASTER_KEY_B64> \\
    python3 infra/scripts/reset_ballot_template.py

    # Actually delete:
    ... python3 infra/scripts/reset_ballot_template.py --execute

Prerequisites:
    - PDS port-forwarded:       kubectl port-forward -n poltr svc/pds 2583:80
    - PostgreSQL port-forwarded: kubectl port-forward -n poltr deployment/allforone-postgres 5432:5432
    - Python deps: requests, psycopg2, pynacl

Env vars:
    BALLOT_RKEY      Ballot rkey (BK number, e.g. "663"). Default: "663".
    DB_URL           PostgreSQL connection URL (governance creds + cleanup).
    MASTER_KEY_B64   APPVIEW_PDS_CREDS_MASTER_KEY_B64 (decrypts governance password).
    PDS_HOST         PDS endpoint. Default: http://localhost:2583.

What is KEPT:
    - Official arguments (PDS source = sourceOfficial / Postgres source_type = 'official')
    - The governance account itself + its profile + official crossposts
"""

import argparse
import base64
import os
import sys

import psycopg2
import requests
from nacl import secret as nacl_secret

PDS_HOST = os.getenv("PDS_HOST", "http://localhost:2583")
ARG_COLLECTION = "app.ch.poltr.ballot.argument"
OFFICIAL_REF = f"{ARG_COLLECTION}#sourceOfficial"
BSKY_POST_COLLECTION = "app.bsky.feed.post"
# All review-related collections are wiped wholesale (reviews only exist for
# community arguments; official seed args are never peer-reviewed).
REVIEW_COLLECTIONS = [
    "app.ch.poltr.review.invitation",
    "app.ch.poltr.review.response",
    "app.ch.poltr.peerreview.invitation",
]


# ---------------------------------------------------------------------------
# Governance credentials + PDS session
# ---------------------------------------------------------------------------
def load_governance_creds(db_url: str, ballot_rkey: str, master_key_b64: str):
    """Load governance account (did, handle, decrypted password) from the DB."""
    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT did, handle, pw_ciphertext, pw_nonce "
                "FROM auth.governance_accounts WHERE ballot_rkey = %s",
                (ballot_rkey,),
            )
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        sys.exit(f"ERROR: no governance account for ballot_rkey={ballot_rkey}")
    did, handle, pw_ct, pw_nonce = row
    box = nacl_secret.SecretBox(base64.b64decode(master_key_b64))
    password = box.decrypt(bytes(pw_ct), bytes(pw_nonce)).decode("utf-8")
    return did, handle, password


def create_session(identifier: str, password: str) -> str:
    """Create a PDS session for the governance account → accessJwt (Bearer).
    `identifier` should be the DID: the governance handle can be stale/reassigned
    on the PDS (login by handle then 401), whereas the DID is stable."""
    resp = requests.post(
        f"{PDS_HOST}/xrpc/com.atproto.server.createSession",
        json={"identifier": identifier, "password": password},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["accessJwt"]


# ---------------------------------------------------------------------------
# PDS record helpers
# ---------------------------------------------------------------------------
def list_records(repo: str, collection: str) -> list[dict]:
    """List all records of a collection (paginated, public read)."""
    out, cursor = [], None
    while True:
        params = {"repo": repo, "collection": collection, "limit": "100"}
        if cursor:
            params["cursor"] = cursor
        resp = requests.get(
            f"{PDS_HOST}/xrpc/com.atproto.repo.listRecords", params=params, timeout=20
        )
        if resp.status_code in (400, 404):
            break
        resp.raise_for_status()
        data = resp.json()
        out.extend(data.get("records", []))
        cursor = data.get("cursor")
        if not cursor or not data.get("records"):
            break
    return out


def delete_record(token: str, repo: str, collection: str, rkey: str) -> bool:
    resp = requests.post(
        f"{PDS_HOST}/xrpc/com.atproto.repo.deleteRecord",
        headers={"Authorization": f"Bearer {token}"},
        json={"repo": repo, "collection": collection, "rkey": rkey},
        timeout=20,
    )
    if resp.status_code >= 400:
        print(f"    delete failed {collection}/{rkey}: {resp.status_code} {resp.text[:120]}")
        return False
    return True


def _rkey(uri: str) -> str:
    return uri.rsplit("/", 1)[-1]


# ---------------------------------------------------------------------------
# PDS cleanup
# ---------------------------------------------------------------------------
def reset_pds(did: str, token: str, community_crosspost_rkeys: set, execute: bool) -> None:
    print(f"\n=== PDS governance repo {did} ===")

    # 1) community argument records (keep sourceOfficial)
    args = list_records(did, ARG_COLLECTION)
    community = [
        r for r in args
        if (r.get("value", {}).get("source") or {}).get("$type") != OFFICIAL_REF
    ]
    official = len(args) - len(community)
    print(f"  arguments: {len(args)} total → keep {official} official, "
          f"delete {len(community)} community")
    if execute:
        for r in community:
            if delete_record(token, did, ARG_COLLECTION, _rkey(r["uri"])):
                pass

    # 2) crossposts of community arguments (rkeys resolved from Postgres)
    print(f"  community crossposts (app.bsky.feed.post): delete {len(community_crosspost_rkeys)}")
    if execute:
        for rk in community_crosspost_rkeys:
            delete_record(token, did, BSKY_POST_COLLECTION, rk)

    # 3) all review records (reviews only exist for community arguments)
    for coll in REVIEW_COLLECTIONS:
        recs = list_records(did, coll)
        print(f"  {coll}: delete {len(recs)}")
        if execute:
            for r in recs:
                delete_record(token, did, coll, _rkey(r["uri"]))


# ---------------------------------------------------------------------------
# Postgres cleanup
# ---------------------------------------------------------------------------
# (label, SQL) — counts run first (dry run), then the same WHERE deletes on execute.
# Order matters only for app_likes (must read arg/comment uris before they vanish);
# we delete likes by subject-prefix/explicit-set so ordering before args is safe.
def reset_postgres(db_url: str, ballot_rkey: str, gov_did: str, execute: bool) -> set:
    """Cleans all derived/community Postgres rows for the ballot. Returns the set
    of community crosspost rkeys (for the PDS step)."""
    print(f"\n=== Postgres cleanup (ballot_rkey={ballot_rkey}) ===")
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    crosspost_rkeys: set = set()
    try:
        with conn.cursor() as cur:
            # Crosspost rkeys of community args (needed by the PDS step).
            cur.execute(
                "SELECT bsky_post_uri FROM app_arguments "
                "WHERE ballot_rkey = %s AND source_type IS DISTINCT FROM 'official' "
                "AND bsky_post_uri IS NOT NULL",
                (ballot_rkey,),
            )
            crosspost_rkeys = {_rkey(r[0]) for r in cur.fetchall()}

            # Likes/ratings on this ballot's arguments AND comments.
            like_where = (
                "subject_uri IN ("
                "  SELECT uri FROM app_arguments WHERE ballot_rkey = %(b)s "
                "  UNION SELECT uri FROM app_comments WHERE ballot_rkey = %(b)s)"
            )
            # Activity-seen rows pointing at this ballot's args/comments.
            seen_where = (
                "activity_uri IN ("
                "  SELECT uri FROM app_arguments WHERE ballot_rkey = %(b)s "
                "  UNION SELECT uri FROM app_comments WHERE ballot_rkey = %(b)s)"
            )
            # Peer-review tables are keyed by argument_uri (no ballot_rkey column).
            pr_where = "argument_uri IN (SELECT uri FROM app_arguments WHERE ballot_rkey = %(b)s)"

            # (label, full DELETE statement). Community args are deleted last so the
            # likes/activity subqueries above still resolve. app_arguments delete
            # cascades to app_argument_open_codes and app_peerreviews (FK CASCADE).
            steps = [
                ("app_likes (ratings/likes)", f"DELETE FROM app_likes WHERE {like_where}"),
                ("app_activity_seen", f"DELETE FROM app_activity_seen WHERE {seen_where}"),
                ("app_comment_translations", "DELETE FROM app_comment_translations WHERE ballot_rkey = %(b)s"),
                ("app_comments", "DELETE FROM app_comments WHERE ballot_rkey = %(b)s"),
                ("app_peerreview_responses", f"DELETE FROM app_peerreview_responses WHERE {pr_where}"),
                ("app_peerreview_invitations", f"DELETE FROM app_peerreview_invitations WHERE {pr_where}"),
                ("app_topic_membership", "DELETE FROM app_topic_membership WHERE ballot_rkey = %(b)s"),
                ("app_topic_node", "DELETE FROM app_topic_node WHERE ballot_rkey = %(b)s"),
                ("app_taxonomy_run (+axis/bundle/membership/arguments_axis)",
                 "DELETE FROM app_taxonomy_run WHERE ballot_rkey = %(b)s"),
                ("app_arguments (community; cascades open_codes + peerreviews)",
                 "DELETE FROM app_arguments WHERE ballot_rkey = %(b)s "
                 "AND source_type IS DISTINCT FROM 'official'"),
            ]
            for label, stmt in steps:
                count_sql = "SELECT count(*) FROM (" + stmt.replace("DELETE FROM", "SELECT 1 FROM", 1) + ") s"
                cur.execute(count_sql, {"b": ballot_rkey})
                n = cur.fetchone()[0]
                print(f"  {'delete' if execute else 'would delete'} {n:5d}  {label}")
                if execute:
                    cur.execute(stmt, {"b": ballot_rkey})

        if execute:
            conn.commit()
            print("  committed.")
        else:
            conn.rollback()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return crosspost_rkeys


def main():
    ap = argparse.ArgumentParser(description="Reset a ballot to a fresh template.")
    ap.add_argument("--execute", action="store_true", help="Actually delete (default: dry run)")
    args = ap.parse_args()

    ballot_rkey = os.getenv("BALLOT_RKEY", "663")
    db_url = os.getenv("DB_URL", "")
    master_key_b64 = os.getenv("MASTER_KEY_B64", "")
    if not db_url or not master_key_b64:
        sys.exit("ERROR: DB_URL and MASTER_KEY_B64 required (see header).")

    mode = "EXECUTE" if args.execute else "DRY RUN"
    print(f"Reset ballot template — ballot_rkey={ballot_rkey} — PDS={PDS_HOST} — {mode}")

    did, handle, password = load_governance_creds(db_url, ballot_rkey, master_key_b64)
    print(f"Governance account: {handle} ({did})")

    # Postgres first: it resolves the community crosspost rkeys the PDS step needs.
    crosspost_rkeys = reset_postgres(db_url, ballot_rkey, did, args.execute)

    token = create_session(did, password) if args.execute else ""
    if not args.execute:
        # Dry run: we still want PDS counts, but listing is public (no token needed);
        # deletes are skipped inside reset_pds when execute=False.
        pass
    reset_pds(did, token, crosspost_rkeys, args.execute)

    print()
    if args.execute:
        print("Done. Ballot reset to template (official arguments kept).")
    else:
        print("Dry run complete — re-run with --execute to apply.")


if __name__ == "__main__":
    main()
