"""
Taxonomie-Induktion über Open Codes (Variante B, Grounded-Theory-Stil).

Open Coding (Schritt 1) macht der Cron-Worker und persistiert die Codes in
`app_argument_open_codes`. `TagSystem.batch_induce` liest die fertigen Codes und
führt nur das Axial Coding + die Zuordnung aus (direkt oder zweistufig). Alles
versioniert → alte Zuordnungen bleiben nachvollziehbar (Transparenz).

Der LLMClient kapselt die Axial-Aufrufe (AnthropicLLM).
"""

from __future__ import annotations
from dataclasses import asdict
import logging
import re

from src.llm.base import LLMClient
from src.tags.models import Tag, Assignment, now

logger = logging.getLogger("calculator.tags")


class TagSystem:
    def __init__(self, llm: LLMClient):
        self.llm = llm
        self.tags: dict[str, Tag] = {}
        self.assignments: list[Assignment] = []
        self.version = 1
        self._counter = 0
        # Open-Coding-Ergebnisse je Argument (für den Snapshot-Output).
        self._open_codes: dict[str, list[dict]] = {}
        # Für die DB-Persistenz: Code → Achsen-Tag-id, Code → Pol-Neigung, Bündel.
        self._code_to_tag: dict[str, str] = {}
        self._code_to_pole: dict[str, str | None] = {}
        self._bundles: list[dict] = []  # [{representative, members}]
        # Haltung je Argument ('pro' | 'contra' | None) für Membership + pro_share.
        self._arg_stance: dict[str, str | None] = {}

    # ---- Hilfen --------------------------------------------------------
    def _new_tag_id(self, label: str) -> str:
        self._counter += 1
        slug = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
        return f"t{self._counter:03d}-{slug}"

    def _create_tag(
        self, label: str, description: str, derived_from: list[str] | None = None
    ) -> Tag:
        tid = self._new_tag_id(label)
        tag = Tag(
            id=tid,
            label=label,
            description=description,
            created_at=now(),
            version=self.version,
            derived_from=derived_from or [],
        )
        self.tags[tid] = tag
        return tag

    # ---- Variante B: Axiale Induktion über vorhandene Open Codes -------
    def batch_induce(
        self,
        items: list[tuple[str, str]],
        codes_by_arg: dict[str, list[dict]],
        *,
        stance_by_arg: dict[str, str | None] | None = None,
        max_themes: int = 6,
        min_frequency: int = 2,
        target_bundles: int = 80,
        reorganize: bool = True,
        split_factor: float = 1.8,
        split_min_reps: int = 6,
        split_max_sub: int = 3,
    ) -> dict:
        """Reihenfolge-unabhängige Taxonomie über BEREITS vorhandene Open Codes.

        Open Coding (Schritt 1) macht der Cron-Worker (app_argument_open_codes).
        Hier wird NICHTS mehr codiert: `codes_by_arg` (argument_id → Codes) ist die
        einzige Code-Quelle. Phase 1 sammelt/dedupliziert nur.

        Immer EIN Pfad (`_axial_two_stage`): Stage 0 Häufigkeitsfilter (seltene
        Codes in einen sichtbaren „Rand"), Stage 1 Vorbündelung naher Dubletten
        auf ~`target_bundles` Repräsentanten, Stage 2 Achsenbildung darauf.
        Bei wenig Material degeneriert das automatisch (Filter-Guard +
        Bündel-Short-Circuit) zu „Axial über alle Codes" — `bundled` im Output
        zeigt, ob tatsächlich vorgebündelt wurde. Nebenprodukt: die Hierarchie
        Achse → Bündel → Code → Argument.

        Phase 3: jedes Argument wird allen Achsen seiner Codes zugeordnet
        (Mehrfach-Zuordnung).
        """
        # --- Phase 1: Codes sammeln & deduplizieren (keine Generierung) ---
        arg_codes: dict[str, list[dict]] = {}
        code_note: dict[str, str] = {}  # Code-Label -> repräsentative Notiz
        all_codes: list[str] = []  # eindeutige Codes in Auftauchreihenfolge
        for aid, _text in items:
            codes = codes_by_arg.get(aid, [])
            arg_codes[aid] = codes
            for c in codes:
                label = (c.get("code") or "").strip()
                if label and label not in code_note:
                    code_note[label] = c.get("note", "")
                    all_codes.append(label)
        self._open_codes = arg_codes
        self._arg_stance = stance_by_arg or {}

        # --- Axial Coding (immer zweistufig; degeneriert bei wenig Material) ---
        code_to_tag, extra = self._axial_two_stage(
            arg_codes,
            all_codes,
            code_note,
            max_themes=max_themes,
            min_frequency=min_frequency,
            target_bundles=target_bundles,
            reorganize=reorganize,
            split_factor=split_factor,
            split_min_reps=split_min_reps,
            split_max_sub=split_max_sub,
        )

        # --- Phase 3: Zuordnungen (Mehrfach-Label, dedupliziert) ---
        for aid, codes in arg_codes.items():
            seen: set[str] = set()
            for c in codes:
                label = (c.get("code") or "").strip()
                tag_id = code_to_tag.get(label)
                if not tag_id or tag_id in seen:
                    continue
                seen.add(tag_id)
                self.assignments.append(
                    Assignment(
                        argument_id=aid,
                        tag_id=tag_id,
                        confidence=float(c.get("confidence", 1.0)),
                        rationale=f"Code «{label}»"
                        + (f": {c['note']}" if c.get("note") else ""),
                        assigned_at=now(),
                        taxonomy_version=self.version,
                    )
                )

        result = {
            "method": "open-axial-coding",
            "open_codes": arg_codes,
            "themes": [
                {
                    "id": t.id,
                    "label": t.label,
                    "description": t.description,
                    "pole_a": t.pole_a,
                    "pole_b": t.pole_b,
                }
                for t in self.tags.values()
                if t.status != "split"  # in Sub-Achsen aufgegangen (Reorg)
            ],
            "code_count": len(all_codes),
        }
        result.update(extra)
        return result

    # ---- Axial: Stage 0/1/2 (degeneriert bei wenig Material) -----------
    def _axial_two_stage(
        self,
        arg_codes,
        all_codes,
        code_note,
        *,
        max_themes: int,
        min_frequency: int,
        target_bundles: int,
        reorganize: bool = True,
        split_factor: float = 1.8,
        split_min_reps: int = 6,
        split_max_sub: int = 3,
    ) -> tuple[dict[str, str], dict]:
        from src.tags import embedding, prebundle
        from src import config

        # Stage 0 — Häufigkeitsfilter: seltene Codes in einen sichtbaren „Rand".
        freq = prebundle.code_frequencies(arg_codes)
        kept = [c for c in all_codes if freq[c] >= min_frequency]
        margin = [c for c in all_codes if freq[c] < min_frequency]
        # Guard: zu aggressiver Filter (fast alles selten) → Filter aussetzen.
        filter_applied = True
        if len(kept) < max(target_bundles, 10):
            kept, margin, filter_applied = all_codes, [], False

        # Stage 1 — Vorbündelung naher Dubletten (latent, gekapselt).
        prebundle_meta: dict = {}
        if len(kept) <= target_bundles:
            # Kein Bündeln nötig: jeder Code ist sein eigenes „Bündel". Spart bei
            # wenig Material den (teuren) Embedding-Call — Stage 2 sieht dann
            # alle Codes direkt (= das alte „Direkt"-Verhalten).
            bundles = [
                {"representative": c, "members": [c], "cohesion": None} for c in kept
            ]
            prebundle_backend = "none"
        else:
            # Backend-Wahl: auto = Embedding wenn konfiguriert, sonst lexikalisch.
            # `want_embed` ist die KONFIGURATIONS-Entscheidung (Creds vorhanden);
            # ein Laufzeit-Fehler fällt NICHT mehr still auf lexikalisch zurück
            # (sonst bekäme man unbemerkt schlechtere Bündel). Nur wenn
            # CALCULATOR_PREBUNDLE_EMBED_FALLBACK=true gesetzt ist, gibt es den
            # alten Fallback; sonst scheitert der Lauf hörbar.
            # want_embed = config.PREBUNDLE_BACKEND == "embedding" or (
            #     config.PREBUNDLE_BACKEND == "auto" and embedding.is_configured()
            # )
            prebundle_backend = "lexical"
            # if want_embed:
            # try:
            vecs = embedding.embed_texts(kept)
            bundles, prebundle_meta = prebundle.prebundle_embedding(
                kept,
                target_bundles,
                vecs,
                freq=freq,
                floor=config.PREBUNDLE_EMBED_FLOOR,
                max_size=config.PREBUNDLE_MAX_BUNDLE_SIZE or None,
            )
            prebundle_backend = "embedding"
            # except Exception as err:
            #     if not config.PREBUNDLE_EMBED_FALLBACK:
            #         logger.error(
            #             "Embedding-Vorbündelung fehlgeschlagen (%s) — KEIN "
            #             "Fallback (CALCULATOR_PREBUNDLE_EMBED_FALLBACK=false). "
            #             "Lauf wird abgebrochen.", err)
            #         raise
            #     logger.warning(
            #         "Embedding-Vorbündelung fehlgeschlagen (%s) — "
            #         "Fallback auf lexikalisch (per Config erlaubt).", err)
            #     bundles = prebundle.prebundle_lexical(
            #         kept, target_bundles, freq=freq
            #     )
            #     prebundle_backend = "lexical(embedding-fallback)"
            # else:
            #     bundles = prebundle.prebundle_lexical(kept, target_bundles, freq=freq)
        # honest-Modus: Codes, die mit niemandem clustern (Singleton-Bündel),
        # sind „unpassend". Aber NICHT jeder Singleton muss in den Rand: stammt er
        # von einem Argument, das schon einen anderen Code in einem echten Cluster
        # hat (=„abgedeckt"), ist er nur eine idiosynkratische Nebenfacette → wird
        # verworfen (kein Bündel, keine Membership). Nur Singletons von Argumenten,
        # die GAR NICHT clustern, wandern in den Rand-Topf (→ sichtbar).
        # Im Short-Circuit (kleiner Datensatz) sieht das Axial bewusst alle Codes.
        unbundled: list[str] = []
        dropped_singletons = 0
        if prebundle_backend != "none":
            multi = [b for b in bundles if len(b["members"]) >= 2]
            singletons = [b["representative"] for b in bundles
                          if len(b["members"]) == 1]
            clustered = {m for b in multi for m in b["members"]}
            # Code → Argumente (für die „abgedeckt"-Entscheidung).
            from collections import defaultdict as _dd
            code_to_args: dict[str, list[str]] = _dd(list)
            for aid, cs in arg_codes.items():
                for c in cs:
                    lbl = (c.get("code") or "").strip()
                    if lbl:
                        code_to_args[lbl].append(aid)
            covered_args = {
                aid for aid, cs in arg_codes.items()
                if any((c.get("code") or "").strip() in clustered for c in cs)
            }
            # Singleton behalten (→Rand) nur, wenn er zu mind. EINEM nicht
            # abgedeckten Argument gehört; sonst verwerfen.
            unbundled = [
                code for code in singletons
                if any(aid not in covered_args for aid in code_to_args.get(code, []))
            ]
            dropped_singletons = len(singletons) - len(unbundled)
            bundles = multi
        rep_to_bundle = {b["representative"]: b for b in bundles}

        # Stage 2 — Achsenbildung: LLM sieht nur die Repräsentanten.
        reps = [b["representative"] for b in bundles]
        themes = []
        if reps:
            themes = (
                self.llm.axial_group(
                    [{"code": r, "note": code_note.get(r, "")} for r in reps],
                    max_themes=max_themes,
                )
                or []
            )

        code_to_tag: dict[str, str] = {}
        axis_of_rep: dict[str, str] = {}  # Repräsentant -> Achsen-Tag-id
        for th in themes:
            label = (th.get("label") or "").strip()
            if not label:
                continue
            axis = self._create_tag(label, th.get("description", ""))
            axis.pole_a = th.get("pole_a")
            axis.pole_b = th.get("pole_b")
            for item in th.get("codes", []):
                rep = str(item.get("code", "")).strip()
                pole = item.get("pole")
                b = rep_to_bundle.get(rep)
                if not b:
                    continue
                axis_of_rep[rep] = axis.id
                for member in b[
                    "members"
                ]:  # Achse + Pol-Neigung erben alle Bündel-Codes
                    code_to_tag[member] = axis.id
                    self._code_to_pole[member] = pole

        # Reorganisation (2. Sicherheitsnetz): überladene Achsen splitten.
        # Größe als Warnsignal → fokussierter zweiter LLM-Durchlauf auf den
        # Codes der einen verdächtigen Achse. Mutiert axis_of_rep + code_to_tag.
        splits = []
        if reorganize:
            splits = self._split_overloaded_axes(
                axis_of_rep,
                code_to_tag,
                rep_to_bundle,
                code_note,
                split_factor=split_factor,
                split_min_reps=split_min_reps,
                split_max_sub=split_max_sub,
            )

        # Rand-Topf: Stage-0-Randcodes (Häufigkeit) + honest-Singletons (Codes
        # ohne semantischen Cluster). Beide sind „unpassend" und werden bewusst
        # nicht in eine Achse gepresst.
        rand_codes = margin + unbundled
        rand_set = set(rand_codes)

        # Bündel ohne Achse → „Nicht gruppiert" (echte Cluster, die das Axial
        # nicht platzieren konnte) — Rand-Codes hier ausgenommen.
        ungrouped = [c for c in kept if c not in code_to_tag and c not in rand_set]
        self._catch_unassigned(
            ungrouped,
            code_to_tag,
            label="Nicht gruppiert",
            desc="Bündel/Codes, die auf keine Achse passen.",
        )

        if rand_codes:
            rand = self._create_tag(
                "Rand",
                "Codes ohne semantischen Cluster (kein Partner ≥ Floor) bzw. "
                "unter der Mindesthäufigkeit — als Randphänomen markiert, nicht "
                "in eine Achse gepresst.",
            )
            for code in rand_codes:
                code_to_tag[code] = rand.id

        # Hierarchie als Nebenprodukt: Achse → Bündel → Codes.
        hierarchy = []
        for tid, tag in self.tags.items():
            axis_bundles = [
                {"representative": b["representative"], "codes": b["members"]}
                for b in bundles
                if axis_of_rep.get(b["representative"]) == tid
            ]
            if axis_bundles:
                hierarchy.append(
                    {"axis_id": tid, "axis": tag.label, "bundles": axis_bundles}
                )

        extra = {
            # Wurde tatsächlich vorgebündelt (sonst: jeder Code = ein Bündel)?
            "bundled": len(bundles) < len(kept),
            "stage0": {
                "min_frequency": min_frequency,
                "applied": filter_applied,
                "kept": len(kept),
                "margin": len(margin),
            },
            "unbundled_singletons": len(unbundled),    # Singletons unabgedeckter Args → Rand
            "dropped_singletons": dropped_singletons,  # Singletons abgedeckter Args → verworfen
            "prebundle": {
                "backend": prebundle_backend,
                "target": target_bundles,
                "bundles": len(bundles),
                **prebundle_meta,
            },
            "bundles": [
                {
                    "representative": b["representative"],
                    "axis_id": axis_of_rep.get(b["representative"]),
                    "codes": b["members"],
                }
                for b in bundles
            ],
            "margin_codes": rand_codes,
            "hierarchy": hierarchy,
            "splits": splits,  # Reorganisation: welche Achse wurde wie aufgeteilt
        }
        # Für die DB-Persistenz festhalten.
        self._code_to_tag = code_to_tag
        self._bundles = bundles
        return code_to_tag, extra

    # ---- Reorganisation: überladene Achsen splitten --------------------
    def _split_overloaded_axes(
        self,
        axis_of_rep: dict[str, str],
        code_to_tag: dict[str, str],
        rep_to_bundle: dict[str, dict],
        code_note: dict[str, str],
        *,
        split_factor: float,
        split_min_reps: int,
        split_max_sub: int,
    ) -> list[dict]:
        """Zweites Sicherheitsnetz hinter dem geschärften Axial-Prompt.

        Größe als Warnsignal: eine Achse, die deutlich mehr Codes anzieht als der
        Durchschnitt, vermischt vermutlich mehrere Streitfragen. Solche Achsen
        legen wir dem LLM erneut vor — aber NUR ihre Repräsentanten —, mit dem
        Auftrag, sie in 2..split_max_sub scharfe Achsen aufzuteilen. Engeres
        Blickfeld → das LLM sieht die feinen Unterschiede, die es im grossen
        Durchlauf zur groben Vereinfachung verschmolzen hat.

        Leftover-Reps (vom Split nicht zugeordnet) bleiben auf der ursprünglichen
        (Rest-)Achse; wird die Achse komplett aufgeteilt, markieren wir sie als
        `status='split'` (→ aus der Persistenz ausgenommen) mit `superseded_by`.
        Mutiert `axis_of_rep`, `code_to_tag`, `self._code_to_pole`, `self.tags`.
        """
        from collections import Counter

        real_axes = set(axis_of_rep.values())  # nur echte Achsen (kein Rand/Auffang)
        if len(real_axes) < 2:
            return []  # ohne Vergleichsmaßstab kein „überdurchschnittlich groß"

        # Größe = Anzahl Codes je Achse (Member-Codes, nicht nur Repräsentanten).
        sizes = Counter(tid for tid in code_to_tag.values() if tid in real_axes)

        splits: list[dict] = []
        for tid in list(real_axes):
            reps = [r for r, a in axis_of_rep.items() if a == tid]
            # Vergleich gegen den Schnitt der ÜBRIGEN Achsen (nicht den
            # Gesamtschnitt): so bläht die überladene Achse den Maßstab nicht
            # selbst auf und das Kriterium greift auch bei wenigen Achsen.
            others = [sz for a, sz in sizes.items() if a != tid] or [0]
            baseline = sum(others) / len(others)
            threshold = split_factor * baseline
            if sizes.get(tid, 0) <= threshold or len(reps) < split_min_reps:
                continue  # nicht auffällig groß oder zu wenig Reps zum Splitten

            sub_themes = (
                self.llm.split_axis(
                    [{"code": r, "note": code_note.get(r, "")} for r in reps],
                    max_sub=split_max_sub,
                )
                or []
            )
            valid = [t for t in sub_themes if (t.get("label") or "").strip()]
            if len(valid) < 2:
                logger.info(
                    "Reorg: Achse %s (%d Codes) nicht gesplittet "
                    "(LLM lieferte <2 Sub-Achsen).",
                    tid,
                    sizes.get(tid, 0),
                )
                continue

            old = self.tags[tid]
            new_ids: list[str] = []
            moved_reps: set[str] = set()
            for th in valid:
                sub = self._create_tag(
                    (th.get("label") or "").strip(),
                    th.get("description", ""),
                    derived_from=[tid],
                )
                sub.pole_a = th.get("pole_a")
                sub.pole_b = th.get("pole_b")
                new_ids.append(sub.id)
                for item in th.get("codes", []):
                    rep = str(item.get("code", "")).strip()
                    pole = item.get("pole")
                    b = rep_to_bundle.get(rep)
                    if not b or axis_of_rep.get(rep) != tid:
                        continue  # nur Reps, die wirklich zu DIESER Achse gehörten
                    axis_of_rep[rep] = sub.id
                    moved_reps.add(rep)
                    for member in b["members"]:
                        code_to_tag[member] = sub.id
                        self._code_to_pole[member] = pole

            leftover = [r for r in reps if r not in moved_reps]
            # Lineage: Sub-Achsen tragen derived_from=[tid]; die alte Achse
            # verweist via superseded_by auf ihre Nachfolger.
            old.superseded_by = new_ids
            if not leftover:
                # Vollständig aufgeteilt → alte Achse hält keine Codes mehr.
                old.status = "split"
            splits.append(
                {
                    "axis_id": tid,
                    "axis": old.label,
                    "size": sizes.get(tid, 0),
                    "into": new_ids,
                    "leftover_reps": len(leftover),
                }
            )
            logger.info(
                "Reorg: Achse %s (%d Codes) → %d Sub-Achsen %s (Rest: %d Reps).",
                tid,
                sizes.get(tid, 0),
                len(new_ids),
                new_ids,
                len(leftover),
            )

        return splits

    # ---- gemeinsamer Auffangknoten -------------------------------------
    def _catch_unassigned(
        self,
        codes: list[str],
        code_to_tag: dict[str, str],
        label: str = "Nicht gruppiert",
        desc: str = "Codes, die das Axial Coding keinem " "Theme zugeordnet hat.",
    ) -> None:
        leftover = [c for c in codes if c not in code_to_tag]
        if not leftover:
            return
        fb = self._create_tag(label, desc)
        for code in leftover:
            code_to_tag[code] = fb.id

    # ---- Abfragen ------------------------------------------------------
    def tag_sizes(self) -> dict[str, int]:
        sizes: dict[str, int] = {tid: 0 for tid in self.tags}
        for a in self.assignments:
            sizes[a.tag_id] = sizes.get(a.tag_id, 0) + 1
        return sizes

    def snapshot(self) -> dict:
        return {
            "version": self.version,
            "tag_sizes": self.tag_sizes(),
            "tags": [asdict(t) for t in self.tags.values()],
            "assignments": [asdict(a) for a in self.assignments],
        }

    # ---- DB-Persistenz: Achsen / Bündel / Zugehörigkeiten --------------
    # Spezial-Achsen, anhand des Labels erkannt (vom Pipeline-Code erzeugt).
    _SPECIAL_KINDS = {"Rand": "margin", "Nicht gruppiert": "ungrouped"}

    def taxonomy_for_persistence(self) -> dict:
        """Strukturierte Daten für die 4 Taxonomie-Tabellen (lokale IDs; das
        DB-Layer mappt sie auf Serial-PKs). Beziehungen:
        Code → Bündel → Achse  und  Argument → Code (aus den Open Codes)."""
        # status='split'-Achsen sind durch die Reorganisation vollständig in
        # Sub-Achsen aufgegangen (keine Codes mehr) → nicht persistieren.
        axes = [
            {
                "local_id": t.id,
                "label": t.label,
                "description": t.description,
                "pole_a": t.pole_a,
                "pole_b": t.pole_b,
                "kind": self._SPECIAL_KINDS.get(t.label, "axis"),
            }
            for t in self.tags.values()
            if t.status != "split"
        ]

        # Code → mittlere Open-Coding-Confidence (über alle Vorkommen des Labels).
        from collections import defaultdict as _dd

        _conf: dict[str, list[float]] = _dd(list)
        for codes in self._open_codes.values():
            for c in codes:
                lbl = (c.get("code") or "").strip()
                if lbl:
                    _conf[lbl].append(float(c.get("confidence", 1.0)))
        code_conf = {lbl: sum(v) / len(v) for lbl, v in _conf.items()}

        # Code → Bündel (lokale IDs); Achse eines Bündels = Achse seines
        # Repräsentanten (alle Member erben sie). Randcodes haben kein Bündel.
        bundles = []
        code_to_bundle: dict[str, str] = {}
        for i, b in enumerate(self._bundles):
            local = f"b{i:04d}"
            rep = b["representative"]
            members = b["members"]
            confs = [code_conf[m] for m in members if m in code_conf]
            bundles.append(
                {
                    "local_id": local,
                    "axis_local_id": self._code_to_tag.get(rep),
                    "representative": rep,
                    "cohesion": b.get("cohesion"),
                    "avg_confidence": (
                        round(sum(confs) / len(confs), 4) if confs else None
                    ),
                }
            )
            for code in members:
                code_to_bundle[code] = local

        # Faktentabelle: pro (Argument, Code) → Bündel(optional) → Achse.
        memberships = []
        for aid, codes in self._open_codes.items():
            seen: set[str] = set()
            for c in codes:
                code = (c.get("code") or "").strip()
                if not code or code in seen:
                    continue
                seen.add(code)
                axis_local = self._code_to_tag.get(code)
                if not axis_local:
                    continue
                memberships.append(
                    {
                        "argument_uri": aid,
                        "code": code,
                        "bundle_local_id": code_to_bundle.get(code),  # None = Rand
                        "axis_local_id": axis_local,
                        "pole": self._code_to_pole.get(code),  # a | b | neutral | None
                        "stance": self._arg_stance.get(aid),  # pro | contra | None
                        "confidence": float(
                            c.get("confidence", 1.0)
                        ),  # Open-Coding-Confidence
                    }
                )

        # Denormalisierte Qualitätsmetriken (aus der Faktentabelle): pro Achse
        # # Bündel / # distinct Argumente / # distinct Codes; pro Bündel # Codes.
        # Zusätzlich pro_share = Anteil PRO unter den distinct Argumenten der Achse
        # (Haltung ist pro Argument, daher über distinct argument_uri gezählt).
        from collections import Counter, defaultdict

        axis_args: dict[str, dict[str, str | None]] = defaultdict(
            dict
        )  # axis -> {arg: stance}
        axis_codes: dict[str, set] = defaultdict(set)
        bundle_codes: dict[str, set] = defaultdict(set)
        for m in memberships:
            axis_args[m["axis_local_id"]][m["argument_uri"]] = m["stance"]
            axis_codes[m["axis_local_id"]].add(m["code"])
            if m["bundle_local_id"]:
                bundle_codes[m["bundle_local_id"]].add(m["code"])
        axis_bundle_count = Counter(b["axis_local_id"] for b in bundles)
        for a in axes:
            lid = a["local_id"]
            args = axis_args.get(lid, {})
            a["bundle_count"] = axis_bundle_count.get(lid, 0)
            a["argument_count"] = len(args)
            a["code_count"] = len(axis_codes.get(lid, ()))
            # Anteil PRO über ALLE Argumente der Achse (unbekannte Haltung zählt
            # in den Nenner, aber nicht als PRO). None, wenn die Achse leer ist.
            a["pro_share"] = (
                sum(1 for s in args.values() if s == "pro") / len(args)
                if args
                else None
            )
        for b in bundles:
            b["code_count"] = len(bundle_codes.get(b["local_id"], ()))

        # Lauf-Qualität: wie viele codierte Argumente landeten auf KEINER echten
        # Achse (alle Codes nur in Rand/ungrouped). Aus der Faktentabelle.
        axis_kind = {a["local_id"]: a["kind"] for a in axes}
        args_all: set[str] = set()
        args_on_axis: set[str] = set()
        for m in memberships:
            args_all.add(m["argument_uri"])
            if axis_kind.get(m["axis_local_id"]) == "axis":
                args_on_axis.add(m["argument_uri"])
        run_stats = {
            "arguments_total": len(args_all),
            "arguments_unassigned": len(args_all - args_on_axis),
        }

        # Rollup Argument → Achse: Pol des Arguments aus den Code-Polen ableiten
        # (Confidence-gewichtete Mehrheit a vs. b) — KEIN neuer LLM-Call. Nur echte
        # Achsen (kind='axis'); Rand/ungrouped haben keinen Pol.
        agg: dict[tuple[str, str], dict] = {}
        for m in memberships:
            if axis_kind.get(m["axis_local_id"]) != "axis":
                continue
            key = (m["argument_uri"], m["axis_local_id"])
            g = agg.setdefault(key, {"a": 0.0, "b": 0.0, "cnt": 0, "conf": []})
            conf = m.get("confidence")
            w = conf if conf is not None else 1.0
            if m.get("pole") == "a":
                g["a"] += w
            elif m.get("pole") == "b":
                g["b"] += w
            g["cnt"] += 1
            if conf is not None:
                g["conf"].append(conf)
        argument_axes = []
        for (aid, axloc), g in agg.items():
            pole = "a" if g["a"] > g["b"] else "b" if g["b"] > g["a"] else "neutral"
            argument_axes.append({
                "argument_uri": aid,
                "axis_local_id": axloc,
                "pole": pole,
                "stance": self._arg_stance.get(aid),
                "code_count": g["cnt"],
                "confidence": (round(sum(g["conf"]) / len(g["conf"]), 4)
                               if g["conf"] else None),
                "conflict": g["a"] > 0 and g["b"] > 0,  # zieht auf a UND b (§10.2)
            })

        return {"axes": axes, "bundles": bundles, "memberships": memberships,
                "run_stats": run_stats, "argument_axes": argument_axes}
