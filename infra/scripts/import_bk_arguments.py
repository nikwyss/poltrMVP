#!/usr/bin/env python3
"""
One-shot: import the remaining Bundeskanzlei leaflet arguments for ballot 663
from dump/BK_ARGUMENTS.md.

For each argument that does not yet exist in cms.imported_arguments
(matched by title), this script:
  1. Writes an app.ch.poltr.ballot.argument record with sourceOfficial to
     the ballot's governance PDS account.
  2. Inserts a corresponding row into cms.imported_arguments with
     status='published' and pds_uri / pds_cid already populated.

Bypasses the CMS afterChange hook — keeps things deterministic, avoids
any chance of the dev-CMS deadlock, and is idempotent (re-running skips
existing titles).

Required env:
  PDS_HOST           default http://localhost:2583
  CMS_DB_URL         e.g. postgresql://cms:<pw>@localhost:5432/cms
  APPVIEW_DB_URL     e.g. postgresql://appview:<pw>@localhost:5432/appview
  MASTER_KEY_B64     APPVIEW_GOV_CREDS_MASTER_KEY_B64

Optional:
  BALLOT_CMS_ID      default 1
  DOC_REF            default https://swissvotes.ch/attachments/1d7de7af7d1b14b89bb4717aa03c1342b26ba33d37e0269d34c531362598509a
  DRY_RUN            'true' to skip writes
"""

from __future__ import annotations

import base64
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import requests
from nacl import secret as nacl_secret

ARGUMENT_NSID = "app.ch.poltr.ballot.argument"
OFFICIAL_REF = f"{ARGUMENT_NSID}#sourceOfficial"

SECTION_CONTRA = "Argumente der Referendumskomitees"
SECTION_PRO = "Argumente des Bundesrats und Parlaments"

DUMP_PATH = Path(__file__).resolve().parents[2] / "dump" / "BK_ARGUMENTS.md"


# ---------------------------------------------------------------------------
# Markdown parser
# ---------------------------------------------------------------------------


def _clean(text: str) -> str:
    text = text.replace("￾", "")
    # Collapse paragraph-internal newlines into spaces; keep blank lines as
    # paragraph separators.
    paragraphs = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", text)]
    return "\n\n".join(p for p in paragraphs if p).strip()


def parse_dump(path: Path) -> list[dict]:
    """Return [{title, body, type}] in source order."""
    raw = path.read_text(encoding="utf-8")
    raw = raw.replace("￾", "")

    results: list[dict] = []
    current_type: str | None = None  # 'PRO' or 'CONTRA'

    # Tolerate `#CONTRA` (no space) as well as `# PRO`.
    blocks = re.split(r"^(#{1,2})\s*(.+)$", raw, flags=re.MULTILINE)
    # re.split keeps the captured groups: ['', '#', 'CONTRA', body_text, '##', 'Title', body_text, ...]
    i = 1
    while i < len(blocks):
        hashes = blocks[i]
        heading = blocks[i + 1].strip()
        body = blocks[i + 2] if i + 2 < len(blocks) else ""
        i += 3

        if hashes == "#":
            current_type = "PRO" if "PRO" in heading.upper() else "CONTRA"
            continue

        if hashes == "##" and current_type:
            results.append(
                {
                    "type": current_type,
                    "title": _clean(heading),
                    "body": _clean(body),
                }
            )
    return results


# ---------------------------------------------------------------------------
# PDS / DB helpers
# ---------------------------------------------------------------------------


def env(name: str, default: str | None = None) -> str:
    val = os.getenv(name, default)
    if val is None:
        print(f"ERROR: env var {name} is required", file=sys.stderr)
        sys.exit(2)
    return val


def decrypt(ciphertext: bytes, nonce: bytes, master_key_b64: str) -> str:
    key = base64.b64decode(master_key_b64)
    if len(key) != 32:
        raise RuntimeError("MASTER_KEY_B64 must decode to 32 bytes")
    return nacl_secret.SecretBox(key).decrypt(ciphertext, nonce).decode("utf-8")


def load_governance(
    appview_db_url: str, ballot_rkey: str, master_key_b64: str
) -> tuple[str, str]:
    conn = psycopg2.connect(appview_db_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT did, pw_ciphertext, pw_nonce FROM auth.governance_accounts WHERE ballot_rkey = %s",
                (ballot_rkey,),
            )
            row = cur.fetchone()
            if not row:
                raise RuntimeError(
                    f"No governance account for ballot rkey {ballot_rkey}"
                )
            did, pw_ct, pw_nonce = row
            return did, decrypt(bytes(pw_ct), bytes(pw_nonce), master_key_b64)
    finally:
        conn.close()


