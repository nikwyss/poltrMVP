"""Supported content languages for POLTR records.

Single source of truth for the language codes accepted by the AppView
(BCP-47 short codes). Read from `POLTR_LANGUAGES` env var so the set can be
extended without code changes — adding a sixth language is a config edit
plus a CMS Payload migration, no Python redeploy logic.
"""

import os
from typing import Optional

SUPPORTED_LANGUAGES: list[str] = [
    code.strip()
    for code in os.getenv("POLTR_LANGUAGES", "de-CH,fr-CH,it-CH,rm,en-GB").split(",")
    if code.strip()
]

DEFAULT_LANGUAGE: str = os.getenv("POLTR_DEFAULT_LANGUAGE", "de-CH")

SUPPORTED_LANGUAGES_SET: frozenset[str] = frozenset(SUPPORTED_LANGUAGES)

# Base subtag → canonical supported locale, derived from SUPPORTED_LANGUAGES.
# Lets us remap arbitrary BCP-47 tags (de-DE, de, en-US) onto our region-
# flavoured locales (de-CH, en-GB). Unflavoured locales (rm) map to themselves.
BASE_TO_CANONICAL: dict[str, str] = {}
for _l in SUPPORTED_LANGUAGES:
    BASE_TO_CANONICAL.setdefault(_l.split("-", 1)[0].lower(), _l)


def normalize_lang(code: Optional[str]) -> Optional[str]:
    """Map an arbitrary BCP-47 tag to a supported canonical locale, or None.

    Exact supported code wins; otherwise the base subtag is remapped
    (de-CH/de-DE/de → de-CH). Returns None if the base language isn't supported.
    """
    if not code:
        return None
    code = code.strip()
    if code in SUPPORTED_LANGUAGES_SET:
        return code
    return BASE_TO_CANONICAL.get(code.split("-", 1)[0].lower())
