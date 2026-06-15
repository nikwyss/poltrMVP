"""
XRPC routes for arguments: argument.list, argument.get, argument.create.

Arguments are ATProto records living on ballot-specific governance accounts,
indexed into app_arguments. The (title, body) pair is multilingual: original
languages live in `langs`/`title`/`body`; further translations are inline in
`translations` and resolved at read time via _lang.pick_translation().
"""

import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse

from src.atproto.governance import create_governance_record, get_did_for_ballot
from src.auth.middleware import TSession, verify_session_token
from src.core.db import get_pool
from src.core.fastapi import logger, limiter
from src.core.languages import DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES_SET
from src.core.lib import get_date_iso, get_number, get_string
from src.routes.deliberation._lang import pick_translation, resolve_requested_lang
from src.routes.deliberation.quota import QuotaExceeded, release, reserve, set_uri

router = APIRouter(prefix="/xrpc", tags=["poltr-arguments"])


# -----------------------------------------------------------------------------
# Argument row → JSON serialization (shared by argument.list and argument.get)
# -----------------------------------------------------------------------------


def _serialize_argument_row(row: dict, peer_review_on: bool, requested_lang: str) -> dict:
    """Convert a row from app_arguments (joined with profile + viewer_like)
    into the API argument shape, with title/body localized to `requested_lang`.
    """
    source_type = get_string(row, "source_type") or "user"
    if source_type == "official":
        source_obj_raw = {
            "$type": "app.ch.poltr.ballot.argument#sourceOfficial",
            "documentRef": get_string(row, "source_doc_ref"),
            "section": get_string(row, "source_section"),
        }
    elif source_type == "organization":
        source_obj_raw = {
            "$type": "app.ch.poltr.ballot.argument#sourceOrganization",
            "orgKey": get_string(row, "source_org_key"),
            "documentRef": get_string(row, "source_doc_ref"),
            "verifiedDid": get_string(row, "source_verified_did"),
        }
    else:
        source_obj_raw = {
            "$type": "app.ch.poltr.ballot.argument#sourceUser",
            "authorDid": get_string(row, "author_did"),
        }
    source_obj = {k: v for k, v in source_obj_raw.items() if v is not None}

    # JSONB translations come back as a parsed list/dict from asyncpg if a custom
    # codec is registered; otherwise as a JSON string. Normalize either case.
    raw_translations = row.get("translations")
    if isinstance(raw_translations, str):
        try:
            raw_translations = json.loads(raw_translations)
        except (TypeError, ValueError):
            raw_translations = []
    if not isinstance(raw_translations, list):
        raw_translations = []

    langs = row.get("langs")
    if not isinstance(langs, list) or not langs:
        langs = [DEFAULT_LANGUAGE]

    localized = pick_translation(
        langs=langs,
        translations=raw_translations,
        title=get_string(row, "title"),
        body=get_string(row, "body"),
        requested=requested_lang,
    )

    record_raw = {
        "$type": "app.ch.poltr.ballot.argument",
        "title": localized["title"],
        "body": localized["body"],
        "type": get_string(row, "type"),
        "ballot": get_string(row, "ballot_uri"),
        "createdAt": get_date_iso(row, "created_at"),
        "source": source_obj,
        "langs": localized["langs"],
    }
    if "translatedFrom" in localized:
        record_raw["translatedFrom"] = localized["translatedFrom"]
        record_raw["translationSource"] = localized["translationSource"]
    record = {k: v for k, v in record_raw.items() if v is not None}

    viewer_obj = {}
    if row.get("viewer_like"):
        viewer_obj["like"] = row["viewer_like"]
    viewer_preference = row.get("viewer_preference")
    if viewer_preference is not None:
        viewer_obj["preference"] = get_number(row, "viewer_preference")

    if source_type == "user":
        author_raw = {
            "did": get_string(row, "author_did") or "",
            "displayName": get_string(row, "author_display_name"),
            "canton": get_string(row, "author_canton"),
            "color": get_string(row, "author_color"),
        }
        author = {k: v for k, v in author_raw.items() if v is not None}
    else:
        author = None

    arg_raw = {
        "uri": get_string(row, "uri") or "",
        "cid": get_string(row, "cid") or "",
        "record": record,
        "author": author,
        "likeCount": get_number(row, "like_count"),
        "commentCount": get_number(row, "comment_count"),
        # Official arguments are curated content and never go through peer
        # review, so they carry no review status regardless of what the DB
        # stored (the column is NOT NULL, so the indexer seeds 'approved').
        "peerreviewStatus": (
            get_string(row, "peerreview_status")
            if peer_review_on and source_type != "official"
            else None
        ),
        "indexedAt": get_date_iso(row, "indexed_at"),
        "viewer": viewer_obj if viewer_obj else None,
        # Mirror the localization metadata at the top level so the Frontend
        # doesn't have to dig into `record` to render language badges.
        "availableLangs": localized.get("availableLangs"),
        "translationSource": localized.get("translationSource"),
    }
    return {k: v for k, v in arg_raw.items() if v is not None}


