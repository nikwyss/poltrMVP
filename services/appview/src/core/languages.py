"""Supported content languages for POLTR records.

Single source of truth for the language codes accepted by the AppView
(BCP-47 short codes). Read from `POLTR_LANGUAGES` env var so the set can be
extended without code changes — adding a sixth language is a config edit
plus a CMS Payload migration, no Python redeploy logic.
"""

import os

SUPPORTED_LANGUAGES: list[str] = [
    code.strip()
    for code in os.getenv("POLTR_LANGUAGES", "de,fr,it,rm,en").split(",")
    if code.strip()
]

DEFAULT_LANGUAGE: str = os.getenv("POLTR_DEFAULT_LANGUAGE", "de")

SUPPORTED_LANGUAGES_SET: frozenset[str] = frozenset(SUPPORTED_LANGUAGES)
