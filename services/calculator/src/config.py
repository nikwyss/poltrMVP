"""
Shared configuration for the calculator service.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# .env laden, BEVOR Werte gelesen werden — unabhängig von der Import-Reihenfolge
# (sonst liest dieses Modul leere Werte, falls es vor core/fastapi importiert wird).
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# LLM (Top-down Themen-Hierarchie) → Sonnet.
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
LLM_MODEL = os.getenv("CALCULATOR_LLM_MODEL", "claude-sonnet-4-6")

# Server
PORT = int(os.getenv("CALCULATOR_PORT", "3000"))
LOG_LEVEL = os.getenv("CALCULATOR_LOG_LEVEL", "INFO").upper()

# Postgres (AppView-Schema): liest app_arguments, liest/schreibt die Top-down-
# Hierarchie (app_taxonomy_node / app_taxonomy_membership). Verbindung nach
# AppView-Vorbild (asyncpg).
POSTGRES_URL = os.getenv("CALCULATOR_POSTGRES_URL") or os.getenv("APPVIEW_POSTGRES_URL")

# CMS-DB (separate DB, Payload) — read-only, nur um die amtliche Vorlagen-
# Beschreibung als Zusatzkontext für die Wurzelthemen zu lesen
# (db.fetch_ballot_description). Ohne URL entfällt dieser Kontext.
CMS_POSTGRES_URL = os.getenv("CALCULATOR_CMS_POSTGRES_URL") or os.getenv("CMS_DATABASE_URL")