# -----------------------------------------------------------------------------
# app.ch.poltr.argument.list
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.argument.list")
async def list_arguments(
    request: Request,
    ballot_rkey: str = Query(...),
    sort: str = Query("random"),
    type: Optional[str] = Query(None),
    source: Optional[str] = Query(
        None,
        description="Filter by argument source: 'user', 'official', 'organization' or 'all' (default).",
    ),
    limit: int = Query(100),
    lang: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None),
    session: TSession = Depends(verify_session_token),
):
    """List arguments for a ballot, localized to the requested language."""
    requested_lang = resolve_requested_lang(lang, accept_language)
    params = [ballot_rkey]

    viewer_did = session.did if session else None
    peer_review_on = os.getenv("APPVIEW_PEER_REVIEW_ENABLED", "false").lower() == "true"

    # Type filter
    type_filter = ""
    if type in ("PRO", "CONTRA"):
        params.append(type)
        type_filter = f"AND a.type = ${len(params)}"

    # Source filter
    source_filter = ""
    if source in ("user", "official", "organization"):
        params.append(source)
        source_filter = f"AND a.source_type = ${len(params)}"

    # Peer-review filter: even rejected arguments are shown to everyone — the
    # frontend renders a distinct red "rejected" badge so they are visually
    # marked instead of hidden. When peer review is disabled, show all.
    if viewer_did:
        params.append(viewer_did)
        viewer_param = f"${len(params)}"
        viewer_select = f""",
            (
                SELECT uri FROM app_likes
                WHERE subject_uri = a.uri AND did = {viewer_param} AND NOT deleted
                LIMIT 1
            ) AS viewer_like,
            (
                SELECT preference FROM app_likes
                WHERE subject_uri = a.uri AND did = {viewer_param} AND NOT deleted
                LIMIT 1
            ) AS viewer_preference"""
    else:
        viewer_select = ",\n            NULL AS viewer_like,\n            NULL AS viewer_preference"
    review_filter = ""

    # Sort order. Explicit sorts run in SQL; the default ("random") is a stable
    # per-user shuffle applied in Python (see below) so each user gets their own
    # fixed ordering that never reshuffles when arguments are added.
    sort_map = {
        "top": "a.like_count DESC",
        "new": "a.created_at DESC",
        "discussed": "a.comment_count DESC",
    }
    seeded_shuffle = sort not in sort_map
    if seeded_shuffle:
        order_by = "a.created_at ASC, a.uri"
        limit_clause = ""
    else:
        order_by = sort_map[sort]
        params.append(limit)
        limit_clause = f"LIMIT ${len(params)}"

    sql = f"""
        SELECT a.*,
               p.display_name AS author_display_name,
               p.canton AS author_canton,
               p.color AS author_color
               {viewer_select}
        FROM app_arguments a
        LEFT JOIN app_profiles p ON p.did = a.author_did
        WHERE a.ballot_rkey = $1 AND NOT a.deleted
          {type_filter}
          {source_filter}
          {review_filter}
        ORDER BY {order_by}
        {limit_clause};
    """

    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)

        arguments = [
            _serialize_argument_row(dict(r), peer_review_on, requested_lang) for r in rows
        ]

        if seeded_shuffle:
            seed = viewer_did or ""
            arguments.sort(
                key=lambda a: hashlib.md5(
                    f"{seed}:{a['uri']}".encode()
                ).hexdigest()
            )
            arguments = arguments[:limit]

        return JSONResponse(status_code=200, content={"arguments": arguments})
    except Exception as err:
        logger.error(f"DB query failed: {err}")
        return JSONResponse(
            status_code=500, content={"error": "internal_error", "details": str(err)}
        )


