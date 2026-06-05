"""
Shared configuration for the calculator service.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# .env laden, BEVOR Werte gelesen werden — unabhängig von der Import-Reihenfolge
# (sonst liest dieses Modul leere Werte, falls es vor core/fastapi importiert wird).
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# LLM
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
# Axial Coding (qualitätskritisch, aber nur 1 Call/Lauf) → Sonnet.
LLM_MODEL = os.getenv("CALCULATOR_LLM_MODEL", "claude-sonnet-4-6")

# Server
PORT = int(os.getenv("CALCULATOR_PORT", "3000"))
LOG_LEVEL = os.getenv("CALCULATOR_LOG_LEVEL", "INFO").upper()

# Embeddings (Stage-1-Vorbündelung, Variante B) — Infomaniak AI Tools,
# OpenAI-kompatibel: POST {base}/2/ai/{product_id}/openai/v1/embeddings
EMBEDDING_BASE_URL = os.getenv(
    "CALCULATOR_EMBEDDING_BASE_URL", "https://api.infomaniak.com"
)
# Infomaniak-AI-Tools-Credentials (dasselbe Produkt wie fürs LLM). Primär die
# CALCULATOR_EMBEDDING_*-Namen; INFOMANIKA_LLM_* werden als Fallback akzeptiert.
EMBEDDING_PRODUCT_ID = (
    os.getenv("CALCULATOR_EMBEDDING_PRODUCT_ID")
    or os.getenv("INFOMANIKA_LLM_PRODUCT_ID")
    or ""
).strip()
EMBEDDING_API_KEY = (
    os.getenv("CALCULATOR_EMBEDDING_API_KEY")
    or os.getenv("INFOMANIKA_LLM_TOKEN")
    or ""
).strip()
EMBEDDING_MODEL = os.getenv("CALCULATOR_EMBEDDING_MODEL", "Qwen/Qwen3-Embedding-8B")
# Retry-Versuche je Embedding-Call bei transienten Upstream-Fehlern (502/503/
# Timeout); 1 = kein Retry. Default 4 (≈ 1s+2s+4s Backoff).
EMBEDDING_MAX_ATTEMPTS = int(os.getenv("CALCULATOR_EMBEDDING_MAX_ATTEMPTS", "4"))
# Optionale Dimensionsreduktion (Modell-abhängig); leer = Modell-Default.
_emb_dims = os.getenv("CALCULATOR_EMBEDDING_DIMENSIONS", "").strip()
EMBEDDING_DIMENSIONS = int(_emb_dims) if _emb_dims else None
# Backend-Wahl für Stage 1: auto | embedding | lexical.
# auto = embedding wenn konfiguriert, sonst lexical.
PREBUNDLE_BACKEND = os.getenv("CALCULATOR_PREBUNDLE_BACKEND", "auto").strip().lower()
# Cosinus-Schwelle fürs Vorbündeln (honest-Modus): es werden NUR Paare >= Floor
# gemergt — kein Lockern, kein Zwang. Codes ohne Partner >= Floor landen im
# Rand-Topf. Höher = strengere Bündel, aber grösserer Rand. Auf realen Daten
# (663.1): 0.72 → kohärente Bündel (echte Nah-Dubletten), 0.60 → lockere Bündel.
# Default 0.72: Qualität vor Rand-Grösse — die vielen Singletons fängt die
# „abgedeckte Singletons rauswerfen"-Regel ab (s. _axial_two_stage), nicht der Floor.
PREBUNDLE_EMBED_FLOOR = float(os.getenv("CALCULATOR_PREBUNDLE_EMBED_FLOOR", "0.72"))
# Optionale Obergrenze für die Bündelgröße (0 = AUS). Im honest-Modus i.d.R. nicht
# nötig (ohne Zwang kein Snowball); nur als Sicherheitsnetz bei sehr tiefem Floor.
PREBUNDLE_MAX_BUNDLE_SIZE = int(os.getenv("CALCULATOR_PREBUNDLE_MAX_BUNDLE_SIZE", "0"))
# Soll bei einem Embedding-Fehler still auf lexikalisch zurückgefallen werden?
# Default NEIN: ein Embedding-Ausfall soll laut scheitern (Alarm), nicht
# unbemerkt schlechtere Bündel liefern. Auf true setzen für „lieber lexikalisch
# als gar nichts".
PREBUNDLE_EMBED_FALLBACK = os.getenv(
    "CALCULATOR_PREBUNDLE_EMBED_FALLBACK", "false").strip().lower() in ("1", "true", "yes")

# Postgres (AppView-Schema) — für den Open-Coding-Worker. Liest app_arguments,
# schreibt app_argument_open_codes. Verbindung nach AppView-Vorbild (asyncpg).
POSTGRES_URL = os.getenv("CALCULATOR_POSTGRES_URL") or os.getenv("APPVIEW_POSTGRES_URL")

# Open-Coding-Worker (Cron-getrieben)
OPENCODING_BATCH_SIZE = int(os.getenv("CALCULATOR_OPENCODING_BATCH_SIZE", "20"))
OPENCODING_MAX_ATTEMPTS = int(os.getenv("CALCULATOR_OPENCODING_MAX_ATTEMPTS", "3"))
OPENCODING_DAILY_CAP = int(os.getenv("CALCULATOR_OPENCODING_DAILY_CAP", "300"))
OPENCODING_LEASE_MINUTES = int(os.getenv("CALCULATOR_OPENCODING_LEASE_MINUTES", "3"))
OPENCODING_MAX_CODES = int(os.getenv("CALCULATOR_OPENCODING_MAX_CODES", "2"))
# Open Coding läuft über Infomaniak (Gemma), nicht Anthropic — der mengen-
# intensive Schritt. Gleiche Infomaniak-Creds wie Embeddings (EMBEDDING_*).
OPENCODING_MODEL = os.getenv("CALCULATOR_OPENCODING_MODEL", "google/gemma-4-31B-it")

# CMS-DB (separate DB, Payload) — read-only, um den Ballot-Status zu lesen.
# Nur Argumente von Ballots mit Status in OPENCODING_CODEABLE_STATUSES werden
# codiert (archived/deleted Ballots nicht). Ist die URL nicht gesetzt, wird
# NICHT nach Status gefiltert (alle Ballots werden codiert).
CMS_POSTGRES_URL = os.getenv("CALCULATOR_CMS_POSTGRES_URL") or os.getenv("CMS_DATABASE_URL")
OPENCODING_CODEABLE_STATUSES = [
    s.strip() for s in
    os.getenv("CALCULATOR_OPENCODING_CODEABLE_STATUSES", "published,draft").split(",")
    if s.strip()
]
