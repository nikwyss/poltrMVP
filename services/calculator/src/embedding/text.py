"""Per-language text extraction + helpers for embeddings.

Mirrors how the translation worker reads multilingual content
(services/community-writer/src/translation/translator.py): the original
language(s) live in `langs` + the original columns, translations live inline in
the `translations` jsonb. We embed one vector per SUPPORTED_LANGUAGE, using the
same text the user reads in that language.
"""

from __future__ import annotations

import hashlib
import json

from src.core.languages import normalize_lang


def parse_translations(value) -> list:
    """Tolerate asyncpg returning jsonb as a string, or already-parsed lists."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            return []
    return value if isinstance(value, list) else []


def _combine(primary, secondary) -> str:
    p = (primary or "").strip()
    s = (secondary or "").strip()
    if p and s:
        return f"{p}\n\n{s}"
    return p or s


def texts_by_lang(langs, translations, orig_primary, orig_secondary,
                  prim_key: str, sec_key: str) -> dict[str, str]:
    """{canonical_lang: text} for original + every translation.

    `prim_key`/`sec_key` name the translation fields (e.g. 'title'/'body' for
    arguments, 'name'/'introduction' for taxonomy nodes). Language codes are
    canonicalised (bare 'de' → 'de-CH'); the original wins over a translation
    for the same language.
    """
    out: dict[str, str] = {}
    orig = _combine(orig_primary, orig_secondary)
    for lang in (langs or []):
        nl = normalize_lang(lang) if isinstance(lang, str) else None
        if nl and orig:
            out.setdefault(nl, orig)
    for t in parse_translations(translations):
        if not isinstance(t, dict):
            continue
        nl = normalize_lang(t.get("lang"))
        if not nl or nl in out:
            continue
        txt = _combine(t.get(prim_key), t.get(sec_key))
        if txt:
            out[nl] = txt
    return out


def content_hash(model: str, dim: int, text: str) -> str:
    """sha256 over (model, dim, text). Including model+dim forces a re-embed when
    either changes, not just when the text changes."""
    h = hashlib.sha256()
    h.update(model.encode("utf-8"))
    h.update(b"\x00")
    h.update(str(dim).encode("utf-8"))
    h.update(b"\x00")
    h.update(text.encode("utf-8"))
    return h.hexdigest()


def vec_to_pg(vec) -> str:
    """Format a float vector as a pgvector literal: '[0.1,0.2,...]'. Bound as
    text and cast `$n::vector` in SQL — avoids a pgvector codec / extra dep."""
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"
