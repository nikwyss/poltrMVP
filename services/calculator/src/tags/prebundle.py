"""
Stage 0 (Häufigkeitsfilter) + Stage 1 (Vorbündelung) für das zweistufige
Axial Coding — siehe doc/argument_clustering.md §11.

Die Vorbündelung sortiert nur **nahe Dubletten** zusammen ("Fonds aus Abgaben"
≈ "Abgaben-finanzierter Topf"). Sie trifft KEINE inhaltlichen Endentscheidungen
— das macht Stage 2 (das LLM) auf den Repräsentanten. Darum ist hier eine
*latente* Trennung zulässig: sie ist gekapselt und wird in Stage 2 inhaltlich
überprüft, sie leckt nicht ins Endergebnis (vgl. Leitkriterium §8.1).

**Backend.** Default ist **lexikalisch** (stdlib, keine schweren Dependencies):
Greedy-Agglomeration über Token-Jaccard. Das erkennt Dubletten mit gemeinsamen
Stichwörtern zuverlässig, aber reine Paraphrasen ohne Wortüberlappung schwächer.
Ein echtes **Embedding-Backend** (sentence-transformers / Embeddings-API) ist der
vorgesehene, stärkere Ersatz für diese Stufe — noch nicht verdrahtet.
"""

from __future__ import annotations
import re
from collections import Counter

# Kleine deutsche Stoppwortliste — Codes sind kurze Phrasen, daher reicht das.
_STOP = {
    "der",
    "die",
    "das",
    "und",
    "oder",
    "für",
    "von",
    "mit",
    "im",
    "in",
    "zu",
    "auf",
    "als",
    "ist",
    "sind",
    "ein",
    "eine",
    "einer",
    "einem",
    "einen",
    "den",
    "dem",
    "des",
    "durch",
    "bei",
    "aus",
    "über",
    "am",
    "an",
    "vs",
    "statt",
    "gegen",
    "mehr",
    "wird",
    "werden",
    "nicht",
    "kein",
    "keine",
}


def _tokens(label: str) -> set[str]:
    toks = re.split(r"[^a-zäöüß0-9]+", label.lower())
    return {t for t in toks if len(t) >= 3 and t not in _STOP}


def code_frequencies(arg_codes: dict[str, list[dict]]) -> Counter:
    """Wie viele Argumente nennen jeden Code (pro Argument max. 1 Zählung)."""
    freq: Counter = Counter()
    for codes in arg_codes.values():
        seen = set()
        for c in codes:
            label = (c.get("code") or "").strip()
            if label and label not in seen:
                seen.add(label)
                freq[label] += 1
    return freq


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return inter / len(a | b) if inter else 0.0


def _agglomerate(
    clusters: list[list[int]],
    sim,
    target: int,
    accept: float,
    max_size: int | None = None,
) -> None:
    """Mergt in-place das jeweils ähnlichste Cluster-Paar (Average-Link), bis
    `target` erreicht ist ODER kein Paar mehr ≥ `accept` liegt. `max_size`
    begrenzt die Clustergröße: ein Merge, der die Grenze überschritte, wird
    übersprungen — das verhindert das lawinenartige Aufblähen eines Clusters
    (Sammelbecken), auch wenn `accept` zur Cap-Erzwingung negativ ist."""
    import numpy as np

    while len(clusters) > target:
        best_s, bi, bj = accept, -1, -1
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                if max_size and len(clusters[i]) + len(clusters[j]) > max_size:
                    continue  # Größen-Cap: kein Snowball
                s = float(sim[np.ix_(clusters[i], clusters[j])].mean())
                if s > best_s:
                    best_s, bi, bj = s, i, j
        if bi < 0:
            break  # nichts mehr mergebar (Floor erreicht oder alles am Cap)
        clusters[bi].extend(clusters[bj])
        clusters.pop(bj)


def prebundle_embedding(
    codes: list[str],
    target_bundles: int,
    embeddings: list[list[float]],
    freq: Counter | None = None,
    floor: float = 0.60,
    max_rounds: int = 3,
    max_size: int | None = None,
) -> tuple[list[dict], dict]:
    """Vorbündelung über semantische Nähe (Cosinus der Embeddings) — **honest**.

    Es werden NUR Paare mit Cosinus ≥ `floor` gemergt: kein Floor-Lockern, KEIN
    Zwang auf `target_bundles`. Grosse Bündel entstehen damit ausschliesslich aus
    echter Nähe, nie aus Erzwingung → kein Snowball/Sammelbecken, kein Größen-Cap
    nötig (`max_size` = optionales Sicherheitsnetz, 0/None = aus). `target_bundles`
    wirkt nur als (meist nicht bindende) Decke: bei dichten Daten stoppt es dort,
    bei diversen stoppt der Floor vorher (es bleiben dann mehr Bündel übrig —
    Codes ohne Partner ≥ Floor sind Singletons und gehören in den Rand-Topf).

    Rückgabe: (bundles, meta) mit meta = {rounds, final_floor, capped, max_size,
    max_bundle}. `cohesion` je Bündel = mittlere paarweise Cosinus-Nähe.
    """
    import numpy as np

    freq = freq or Counter()
    cap = max_size or None  # kein Auto-Cap mehr; nur explizit
    X = np.asarray(embeddings, dtype=float)
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    Xn = X / norms
    sim = Xn @ Xn.T  # Cosinus-Ähnlichkeitsmatrix

    # Honest: bis target ODER bis kein Paar mehr ≥ floor (kein Lockern).
    clusters: list[list[int]] = [[i] for i in range(len(codes))]
    _agglomerate(clusters, sim, target_bundles, floor, max_size=cap)

    def _cohesion_cos(idx: list[int]) -> float | None:
        if len(idx) < 2:
            return None
        sub = sim[np.ix_(idx, idx)]
        iu = np.triu_indices(len(idx), 1)  # nur obere Dreiecksmatrix (i<j)
        return round(float(sub[iu].mean()), 3)

    bundles = []
    for cl in clusters:
        members = [codes[k] for k in cl]
        rep = max(members, key=lambda c: (freq.get(c, 0), len(c)))
        bundles.append(
            {"representative": rep, "members": members, "cohesion": _cohesion_cos(cl)}
        )

    max_bundle = max((len(b["members"]) for b in bundles), default=0)
    singletons = sum(1 for b in bundles if len(b["members"]) == 1)
    meta = {
        "rounds": 1,  # honest: ein Durchgang, kein Lockern
        "final_floor": round(floor, 3),
        "capped": False,  # kein Zwang → nie „capped"
        "max_size": cap,
        "max_bundle": max_bundle,
        "singletons": singletons,  # Codes ohne Partner ≥ Floor → Rand
    }
    return bundles, meta