# -----------------------------------------------------------------------------
# app.ch.poltr.argument.get
# -----------------------------------------------------------------------------

# Topic-Breadcrumbs: für ein Argument alle Knoten (app_taxonomy_membership), an
# denen es hängt, samt deren Pfad zur Wurzel (rekursiv über parent_id). Sortiert
# je Blatt nach Tiefe → Wurzel zuerst. Die Wurzel (parent_id IS NULL) = Ballot
# und wird beim Pfadbau weggelassen.
_TOPIC_PATH_SQL = """
    WITH RECURSIVE memb AS (
        SELECT DISTINCT n.id, n.parent_id, n.key, n.name, n.description, n.depth
        FROM app_taxonomy_membership m
        JOIN app_taxonomy_node n ON n.id = m.node_id
        WHERE m.argument_uri = $1
    ),
    anc AS (
        SELECT id AS leaf_id, id, parent_id, key, name, description, depth FROM memb
        UNION ALL
        SELECT a.leaf_id, p.id, p.parent_id, p.key, p.name, p.description, p.depth
        FROM anc a JOIN app_taxonomy_node p ON p.id = a.parent_id
    )
    SELECT leaf_id, id, parent_id, key, name, description, depth
    FROM anc
    ORDER BY leaf_id, depth;
"""


def _build_topic_paths(path_rows: list) -> list:
    """Baut aus den (leaf_id, id, …, depth)-Zeilen die Breadcrumb-Pfade: je Blatt
    ein Pfad Wurzel→Blatt (Wurzel ausgelassen) als [{name, key, description}].
    Präfix-Pfade werden zusammengefasst — nur die maximalen (tiefsten) bleiben."""
    # leaf_id → geordnete Knotenliste (nach depth), Wurzel (parent_id None) raus.
    by_leaf: dict = {}
    for r in path_rows:
        by_leaf.setdefault(r["leaf_id"], []).append(r)
    paths: list[list[dict]] = []
    id_seqs: list[tuple] = []
    for leaf_id, rows in by_leaf.items():
        rows = sorted(rows, key=lambda r: r["depth"])
        segs = [
            {"name": r["name"], "key": r["key"], "description": r["description"]}
            for r in rows
            if r["parent_id"] is not None
        ]
        if not segs:
            continue
        paths.append(segs)
        id_seqs.append(tuple(r["id"] for r in rows if r["parent_id"] is not None))

    # Präfix-Dedup: einen Pfad weglassen, wenn seine id-Folge echtes Präfix eines
    # anderen ist (Member von Vorfahr UND Nachfahr → nur tiefsten zeigen).
    keep: list[list[dict]] = []
    for i, seq in enumerate(id_seqs):
        is_prefix = any(
            j != i and len(other) > len(seq) and other[: len(seq)] == seq
            for j, other in enumerate(id_seqs)
        )
        if not is_prefix:
            keep.append(paths[i])
    return keep


