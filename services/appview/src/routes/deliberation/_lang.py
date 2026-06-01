"""
Helpers for lang-aware serialization of arguments and comments.

A record has an original-language pair (`title`, `body`) plus a `translations`
array. When the caller asks for `?lang=fr`:

 - if `fr` is in the record's `langs` (original) → return the row's title/body
 - else if a `translations` entry exists for `fr` → return that
 - else fall back to default → then to the row's original
"""

from typing import Optional

from fastapi import Header, Query

from src.core.languages import DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES_SET


def resolve_requested_lang(
    lang_query: Optional[str] = Query(None, alias="lang"),
    accept_language: Optional[str] = Header(None),
) -> str:
    """Pick the language the caller wants this response in.

    Precedence: explicit `?lang=` query → first valid entry of Accept-Language
    → DEFAULT_LANGUAGE. Codes not in SUPPORTED_LANGUAGES_SET are ignored.
    """
    if lang_query and lang_query in SUPPORTED_LANGUAGES_SET:
        return lang_query
    if accept_language:
        # Cheap parse: take the first comma-separated entry, strip quality/q=…
        for raw in accept_language.split(","):
            code = raw.split(";", 1)[0].strip().lower()
            # Truncate region tags like 'de-CH' → 'de'.
            base = code.split("-", 1)[0]
            if base in SUPPORTED_LANGUAGES_SET:
                return base
    return DEFAULT_LANGUAGE


def pick_translation(
    langs: Optional[list],
    translations: Optional[list],
    title: Optional[str],
    body: Optional[str],
    requested: str,
) -> dict:
    """Return the title/body pair for the requested language plus metadata.

    Output keys:
      title, body                      — text to render
      langs                            — original-language list
      availableLangs                   — union of langs + translation.lang values
      translatedFrom (optional)        — original lang code if the text is translated
      translationSource (optional)     — 'manual' | 'ai' if translated
    """
    origin = list(langs or [DEFAULT_LANGUAGE])
    tx_list = list(translations or [])

    available: list[str] = []
    seen: set[str] = set()
    for l in origin:
        if l and l not in seen:
            available.append(l)
            seen.add(l)
    for t in tx_list:
        if isinstance(t, dict):
            l = t.get("lang")
            if isinstance(l, str) and l not in seen:
                available.append(l)
                seen.add(l)

    out: dict = {
        "title": title or "",
        "body": body or "",
        "langs": origin,
        "availableLangs": available,
    }

    # Already in the requested language → return original verbatim.
    if requested in origin:
        return out

    # Look for an explicit translation.
    for t in tx_list:
        if isinstance(t, dict) and t.get("lang") == requested:
            tx_title = t.get("title")
            tx_body = t.get("body")
            if tx_title and tx_body:
                return {
                    "title": tx_title,
                    "body": tx_body,
                    "langs": origin,
                    "availableLangs": available,
                    "translatedFrom": origin[0] if origin else DEFAULT_LANGUAGE,
                    "translationSource": t.get("source") or "manual",
                }

    # Fallback: DEFAULT_LANGUAGE translation if requested was something else.
    if requested != DEFAULT_LANGUAGE:
        for t in tx_list:
            if isinstance(t, dict) and t.get("lang") == DEFAULT_LANGUAGE:
                tx_title = t.get("title")
                tx_body = t.get("body")
                if tx_title and tx_body:
                    return {
                        "title": tx_title,
                        "body": tx_body,
                        "langs": origin,
                        "availableLangs": available,
                        "translatedFrom": origin[0] if origin else DEFAULT_LANGUAGE,
                        "translationSource": t.get("source") or "manual",
                    }

    # Final fallback: original text (no requested-language coverage).
    return out