def create_session(pds_host: str, did: str, password: str) -> str:
    resp = requests.post(
        f"{pds_host}/xrpc/com.atproto.server.createSession",
        json={"identifier": did, "password": password},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["accessJwt"]


def create_record(pds_host: str, did: str, jwt: str, record: dict) -> dict:
    resp = requests.post(
        f"{pds_host}/xrpc/com.atproto.repo.createRecord",
        headers={"Authorization": f"Bearer {jwt}", "Content-Type": "application/json"},
        json={"repo": did, "collection": ARGUMENT_NSID, "record": record},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    pds_host = os.getenv("PDS_HOST", "http://localhost:2583")
    cms_db_url = env("CMS_DB_URL")
    appview_db_url = env("APPVIEW_DB_URL")
    master_key_b64 = env("MASTER_KEY_B64")
    ballot_cms_id = int(os.getenv("BALLOT_CMS_ID", "1"))
    doc_ref = os.getenv(
        "DOC_REF",
        "https://swissvotes.ch/attachments/"
        "1d7de7af7d1b14b89bb4717aa03c1342b26ba33d37e0269d34c531362598509a",
    )
    dry_run = os.getenv("DRY_RUN", "false").lower() == "true"

    # Resolve ballot rkey from CMS DB
    cms_conn = psycopg2.connect(cms_db_url)
    try:
        with cms_conn.cursor() as cur:
            cur.execute("SELECT rkey FROM ballots WHERE id = %s", (ballot_cms_id,))
            row = cur.fetchone()
            if not row:
                raise RuntimeError(f"Ballot id={ballot_cms_id} not found in CMS DB")
            ballot_rkey = row[0]

            cur.execute(
                """
                SELECT lower(l.title)
                FROM imported_arguments a
                JOIN imported_arguments_locales l
                  ON l._parent_id = a.id AND l._locale = 'de'
                WHERE a.ballot_id = %s
                """,
                (ballot_cms_id,),
            )
            existing_titles = {r[0] for r in cur.fetchall()}
    finally:
        cms_conn.close()

    print(f"Ballot id={ballot_cms_id}, rkey={ballot_rkey}")
    print(f"Already imported: {len(existing_titles)} title(s)")

    # Governance creds (from appview DB)
    gov_did, gov_pw = load_governance(appview_db_url, ballot_rkey, master_key_b64)

    # Parse markdown
    arguments = parse_dump(DUMP_PATH)
    print(f"Parsed {len(arguments)} argument(s) from {DUMP_PATH.name}")

    # Filter out already-imported
    todo = [a for a in arguments if a["title"].lower() not in existing_titles]
    print(f"To import: {len(todo)}")
    if not todo:
        print("Nothing to do.")
        return 0

    # PDS session
    jwt = None if dry_run else create_session(pds_host, gov_did, gov_pw)

    cms_conn = psycopg2.connect(cms_db_url)
    cms_conn.autocommit = False
    n_done = 0
    try:
        for arg in todo:
            section = SECTION_CONTRA if arg["type"] == "CONTRA" else SECTION_PRO

            record = {
                "$type": ARGUMENT_NSID,
                "title": arg["title"],
                "body": arg["body"],
                "type": arg["type"],
                "ballot": ballot_rkey,
                # Origin language of title/body (BCP-47) — official Bundeskanzlei
                # content is Swiss German by default. Keeps the record self-describing.
                "langs": [os.getenv("POLTR_DEFAULT_LANGUAGE", "de-CH")],
                "createdAt": datetime.now(timezone.utc)
                .isoformat()
                .replace("+00:00", "Z"),
                "source": {
                    "$type": OFFICIAL_REF,
                    "documentRef": doc_ref,
                    "section": section,
                },
            }

            if dry_run:
                print(f"  [dry-run] would publish {arg['type']}: {arg['title']!r}")
                continue

            # 1. Write to PDS
            res = create_record(pds_host, gov_did, jwt, record)
            uri, cid = res["uri"], res["cid"]

            # 2. Insert into CMS DB. Title/body live in the localized side
            # table (Payload localization) keyed by (_parent_id, _locale).
            with cms_conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO imported_arguments
                      (ballot_id, source_type, type, document_ref, section,
                       status, pds_uri, pds_cid, origin_language,
                       created_at, updated_at)
                    VALUES (%s, 'official', %s, %s, %s, 'published',
                            %s, %s, 'de', now(), now())
                    RETURNING id
                    """,
                    (
                        ballot_cms_id,
                        arg["type"],
                        doc_ref,
                        section,
                        uri,
                        cid,
                    ),
                )
                new_id = cur.fetchone()[0]
                cur.execute(
                    """
                    INSERT INTO imported_arguments_locales
                      (title, body, _locale, _parent_id)
                    VALUES (%s, %s, 'de', %s)
                    """,
                    (arg["title"], arg["body"], new_id),
                )
            cms_conn.commit()
            n_done += 1
            print(f"  ✓ {arg['type']:6s} {arg['title']!r} → {uri}")
    except Exception:
        cms_conn.rollback()
        raise
    finally:
        cms_conn.close()

    print(f"\nDone. Imported {n_done} of {len(todo)} argument(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