@router.get("/app.ch.poltr.argument.get")
async def get_argument(
    request: Request,
    ballot_rkey: str = Query(...),
    rkey: str = Query(...),
    lang: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None),
    session: TSession = Depends(verify_session_token),
):
    """Fetch a single argument by (ballot_rkey, rkey), localized to the requested language."""
    requested_lang = resolve_requested_lang(lang, accept_language)
    viewer_did = session.did if session else None
    peer_review_on = os.getenv("APPVIEW_PEER_REVIEW_ENABLED", "false").lower() == "true"

    params: list = [ballot_rkey, rkey]
    if viewer_did:
        params.append(viewer_did)
        viewer_param = f"${len(params)}"
        viewer_select = f""",
            (
                SELECT uri FROM app_likes
                WHERE subject_uri = a.uri AND did = {viewer_param} AND NOT deleted
                LIMIT 1
            ) AS viewer_like,
            (
                SELECT preference FROM app_likes
                WHERE subject_uri = a.uri AND did = {viewer_param} AND NOT deleted
                LIMIT 1
            ) AS viewer_preference"""
    else:
        viewer_select = ",\n            NULL AS viewer_like,\n            NULL AS viewer_preference"

    sql = f"""
        SELECT a.*,
               p.display_name AS author_display_name,
               p.canton AS author_canton,
               p.color AS author_color
               {viewer_select}
        FROM app_arguments a
        LEFT JOIN app_profiles p ON p.did = a.author_did
        WHERE a.ballot_rkey = $1 AND a.rkey = $2 AND NOT a.deleted
        LIMIT 1;
    """

    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(sql, *params)
            if row is None:
                return JSONResponse(
                    status_code=404,
                    content={"error": "not_found", "message": "Argument not found"},
                )
            # Topic-Breadcrumbs: alle Knoten, an denen das Argument hängt, je mit
            # Pfad zur Wurzel (für die Taxonomie-Anzeige auf der Detailseite).
            path_rows = await conn.fetch(_TOPIC_PATH_SQL, row["uri"])

        argument = _serialize_argument_row(dict(row), peer_review_on, requested_lang)
        topic_paths = _build_topic_paths(path_rows)
        if topic_paths:
            argument["topicPaths"] = topic_paths
        return JSONResponse(status_code=200, content={"argument": argument})
    except Exception as err:
        logger.error(f"DB query failed: {err}")
        return JSONResponse(
            status_code=500, content={"error": "internal_error", "details": str(err)}
        )


# -----------------------------------------------------------------------------
# app.ch.poltr.argument.create
# -----------------------------------------------------------------------------


@router.post("/app.ch.poltr.argument.create")
@limiter.limit("6/minute")
async def create_argument(
    request: Request,
    session: TSession = Depends(verify_session_token),
):
    """Create an argument record on the PDS.

    Accepts an optional `langs` array (BCP-47 codes) in the body — defaults to
    [DEFAULT_LANGUAGE] when absent. Filtered against SUPPORTED_LANGUAGES_SET.
    """
    body = await request.json()
    ballot_id = body.get("ballot")
    title = body.get("title", "")
    arg_body = body.get("body", "")
    arg_type = body.get("type")

    raw_langs = body.get("langs")
    if isinstance(raw_langs, list):
        langs = [l for l in raw_langs if isinstance(l, str) and l in SUPPORTED_LANGUAGES_SET]
    elif isinstance(raw_langs, str) and raw_langs in SUPPORTED_LANGUAGES_SET:
        langs = [raw_langs]
    else:
        langs = [DEFAULT_LANGUAGE]
    if not langs:
        langs = [DEFAULT_LANGUAGE]

    if not ballot_id:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "message": "ballot ID required"},
        )
    if arg_type not in ("PRO", "CONTRA"):
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_request",
                "message": "type must be PRO or CONTRA",
            },
        )
    if not title or not arg_body:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "message": "title and body required"},
        )

    # Look up the governance DID for this ballot (via ballot_rkey = CMS ID)
    gov_did = await get_did_for_ballot(str(ballot_id))
    if not gov_did:
        return JSONResponse(
            status_code=404,
            content={
                "error": "not_found",
                "message": "No governance account for this ballot",
            },
        )

    # Enforce per-(user, ballot) creation quota (daily + lifetime). Reserve a
    # ledger slot now; release it below if the PDS write fails.
    try:
        reservation_id = await reserve(session.did, "argument", str(ballot_id))
    except QuotaExceeded as q:
        return q.response()

    record = {
        "$type": "app.ch.poltr.ballot.argument",
        "title": title,
        "body": arg_body,
        "type": arg_type,
        "ballot": ballot_id,
        "langs": langs,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "$type": "app.ch.poltr.ballot.argument#sourceUser",
            "authorDid": session.did,
        },
    }

    # PDS failures raise PDSError → handled centrally (see core/fastapi.py).
    # Release the reserved quota slot if the write fails, then re-raise.
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            result = await create_governance_record(
                client, gov_did, "app.ch.poltr.ballot.argument", record
            )
    except Exception:
        await release(reservation_id)
        raise

    await set_uri(reservation_id, result.get("uri"))
    return JSONResponse(status_code=200, content=result)
