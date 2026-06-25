"""
XRPC route for ballot-wide search: ballot.search.

Searches three content types *within a single ballot* and *only in the caller's
current language*:

  - taxonomy nodes ("Themen")  — name + introduction
  - arguments      ("Argumente") — title + body
  - comments       ("Kommentare") — title + text

The results carry exactly the fields each frontend overlay needs to open
(taxonomy → key/topic, argument → rkey, comment → uri).

Language semantics (strict "current language only"): a row matches when
  (a) the requested lang is in the row's original `langs` and the original text
      matches, OR
  (b) a translation for the requested lang exists and matches (inline
      `translations` JSONB for arguments/taxonomy, sidecar
      `app_comment_translations` for comments).
Content that only exists via a fallback language (e.g. a German-only argument
shown to a French user via fallback) is intentionally NOT found.

Search is a plain ILIKE scan. Every query is filtered by `ballot_rkey` (indexed)
so the candidate set is one ballot's worth of rows (hundreds to low thousands) —
a sequential scan is negligible. No pg_trgm / tsvector index is warranted at this
scale; if a ballot ever grows past tens of thousands of searchable rows, the
upgrade path is a `tsvector` column + `websearch_to_tsquery`, not trigram.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse

from src.auth.middleware import TSession, verify_session_token
from src.core.db import get_pool
from src.core.fastapi import logger
from src.core.languages import DEFAULT_LANGUAGE
from src.core.lib import get_string
from src.routes.deliberation._lang import (
    pick_node_translation,
    pick_translation,
    resolve_requested_lang,
)

router = APIRouter(prefix="/xrpc", tags=["poltr-search"])


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------


def _ilike_term(q: str) -> str:
    """Build a safe ILIKE pattern. Escapes the ESCAPE char and the wildcards
    so a query like `50%` or `a_b` matches literally, then wraps in `%…%`.
    Used everywhere with `ILIKE $N ESCAPE '\\'`."""
    esc = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{esc}%"


def _snippet(text: Optional[str], q: str, radius: int = 60) -> str:
    """Plaintext excerpt around the first case-insensitive occurrence of `q`.

    Returns a window of ~`radius` chars on each side of the match with `…`
    markers where truncated, whitespace collapsed. If `q` isn't in `text`
    (the match was in the sibling field), returns a leading slice instead.
    No HTML — the frontend highlights client-side.
    """
    if not text:
        return ""
    flat = " ".join(text.split())
    if not flat:
        return ""
    idx = flat.lower().find(q.strip().lower())
    if idx < 0:
        head = flat[: radius * 2]
        return head + ("…" if len(flat) > len(head) else "")
    start = max(0, idx - radius)
    end = min(len(flat), idx + len(q.strip()) + radius)
    out = flat[start:end]
    if start > 0:
        out = "…" + out
    if end < len(flat):
        out = out + "…"
    return out


def _normalize_translations(raw) -> list:
    """asyncpg may hand back JSONB as a parsed list or a JSON string. Normalize
    to a list (mirrors the argument serializer's handling)."""
    if isinstance(raw, str):
        import json

        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            return []
    return raw if isinstance(raw, list) else []


def _match_field(q: str, primary: str, secondary: str) -> str:
    """Pick which field drove the (already-confirmed) match: primary wins."""
    needle = q.strip().lower()
    if primary and needle in primary.lower():
        return "primary"
    if secondary and needle in secondary.lower():
        return "secondary"
    return "primary"


# -----------------------------------------------------------------------------
# SQL (one ballot's rows, current-language-only matching)
# -----------------------------------------------------------------------------

# $1 = ballot_rkey, $2 = ilike pattern, $3 = requested_lang, $4 = limit
_ARG_SQL = r"""
    SELECT a.uri, a.rkey, a.type, a.title, a.body, a.langs, a.translations,
           a.like_count,
           (CASE
              WHEN ($3 = ANY(a.langs) AND a.title ILIKE $2 ESCAPE '\')
                OR EXISTS (
                     SELECT 1 FROM jsonb_array_elements(COALESCE(a.translations,'[]'::jsonb)) e
                     WHERE e->>'lang' = $3 AND e->>'title' ILIKE $2 ESCAPE '\')
              THEN 0 ELSE 1 END) AS match_rank
    FROM app_arguments a
    WHERE a.ballot_rkey = $1
      AND NOT a.deleted
      AND (
            ( $3 = ANY(a.langs) AND (a.title ILIKE $2 ESCAPE '\' OR a.body ILIKE $2 ESCAPE '\') )
         OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(a.translations,'[]'::jsonb)) e
              WHERE e->>'lang' = $3
                AND (e->>'title' ILIKE $2 ESCAPE '\' OR e->>'body' ILIKE $2 ESCAPE '\')
            )
          )
    ORDER BY match_rank, a.like_count DESC NULLS LAST, a.created_at DESC
    LIMIT $4;
"""

# $1 = ballot_rkey, $2 = ilike pattern, $3 = requested_lang, $4 = limit
_TAX_SQL = r"""
    SELECT n.id, n.key, n.name, n.introduction, n.langs, n.translations,
           n.importance, n.depth,
           (CASE
              WHEN ($3 = ANY(n.langs) AND n.name ILIKE $2 ESCAPE '\')
                OR EXISTS (
                     SELECT 1 FROM jsonb_array_elements(COALESCE(n.translations,'[]'::jsonb)) e
                     WHERE e->>'lang' = $3 AND e->>'name' ILIKE $2 ESCAPE '\')
              THEN 0 ELSE 1 END) AS match_rank
    FROM app_taxonomy_node n
    WHERE n.ballot_rkey = $1
      AND n.parent_id IS NOT NULL
      AND (
            ( $3 = ANY(n.langs) AND (n.name ILIKE $2 ESCAPE '\' OR n.introduction ILIKE $2 ESCAPE '\') )
         OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(n.translations,'[]'::jsonb)) e
              WHERE e->>'lang' = $3
                AND (e->>'name' ILIKE $2 ESCAPE '\' OR e->>'introduction' ILIKE $2 ESCAPE '\')
            )
          )
    ORDER BY match_rank, n.importance DESC NULLS LAST, n.depth, n.id
    LIMIT $4;
"""

# $1 = ballot_rkey, $2 = ilike pattern, $3 = requested_lang, $4 = limit
_COM_SQL = r"""
    SELECT c.uri, c.argument_uri, c.title, c.text, c.langs, c.origin,
           c.created_at, ct.body AS t_body,
           (CASE WHEN ($3 = ANY(c.langs)
                       AND (c.title ILIKE $2 ESCAPE '\' OR c.text ILIKE $2 ESCAPE '\'))
                 THEN 0 ELSE 1 END) AS match_rank
    FROM app_comments c
    LEFT JOIN app_comment_translations ct
      ON ct.subject_uri = c.uri AND ct.lang = $3 AND NOT ct.deleted
    WHERE c.ballot_rkey = $1
      AND NOT c.deleted
      AND (
            ( $3 = ANY(c.langs) AND (c.title ILIKE $2 ESCAPE '\' OR c.text ILIKE $2 ESCAPE '\') )
         OR ( ct.body IS NOT NULL AND ct.body ILIKE $2 ESCAPE '\' )
          )
    ORDER BY match_rank, c.created_at DESC
    LIMIT $4;
"""


# -----------------------------------------------------------------------------
# Serializers — each turns a row into an overlay-openable result item.
# -----------------------------------------------------------------------------


def _serialize_argument(row: dict, q: str, lang: str) -> dict:
    langs = row.get("langs") if isinstance(row.get("langs"), list) else [DEFAULT_LANGUAGE]
    localized = pick_translation(
        langs=langs,
        translations=_normalize_translations(row.get("translations")),
        title=get_string(row, "title"),
        body=get_string(row, "body"),
        requested=lang,
    )
    title, body = localized["title"], localized["body"]
    which = _match_field(q, title, body)
    snippet = _snippet(title if which == "primary" else body, q)
    return {
        "type": "argument",
        "rkey": get_string(row, "rkey") or "",
        "uri": get_string(row, "uri") or "",
        "argType": get_string(row, "type"),
        "title": title,
        "snippet": snippet,
        "matchField": "title" if which == "primary" else "body",
    }


def _serialize_taxonomy(row: dict, q: str, lang: str) -> dict:
    langs = row.get("langs") if isinstance(row.get("langs"), list) else [DEFAULT_LANGUAGE]
    localized = pick_node_translation(
        langs=langs,
        translations=_normalize_translations(row.get("translations")),
        name=get_string(row, "name"),
        introduction=get_string(row, "introduction"),
        requested=lang,
    )
    name, intro = localized["name"], localized["introduction"]
    which = _match_field(q, name, intro)
    snippet = _snippet(name if which == "primary" else intro, q)
    return {
        "type": "taxonomy",
        "ballotRkey": None,  # filled by caller (it knows ballot_rkey)
        "topic": get_string(row, "key") or "",
        "title": name,
        "snippet": snippet,
        "matchField": "name" if which == "primary" else "introduction",
    }


def _serialize_comment(row: dict, q: str, lang: str) -> dict:
    langs = row.get("langs") if isinstance(row.get("langs"), list) else [DEFAULT_LANGUAGE]
    title = get_string(row, "title") or ""
    # Display body: original when the requested lang is original, else the
    # sidecar translation. (Comments have no translated title.)
    if lang in (langs or []):
        body = get_string(row, "text") or ""
    else:
        body = get_string(row, "t_body") or get_string(row, "text") or ""
    which = _match_field(q, title, body)
    snippet = _snippet(title if which == "primary" else body, q)
    return {
        "type": "comment",
        "uri": get_string(row, "uri") or "",
        "argumentUri": get_string(row, "argument_uri"),
        "title": title,
        "snippet": snippet,
        "matchField": "title" if which == "primary" else "text",
    }


# -----------------------------------------------------------------------------
# app.ch.poltr.ballot.search
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.ballot.search")
async def ballot_search(
    request: Request,
    ballot_rkey: str = Query(...),
    q: str = Query(..., min_length=1),
    type: Optional[str] = Query(
        None, description="Restrict to one group: 'taxonomy' | 'argument' | 'comment'."
    ),
    limit: int = Query(8, ge=1, le=25, description="Max results per type group."),
    lang: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None),
    session: TSession = Depends(verify_session_token),
):
    """Search taxonomy nodes, arguments and comments within one ballot,
    restricted to the caller's current language."""
    requested_lang = resolve_requested_lang(lang, accept_language)

    empty = {
        "query": q,
        "lang": requested_lang,
        "results": {"taxonomy": [], "argument": [], "comment": []},
        "counts": {"taxonomy": 0, "argument": 0, "comment": 0},
    }
    if not q.strip():
        return JSONResponse(status_code=200, content=empty)

    pattern = _ilike_term(q)
    want = {type} if type in ("taxonomy", "argument", "comment") else {
        "taxonomy",
        "argument",
        "comment",
    }
    params = [ballot_rkey, pattern, requested_lang, limit]

    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            tax_rows = await conn.fetch(_TAX_SQL, *params) if "taxonomy" in want else []
            arg_rows = await conn.fetch(_ARG_SQL, *params) if "argument" in want else []
            com_rows = await conn.fetch(_COM_SQL, *params) if "comment" in want else []

        taxonomy = [_serialize_taxonomy(dict(r), q, requested_lang) for r in tax_rows]
        for t in taxonomy:
            t["ballotRkey"] = ballot_rkey
        arguments = [_serialize_argument(dict(r), q, requested_lang) for r in arg_rows]
        comments = [_serialize_comment(dict(r), q, requested_lang) for r in com_rows]

        return JSONResponse(
            status_code=200,
            content={
                "query": q,
                "lang": requested_lang,
                "results": {
                    "taxonomy": taxonomy,
                    "argument": arguments,
                    "comment": comments,
                },
                "counts": {
                    "taxonomy": len(taxonomy),
                    "argument": len(arguments),
                    "comment": len(comments),
                },
            },
        )
    except Exception as err:
        logger.error(f"Search query failed: {err}")
        return JSONResponse(
            status_code=500, content={"error": "internal_error", "details": str(err)}
        )
