"""
Datenmodell für das emergente, versionierte Tag-System.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Tag:
    id: str
    label: str
    description: str          # was inhaltlich darunter fällt (LLM-erzeugt)
    created_at: str
    version: int = 1
    status: str = "active"    # active | merged | split | retired
    # Achse als benannter Gegensatz (Axial Coding): die zwei Pole derselben Frage.
    pole_a: str | None = None
    pole_b: str | None = None
    # falls dieser Tag aus anderen hervorging / in andere überging:
    derived_from: list[str] = field(default_factory=list)
    superseded_by: list[str] = field(default_factory=list)


@dataclass
class Assignment:
    argument_id: str
    tag_id: str
    confidence: float
    rationale: str
    assigned_at: str
    taxonomy_version: int     # Stand der Taxonomie zum Zuordnungszeitpunkt
