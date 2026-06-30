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

# -----------------------------------------------------------------------------
# Embeddings (Infomaniak AI Tools, OpenAI-kompatibel) — siehe doc/infomaniak.md.
# Token + Product ID teilen sich Chat & Embeddings (gleiches Infomaniak-Produkt).
# -----------------------------------------------------------------------------
EMBEDDING_BASE_URL = os.getenv("CALCULATOR_EMBEDDING_BASE_URL", "https://api.infomaniak.com")
EMBEDDING_PRODUCT_ID = os.getenv("CALCULATOR_EMBEDDING_PRODUCT_ID", "").strip()
EMBEDDING_API_KEY = os.getenv("CALCULATOR_EMBEDDING_API_KEY", "").strip()
EMBEDDING_MODEL = os.getenv("CALCULATOR_EMBEDDING_MODEL", "Qwen/Qwen3-Embedding-8B")
# 0 = Modell-Default (4096). Wir kürzen via MRL auf 1024 — MUSS zur vector(N)-
# Spalte in app_embeddings passen (Änderung = Migration + Re-Embed).
EMBEDDING_DIMENSIONS = int(os.getenv("CALCULATOR_EMBEDDING_DIMENSIONS", "1024") or 0)

# Backfill-Drosselung + Dedup-Schwelle.
# Chat-Modell (Infomaniak Gemma, JSON-Prompt) für LLM-Checks beim Verfassen
# (Stance-/Kohärenz-Check). Token + Product ID teilen sich Chat & Embeddings.
REVIEW_MODEL = os.getenv("CALCULATOR_REVIEW_MODEL", "google/gemma-4-31B-it")

EMBEDDING_RUN_LIMIT = int(os.getenv("CALCULATOR_EMBEDDING_RUN_LIMIT", "200"))   # Kandidaten je Quelle/Lauf
EMBEDDING_BATCH_SIZE = int(os.getenv("CALCULATOR_EMBEDDING_BATCH_SIZE", "64"))  # Texte je API-Call (<100)
# Anzeige-Schwelle für den Duplikat-Check (kein LLM): nur Treffer >= Schwelle
# werden dem Nutzer gezeigt. Empirisch kalibriert an Ballot 663.1: echte
# Near-Dupes liegen bei ~0.66–0.82, Rauschen darunter; 0.66 fängt auch die
# knappen Fälle ("Weniger ist mehr", "ÖV") — Recall-orientiert, da der Hinweis
# weich ist und Fehltreffer ein Klick sind.
DEDUP_SIM_THRESHOLD = float(os.getenv("CALCULATOR_DEDUP_SIM_THRESHOLD", "0.66"))
