"""
PROTOTYP: Top-down Themen-Hierarchie (parallel zum bottom-up induce-batch).

Idee (Gegenentwurf zum emergenten Achsen-Ansatz): Statt aus spezifischen Codes
bottom-up flache Achsen zu induzieren, bauen wir einen Themen-BAUM von oben:

  1. Wurzelthemen aus den OFFIZIELLEN Argumenten der Vorlage ableiten (der Seed).
  2. Alle Open Codes in die Wurzelthemen einsortieren.
  3. Nur dort vertiefen, wo genug Material UND Heterogenität ist (adaptive Tiefe).
     z.B. Finanzierung → Steuern → Mehrwertsteuer.

Read-only: liest app_arguments + app_argument_open_codes, schreibt NICHTS in die
DB. Reine Exploration zum Vergleich mit den aktuellen Achsen.

Aufruf:
    python -m src.topdown.prototype 663.1          # Open-Code-Pfad (Einheit = Code)
    python -m src.topdown.prototype 663.1 --args    # Argument-Pfad (Einheit = Argument)

Argument-Pfad (Parallel-Variante): statt Open Codes wird das ganze Argument in
die Wurzelthemen einsortiert — mit GEKAPPTER Multimembership (ein Hauptthema +
optional EIN Nebenthema). ZWEIPHASIG, um den realen Prozess zu simulieren:
Phase 1 leitet die Grundstruktur NUR aus den offiziellen Argumenten ab; Phase 2
sortiert die Community-Argumente NACHTRÄGLICH in diese fixe Struktur ein.
Schreibt `topdown_args_<rkey>.json` zum Vergleich mit dem Code-Baum
(`topdown_<rkey>.json`). Beide Pfade sind read-only.
"""

from __future__ import annotations
import asyncio
import json
import sys
from collections import defaultdict

from src.core import db
from src.llm import get_llm

# Adaptive Tiefe: nur splitten, wenn genug Codes da sind und max. so tief.
MIN_SPLIT = 8  # weniger Codes → Blatt (nicht weiter unterteilen)
MAX_DEPTH = 3  # Finanzierung → Steuern → Mehrwertsteuer

# --- LLM-Tools (forced) ------------------------------------------------------
_PROPOSE_TOOL = {
    "name": "propose_topics",
    "description": "Schlage Themenfelder vor.",
    "input_schema": {
        "type": "object",
        "properties": {
            "topics": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "kurzer Themenname"},
                        "description": {
                            "type": "string",
                            "description": "1 Satz: was darunterfällt (interner Kontext "
                            "für die Argument-Einordnung, NICHT für Stimmbürger:innen)",
                        },
                        "introduction": {
                            "type": "string",
                            "description": "1-2 Sätze AN DIE STIMMBÜRGERSCHAFT: warum dieses "
                            "Thema bei der Abstimmung von Bedeutung ist und ganz grob erwähnen ob es fürs Ja- oder Nein-Lager (oder beide) wichtig ist. "
                            "Verständlich, neutral, und indirekte Rede (Beispiel: 'Das Ja-Lager geht davon aus, dass...', Das Nein-Lager zweifelt an, dass). Schweizer Rechtschreibung (ss statt ß).",
                        },
                        "importance": {
                            "type": "integer",
                            "description": "Wichtigkeit 1–5 dieses Themas im gegebenen "
                            "Kontext, RELATIV zu den anderen vorgeschlagenen Themen "
                            "(5=zentral, 4=wichtig, 3=mittel, 2=nebensächlich, 1=randständig)",
                        },
                    },
                    "required": ["name", "description", "introduction", "importance"],
                },
            }
        },
        "required": ["topics"],
    },
}

# 5er-Skala-Anweisung, an alle propose-Systemprompts angehängt (Wurzeln, Subs,
# neue Äste) — die Wichtigkeit gilt jeweils RELATIV unter den Geschwistern.
_IMPORTANCE_NOTE = (
    " Schätze pro Thema eine Wichtigkeit 1–5, wie stark es im obigen Kontext "
    "vorkommt — RELATIV zu den anderen hier vorgeschlagenen Themen "
    "(5=zentral/dominant, 4=wichtig, 3=mittel, 2=nebensächlich, 1=randständig). "
    "Du musst die Skala nicht ausreizen; mehrere Themen dürfen denselben Wert haben."
)

# An alle propose-Systemprompts angehängt: zusätzlich zur internen `description`
# eine voter-facing `introduction` verfassen (was die Stimmbürger:innen lesen).
_INTRODUCTION_NOTE = (
    " Verfasse pro Thema ZUSÄTZLICH eine kurze `introduction` (2–3 Sätze) DIREKT "
    "AN DIE STIMMBÜRGERSCHAFT: warum dieses Thema bei der Abstimmung von Bedeutung "
    "ist und für wen es besonders relevant ist (wer ist betroffen). Allgemein "
    "verständlich und neutral — keine Wertung pro/contra, keine Empfehlung."
)

_CLASSIFY_TOOL = {
    "name": "classify",
    "description": "Ordne jeden Code genau einem Thema zu.",
    "input_schema": {
        "type": "object",
        "properties": {
            "assignments": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string", "description": "Code-ID, z.B. 'c012'"},
                        "topic": {
                            "type": "string",
                            "description": "exakter Themenname oder 'andere'",
                        },
                    },
                    "required": ["id", "topic"],
                },
            }
        },
        "required": ["assignments"],
    },
}

# Argument-basierte Klassifikation (Einheit = Argument statt Open Code):
# jedes Argument wird GENAU EINEM Thema zugeordnet (keine Mehrfachmitgliedschaft).
_CLASSIFY_ARGS_TOOL = {
    "name": "classify",
    "description": "Ordne jedes Argument genau einem Thema zu.",
    "input_schema": {
        "type": "object",
        "properties": {
            "assignments": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "Argument-ID, z.B. 'a0012'",
                        },
                        "topic": {
                            "type": "string",
                            "description": "exakter Themenname oder 'andere'",
                        },
                    },
                    "required": ["id", "topic"],
                },
            }
        },
        "required": ["assignments"],
    },
}


def sys_roots(n_topics: int | None = None) -> str:
    """Wurzelthemen-Systemprompt. `n_topics` legt die gewünschte Anzahl
    Themenfelder fest (None → Default-Spanne 4–7)."""
    count = f"genau {n_topics}" if n_topics else "4–7"
    return (
        "Du strukturierst die öffentliche Debatte zu einer Schweizer Abstimmungsvorlage. "
        "Unten stehen — sofern vorhanden — die amtliche BESCHREIBUNG der Vorlage und die "
        "OFFIZIELLEN Argumente (die offizielle Rahmung der Vorlage). "
        f"Leite daraus {count} ÜBERGEORDNETE Themenfelder ab, in die sich die ganze Diskussion "
        "gliedert. Die Themen sind BREIT und INHALTLICH (worum geht es), NICHT pro/contra "
        "und keine Einzelaspekte. Beispiele für die Granularität: «Finanzierung & Kosten», "
        "«Versorgungssicherheit», «Umwelt & Klima», «Rolle des Staates». Jedes Thema: "
        "kurzer Name + 1 Satz, was darunterfällt. Schweizer Rechtschreibung (ss statt ß)."
        + _IMPORTANCE_NOTE
        + _INTRODUCTION_NOTE
    )


_SYS_SUBS = (
    "Du verfeinerst EIN Themenfeld einer Abstimmungsdebatte. Unten die Codes, die diesem "
    "Thema zugeordnet sind. Zerfallen sie in 2–4 sinnvolle UNTERTHEMEN (spezifischer als "
    "das Oberthema, aber weiterhin inhaltlich)? "
    "Wenn das Thema bereits kohärent/atomar ist oder zu wenig Substanz für eine sinnvolle "
    "Unterteilung hat, gib eine LEERE Liste zurück — NICHT künstlich aufteilen. "
    "Schweizer Rechtschreibung (ss statt ß)." + _IMPORTANCE_NOTE + _INTRODUCTION_NOTE
)

_SYS_CLASSIFY = (
    "Ordne jeden Code GENAU EINEM der vorgegebenen Themen zu (exakter Name aus der Liste). "
    "Passt ein Code zu keinem, ordne ihn 'andere' zu. Gib für jeden Code id + Thema zurück."
)

_SYS_CLASSIFY_ARGS = (
    "Ordne jedes Argument GENAU EINEM Thema aus der vorgegebenen Liste zu (exakter "
    "Name). Passt es zu keinem, nutze 'andere'. Gib für jedes Argument id + Thema zurück."
)

# Für horizontales Wachstum: die Codes passten in KEIN bestehendes Wurzelthema.
_SYS_NEW_BRANCHES = (
    "Die folgenden Codes einer Abstimmungsdebatte passten in KEINES der "
    "bestehenden Themenfelder. Bilden sie 1–4 NEUE, eigenständige Themenfelder "
    "(so breit und inhaltlich wie die bestehenden Wurzelthemen — nicht pro/contra)? "
    "Gib nur wirklich tragfähige Themen zurück; für vereinzelte Ausreisser eine "
    "LEERE Liste. Schweizer Rechtschreibung (ss statt ß)."
    + _IMPORTANCE_NOTE
    + _INTRODUCTION_NOTE
)


def _clamp_importance(v) -> int | None:
    """LLM-Wichtigkeit auf eine ganze Zahl 1–5 normieren (None, falls unbrauchbar)."""
    try:
        i = int(round(float(v)))
    except (TypeError, ValueError):
        return None
    return max(1, min(5, i))


def propose_topics(llm, system: str, user: str) -> list[dict]:
    out = llm._call(_PROPOSE_TOOL, user, system, max_tokens=1500) or {}
    return [
        {
            "name": (t.get("name") or "").strip(),
            "description": t.get("description", ""),
            "introduction": t.get("introduction", ""),
            "importance": _clamp_importance(t.get("importance")),
        }
        for t in out.get("topics", [])
        if (t.get("name") or "").strip()
    ]


def classify(llm, topic_names: list[str], codes: list[str]) -> dict[str, str]:
    """Jeden Code einem Thema (oder 'andere') zuordnen. Stabile IDs."""
    id_to_code = {f"c{i:03d}": c for i, c in enumerate(codes)}
    lines = [f"[{cid}] {c}" for cid, c in id_to_code.items()]
    user = (
        "Themen:\n"
        + "\n".join(f"- {t}" for t in topic_names)
        + "\n\nCodes:\n"
        + "\n".join(lines)
    )
    out = llm._call(_CLASSIFY_TOOL, user, _SYS_CLASSIFY, max_tokens=8000) or {}
    valid = set(topic_names) | {"andere"}
    res: dict[str, str] = {}
    for a in out.get("assignments", []):
        cid = str(a.get("id", "")).strip()
        topic = str(a.get("topic", "")).strip()
        if cid in id_to_code:
            res[id_to_code[cid]] = topic if topic in valid else "andere"
    for c in codes:  # vom LLM vergessene Codes
        res.setdefault(c, "andere")
    return res


def _auri(a: dict) -> str:
    """Argument-URI eines Items — toleriert beide Loader-Schlüssel: `uri`
    (prototype.load_arguments) und `argument_uri` (db.fetch_arguments)."""
    return a.get("uri") or a.get("argument_uri")


def classify_arguments(
    llm, topic_names: list[str], args: list[dict], *, batch_size: int = 40
) -> dict[str, str]:
    """Jedes Argument GENAU EINEM Thema (oder 'andere') zuordnen.

    Einheit = Argument (nicht Open Code). Rückgabe: {argument_uri: <thema|'andere'>}.

    Gebatcht, weil Argumenttexte deutlich länger sind als Code-Labels — ein
    einzelner Call würde bei grossen Vorlagen das Kontextfenster sprengen."""
    valid = set(topic_names) | {"andere"}
    res: dict[str, str] = {}
    for start in range(0, len(args), batch_size):
        batch = args[start : start + batch_size]
        id_to_uri: dict[str, str] = {}
        lines: list[str] = []
        for i, a in enumerate(batch):
            aid = f"a{start + i:04d}"
            id_to_uri[aid] = _auri(a)
            text = " ".join((a.get("text") or "").split())[:400]
            lines.append(f"[{aid}] {text}")
        user = (
            "Themen:\n"
            + "\n".join(f"- {t}" for t in topic_names)
            + "\n\nArgumente:\n"
            + "\n".join(lines)
        )
        out = (
            llm._call(_CLASSIFY_ARGS_TOOL, user, _SYS_CLASSIFY_ARGS, max_tokens=8000)
            or {}
        )
        for a in out.get("assignments", []):
            aid = str(a.get("id", "")).strip()
            if aid not in id_to_uri:
                continue
            topic = str(a.get("topic", "")).strip()
            res[id_to_uri[aid]] = topic if topic in valid else "andere"
        for uri in id_to_uri.values():  # vom LLM vergessene Argumente
            res.setdefault(uri, "andere")
    return res


class _CountingLLM:
    """Dünner Wrapper, der die LLM-Calls zählt (für Transparenz/Endpoint)."""

    def __init__(self, llm):
        self._llm = llm
        self.calls = 0
        self.name = getattr(llm, "name", "?")

    def _call(self, *a, **k):
        self.calls += 1
        return self._llm._call(*a, **k)


def induce_tree(
    llm,
    codes: list[str],
    seed: str,
    *,
    ballot_description: str | None = None,
) -> tuple[dict, list[str]]:
    """Top-down-Baumbau — NUR die Oberthemen (Tiefe 1), keine Unterthemen.

    Bewusst flach: Schritt 1 („Themen-Gliederung") legt nur die Hauptäste fest.
    Die Vertiefung in Unterthemen passiert separat über /grow („Wachsen lassen"),
    NACHDEM die Argumente (offiziell + Community) einsortiert sind — also auf
    breiterer Datenbasis statt aus einer Handvoll offizieller Argumente.

    Rückgabe: (Wurzelknoten, andere-Codes). `llm` sollte ein _CountingLLM sein.
    `ballot_description` (amtliche Vorlagen-Beschreibung) geht als Zusatzkontext in
    den Wurzelthemen-Prompt ein."""
    ctx = ""
    if ballot_description:
        ctx = "Beschreibung der Vorlage (amtlich):\n" + ballot_description + "\n\n"
    roots = propose_topics(llm, sys_roots(), ctx + "Offizielle Argumente:\n" + seed)
    assign = classify(llm, [r["name"] for r in roots], codes)
    groups: dict[str, list[str]] = defaultdict(list)
    for c, t in assign.items():
        groups[t].append(c)
    # Flache Oberthemen: jeder Wurzelast ist ein Blatt mit allen seinen Codes.
    children = [
        {
            "name": r["name"],
            "description": r["description"],
            "introduction": r.get("introduction"),
            "children": [],
            "own_codes": groups.get(r["name"], []),
        }
        for r in roots
    ]
    root = {
        "name": "(Wurzel)",
        "description": "",
        "children": children,
        "own_codes": [],
    }
    return root, groups.get("andere", [])


def propose_roots(
    llm,
    seed: str,
    *,
    ballot_description: str | None = None,
    n_topics: int | None = None,
) -> list[dict]:
    """Wurzelthemen NUR aus den offiziellen Argumenten ableiten (der Seed).

    `n_topics` legt die gewünschte Anzahl Themenfelder fest (None → Default 4–7).
    Bewusst getrennt vom Einsortieren, damit die zweiphasige Prozess-Simulation
    (Grundstruktur aus offiziellen Argumenten, Community erst NACHTRÄGLICH) die
    Themen einmal festlegen und dann fix halten kann."""
    ctx = ""
    if ballot_description:
        ctx = "Beschreibung der Vorlage (amtlich):\n" + ballot_description + "\n\n"
    return propose_topics(
        llm, sys_roots(n_topics), ctx + "Offizielle Argumente:\n" + seed
    )


def _arg_membership(arg: dict) -> dict:
    """Eine Argument-Membership in kanonischer Persistenz-Form (wie
    db.fetch_topic_tree / db._insert_topic_tree erwarten). Immer Primär
    (is_primary=true) — Nebenthemen gibt es nicht mehr."""
    return {
        "argument_uri": arg.get("uri") or arg.get("argument_uri"),
        "is_primary": True,
        "stance": arg.get("stance"),
        "confidence": None,
        "code": None,
    }


def _distribute_args(
    roots: list[dict], args: list[dict], assign: dict[str, str]
) -> dict:
    """Argumente (je einem Thema zugeordnet) auf die FIXEN Wurzelthemen verteilen.

    Jeder Knoten bekommt `arguments`: [{argument_uri, is_primary, stance, …}].
    Jedes Argument hängt an GENAU EINEM Knoten. Argumente ohne passendes Thema
    ('andere') hängen an der Wurzel (= „nicht zugeordnet", im Frontend unsichtbar).
    Rückgabe: Wurzelknoten."""
    by_uri = {_auri(a): a for a in args}
    prim_by: dict[str, list[str]] = defaultdict(list)
    andere: list[str] = []
    for a in args:
        uri = _auri(a)
        topic = assign.get(uri, "andere")
        if topic == "andere":
            andere.append(uri)
        else:
            prim_by[topic].append(uri)

    def members(uris: list[str]) -> list[dict]:
        return [_arg_membership(by_uri[u]) for u in uris if u in by_uri]

    children = [
        {
            "name": r["name"],
            "description": r["description"],
            "introduction": r.get("introduction"),
            "importance": r.get("importance"),
            "children": [],
            "arguments": members(prim_by.get(r["name"], [])),
        }
        for r in roots
    ]
    return {
        "name": "(Wurzel)",
        "description": "",
        "children": children,
        "arguments": members(andere),
    }


def induce_tree_args(
    llm,
    args: list[dict],
    seed: str,
    *,
    ballot_description: str | None = None,
) -> tuple[dict, dict[str, dict]]:
    """[Einphasig] Wurzelthemen aus dem Seed + ALLE `args` auf einmal einsortieren.

    Für die zweiphasige Prozess-Simulation (offiziell zuerst → Grundstruktur,
    Community NACHTRÄGLICH in die fixe Struktur) siehe `run_args` / der /induce-
    Endpoint, die `propose_roots` + `classify_arguments` getrennt kombinieren.
    Rückgabe: (Wurzelknoten mit `arguments`, assign-Map)."""
    roots = propose_roots(llm, seed, ballot_description=ballot_description)
    assign = classify_arguments(llm, [r["name"] for r in roots], args)
    return _distribute_args(roots, args, assign), assign


def serialize_node(node: dict, code_args: dict) -> dict:
    """Internen Knoten → saubere API-Form (camelCase, Counts, Leaf-Codes)."""
    nc, na = _count(node, code_args)
    out = {
        "name": node.get("name"),
        "description": node.get("description") or None,
        "introduction": node.get("introduction") or None,
        "codeCount": nc,
        "argumentCount": na,
        "children": [serialize_node(ch, code_args) for ch in node.get("children", [])],
        # Codes, die direkt an diesem Knoten hängen (Blatt oder „andere"-Rest).
        "codes": list(node.get("own_codes", [])),
    }
    return out


def serialize_node_args(node: dict) -> dict:
    """Argument-Knoten → saubere API-Form (camelCase, Counts). `arguments` =
    [{argument_uri, is_primary, stance}]. `argumentCount` = distinct Argumente im
    Teilbaum (jedes Argument hängt an genau einem Knoten)."""

    def collect(n: dict) -> set:
        s = {a["argument_uri"] for a in n.get("arguments", [])}
        for ch in n.get("children", []):
            s |= collect(ch)
        return s

    return {
        "name": node.get("name"),
        "description": node.get("description") or None,
        "introduction": node.get("introduction") or None,
        "importance": node.get("importance"),
        "argumentCount": len(collect(node)),
        "directCount": len(node.get("arguments", [])),
        "children": [serialize_node_args(ch) for ch in node.get("children", [])],
        "arguments": [
            {
                "argument_uri": a["argument_uri"],
                "is_primary": a.get("is_primary", True),
                "stance": a.get("stance"),
            }
            for a in node.get("arguments", [])
        ],
    }


def _count(node: dict, code_args: dict) -> tuple[int, int]:
    """(Codes gesamt im Teilbaum, distinct Argumente im Teilbaum)."""
    codes = set(node.get("own_codes", []))
    for ch in node.get("children", []):
        sub = _collect_codes(ch)
        codes |= sub
    args = set()
    for c in codes:
        args |= code_args.get(c, set())
    return len(codes), len(args)


def _collect_codes(node: dict) -> set:
    codes = set(node.get("own_codes", []))
    for ch in node.get("children", []):
        codes |= _collect_codes(ch)
    return codes


# =========================================================================
#  Vorschau-Bäume: aus dem persistierten Stand (db.fetch_topic_tree-Form) einen
#  internen Baum + code_args bauen, hypothetische Änderungen (classify/grow) in
#  memory anwenden und via serialize_node als Vorschau zurückgeben — OHNE die DB
#  zu berühren. Spiegelt db.add_topic_memberships / db.split_node.
# =========================================================================
def persisted_to_internal(node: dict) -> tuple[dict, dict]:
    """db.fetch_topic_tree-Knoten → (interner Knoten {id, name, description,
    own_codes, children}, code_args-Map {code: set(argument_uri)}). Ein Code hängt
    je Knoten genau einmal (distinct); die Argumente fliessen in code_args."""
    code_args: dict[str, set] = defaultdict(set)

    def conv(n: dict) -> dict:
        own: list[str] = []
        seen: set[str] = set()
        for c in n.get("codes", []) or []:
            if isinstance(c, dict):
                lbl = (c.get("code") or "").strip()
                arg = c.get("argument_uri")
            else:
                lbl, arg = str(c).strip(), None
            if not lbl:
                continue
            if lbl not in seen:
                seen.add(lbl)
                own.append(lbl)
            if arg:
                code_args[lbl].add(arg)
        return {
            "id": n.get("id"),
            "name": n.get("name"),
            "description": n.get("description"),
            "own_codes": own,
            "children": [conv(ch) for ch in n.get("children", []) or []],
        }

    return conv(node), code_args


def _index_by_id(root: dict) -> dict:
    idx: dict = {}

    def walk(n: dict) -> None:
        if n.get("id") is not None:
            idx[n["id"]] = n
        for ch in n.get("children", []):
            walk(ch)

    walk(root)
    return idx


def overlay_placements(
    root: dict, code_args: dict, placements: dict[str, int], new_entries: list[dict]
) -> None:
    """Hängt neue Codes (placements: code → node_id) in den internen Baum und
    ergänzt code_args um die neuen Argumente — wie db.add_topic_memberships, aber
    nur in memory (für die Vorschau)."""
    idx = _index_by_id(root)
    for code, node_id in placements.items():
        node = idx.get(node_id)
        if node is not None and code not in node["own_codes"]:
            node["own_codes"].append(code)
    for e in new_entries:
        if e["code"] in placements:
            code_args[e["code"]].add(e["argument_uri"])


def overlay_split(
    root: dict, parent_id: int, subtopics: list[dict], assign: dict[str, str]
) -> None:
    """Wendet einen Split (neue Kind-Knoten + Umhängen der Codes) in memory an —
    wie db.split_node, nur für die Vorschau. Kinder bekommen keine id."""
    parent = _index_by_id(root).get(parent_id)
    if parent is None:
        return
    used = {t for t in assign.values() if t != "andere"}
    name_to_child: dict[str, dict] = {}
    for s in subtopics:
        if s["name"] not in used:
            continue  # leeres Unterthema nicht anlegen
        child = {
            "id": None,
            "name": s["name"],
            "description": s.get("description"),
            "own_codes": [],
            "children": [],
        }
        name_to_child[s["name"]] = child
        parent["children"].append(child)
    remaining: list[str] = []
    for code in parent["own_codes"]:
        child = name_to_child.get(assign.get(code))
        if child is not None:
            child["own_codes"].append(code)
        else:
            remaining.append(code)  # 'andere'/unverteilt → bleibt am Eltern
    parent["own_codes"] = remaining


def _print_tree(node: dict, code_args: dict, indent: int = 0):
    pad = "  " * indent
    nc, na = _count(node, code_args)
    name = node.get("name", "(Wurzel)")
    print(f"{pad}▸ {name}  [{nc} Codes, {na} Args]")
    if node.get("description"):
        print(f"{pad}    {node['description']}")
    for ch in node.get("children", []):
        _print_tree(ch, code_args, indent + 1)
    own = node.get("own_codes", [])
    if own and node.get("children"):
        # nur am Knoten verbliebene Codes (passten in kein Unterthema)
        print(f"{pad}  · direkt hier: {len(own)} Codes")
    if own and not node.get("children"):
        for c in own[:8]:
            print(f"{pad}    – {c}")
        if len(own) > 8:
            print(f"{pad}    … (+{len(own) - 8})")


async def load_inputs(
    ballot_rkey: str, limit: int | None = None, official_only: bool = False
) -> dict:
    """Lädt die Eingaben für einen Ballot (read-only). Rückgabe-Dict:
    codes      — eindeutige Code-Labels (Auftauchreihenfolge)
    code_args  — Code → set(argument_uri)
    entries    — [(argument_uri, code, confidence, stance)] (für Memberships)
    seed       — Text der offiziellen Argumente (Wurzelthemen-Seed)
    n_args/n_off
    """
    coded = await db.fetch_open_codes_for_ballot(
        ballot_rkey, limit=limit, source_type="official" if official_only else None
    )
    code_args: dict[str, set] = defaultdict(set)
    codes: list[str] = []
    seen: set[str] = set()
    entries: list[tuple] = []
    for r in coded:
        seen_in_arg: set[str] = set()
        for c in r["codes"]:
            lbl = (c.get("code") or "").strip()
            if not lbl or lbl in seen_in_arg:
                continue
            seen_in_arg.add(lbl)
            code_args[lbl].add(r["argument_uri"])
            entries.append(
                (
                    r["argument_uri"],
                    lbl,
                    float(c.get("confidence", 1.0)),
                    r.get("stance"),
                )
            )
            if lbl not in seen:
                seen.add(lbl)
                codes.append(lbl)
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        offs = await conn.fetch(
            """SELECT title, body FROM app_arguments
               WHERE ballot_rkey = $1 AND source_type = 'official' AND NOT deleted
               ORDER BY created_at""",
            ballot_rkey,
        )
    seed = "\n\n".join(f"- {o['title']}: {o['body'] or ''}" for o in offs)
    # Amtliche Vorlagen-Beschreibung (CMS) als Zusatzkontext für die Wurzelthemen.
    ballot_description = await db.fetch_ballot_description(ballot_rkey)
    return {
        "codes": codes,
        "code_args": code_args,
        "entries": entries,
        "seed": seed,
        "ballot_description": ballot_description,
        "n_args": len(coded),
        "n_off": len(offs),
    }


async def load_arguments(ballot_rkey: str, limit: int | None = None) -> dict:
    """Lädt die Argumente eines Ballots für den ARGUMENT-Pfad (read-only).

    Anders als `load_inputs` hängt das NICHT am Open-Coding-Status — die Einheit
    ist das Argument selbst. Rückgabe-Dict:
        args   — [{uri, text, stance, source_type}], offizielle zuerst
        seed   — Text der offiziellen Argumente (Wurzelthemen-Seed)
        ballot_description, n_args, n_off
    """
    pool = await db.get_pool()
    sql = """
        SELECT uri, title, body, type, source_type FROM app_arguments
        WHERE ballot_rkey = $1 AND NOT deleted
        ORDER BY (source_type = 'official') DESC, created_at ASC
    """
    params: list = [ballot_rkey]
    if limit:
        params.append(limit)
        sql += f" LIMIT ${len(params)}"
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
    args: list[dict] = []
    offs: list[tuple] = []
    for r in rows:
        title, body = r["title"] or "", r["body"] or ""
        stance = (r["type"] or "").strip().lower()
        args.append(
            {
                "uri": r["uri"],
                "text": f"{title}\n\n{body}".strip(),
                "stance": stance if stance in ("pro", "contra") else None,
                "source_type": r["source_type"],
            }
        )
        if r["source_type"] == "official":
            offs.append((title, body))
    seed = "\n\n".join(f"- {t}: {b or ''}" for t, b in offs)
    ballot_description = await db.fetch_ballot_description(ballot_rkey)
    return {
        "args": args,
        "seed": seed,
        "ballot_description": ballot_description,
        "n_args": len(args),
        "n_off": len(offs),
    }


def _node_key(node: dict):
    """Knoten-Identität fürs Einsortieren: bevorzugt die Client-`uid` (State-Editor,
    auch für neue Knoten ohne DB-id), sonst die DB-`id`."""
    return node.get("uid") if node.get("uid") is not None else node.get("id")


def classify_incremental(
    llm, root_node: dict, new_codes: list[str]
) -> dict[str, object]:
    """Q4 — sortiert `new_codes` top-down in den BESTEHENDEN Baum ein
    (`root_node` = Nested-Dict mit 'children' und je Knoten 'uid' oder 'id').

    Pro Ebene ein classify-Call: passt ein Code in ein Kind-Thema, steigt er ab;
    passt er in keins ('andere'), bleibt er am aktuellen Knoten hängen. Rückgabe:
    {code: node_key} — wohin jeder neue Code gehört (node_key = uid|id).

    AUSNAHME Wurzelebene: Codes, die in KEIN Oberthema passen ('andere' direkt an
    der Wurzel), werden NICHT platziert — sie bleiben „nicht zugeordnet" (kein
    Eintrag in der Rückgabe) und tauchen nur im CMS-„Nicht zugeordnet"-Bereich auf,
    nicht im Frontend. „andere" auf tieferen Ebenen bleibt dagegen legitim am
    Themenknoten hängen (übergreifend zum Thema)."""
    placements: dict[str, object] = {}

    def descend(node: dict, codes: list[str], is_root: bool = False):
        children = node.get("children", [])
        if not children or not codes:
            if is_root:
                return  # leerer Baum → alles bleibt nicht zugeordnet
            for c in codes:
                placements[c] = _node_key(node)
            return
        assign = classify(llm, [ch["name"] for ch in children], codes)
        by_child: dict[str, list[str]] = defaultdict(list)
        for c, t in assign.items():
            by_child[t].append(c)
        for c in by_child.get("andere", []):  # passt in kein Kind
            if is_root:
                continue  # passt in kein Oberthema → nicht zuordnen (nicht an Wurzel hängen)
            placements[c] = _node_key(
                node
            )  # tieferer Knoten → übergreifend, bleibt hier
        for ch in children:
            cc = by_child.get(ch["name"], [])
            if cc:
                descend(ch, cc)

    descend(root_node, new_codes, is_root=True)
    return placements


def classify_incremental_args(
    llm, root_node: dict, new_args: list[dict]
) -> dict[str, object]:
    """Argument-Variante von `classify_incremental`: sortiert `new_args`
    ([{uri, text}]) top-down PRIMÄR in den bestehenden Baum ein (`root_node` =
    Nested-Dict mit 'children' und je Knoten 'uid' oder 'id').

    Pro Ebene ein classify-Call: passt ein Argument in ein Kind-Thema, steigt es
    ab; passt es in keins ('andere'), bleibt es am aktuellen Knoten hängen.
    Wurzel-'andere' → nicht platziert (kein Eintrag). Rückgabe: {uri: node_key}."""
    placements: dict[str, object] = {}

    def descend(node: dict, items: list[dict], is_root: bool = False):
        children = node.get("children", [])
        if not children or not items:
            if is_root:
                return
            for it in items:
                placements[it["uri"]] = _node_key(node)
            return
        assign = classify_arguments(llm, [ch["name"] for ch in children], items)
        by_child: dict[str, list[dict]] = defaultdict(list)
        for it in items:
            topic = assign.get(it["uri"], "andere")
            by_child[topic].append(it)
        for it in by_child.get("andere", []):
            if is_root:
                continue
            placements[it["uri"]] = _node_key(node)
        for ch in children:
            cc = by_child.get(ch["name"], [])
            if cc:
                descend(ch, cc)

    descend(root_node, new_args, is_root=True)
    return placements


def overfull_candidates_args(root: dict, threshold: int, max_depth: int) -> list[dict]:
    """Argument-Variante von `overfull_candidates`: überladene Knoten eines
    IN-MEMORY-Baums (State-Editor) anhand der DIREKTEN PRIMÄR-Argumente bestimmen.
    Knoten tragen `arguments`: [{argument_uri, is_primary, …}]. Rückgabe:
    [{uid, name, depth, arguments:[uri,…], is_root}], grösste zuerst."""
    out: list[dict] = []

    def direct_primary(node: dict) -> list[str]:
        seen: set[str] = set()
        uris: list[str] = []
        for a in node.get("arguments", []) or []:
            if isinstance(a, dict) and not a.get("is_primary", True):
                continue
            uri = (a.get("argument_uri") if isinstance(a, dict) else a) or ""
            uri = str(uri).strip()
            if uri and uri not in seen:
                seen.add(uri)
                uris.append(uri)
        return uris

    def walk(node: dict, depth: int):
        uris = direct_primary(node)
        if depth < max_depth and len(uris) >= threshold:
            out.append(
                {
                    "uid": _node_key(node),
                    "name": node.get("name"),
                    "depth": depth,
                    "arguments": uris,
                    "is_root": depth == 0,
                }
            )
        for ch in node.get("children", []) or []:
            walk(ch, depth + 1)

    walk(root, 0)
    out.sort(key=lambda c: len(c["arguments"]), reverse=True)
    return out


def overfull_candidates(root: dict, threshold: int, max_depth: int) -> list[dict]:
    """Überladene Knoten eines IN-MEMORY-Baums (State-Editor) bestimmen — analog
    db.fetch_overfull_nodes, aber ohne DB. „Direkte Codes" = distinct Code-Labels
    der Memberships, die direkt an diesem Knoten hängen (`codes`). Rückgabe:
    [{uid, name, depth, codes:[label,...], is_root}], grösste zuerst."""
    out: list[dict] = []

    def direct_codes(node: dict) -> list[str]:
        seen: set[str] = set()
        labels: list[str] = []
        for c in node.get("codes", []) or []:
            lbl = (c.get("code") if isinstance(c, dict) else c) or ""
            lbl = str(lbl).strip()
            if lbl and lbl not in seen:
                seen.add(lbl)
                labels.append(lbl)
        return labels

    def walk(node: dict, depth: int):
        labels = direct_codes(node)
        if depth < max_depth and len(labels) >= threshold:
            out.append(
                {
                    "uid": _node_key(node),
                    "name": node.get("name"),
                    "depth": depth,
                    "codes": labels,
                    "is_root": depth == 0,
                }
            )
        for ch in node.get("children", []) or []:
            walk(ch, depth + 1)

    walk(root, 0)
    out.sort(key=lambda c: len(c["codes"]), reverse=True)
    return out


def _print_tree_args(node: dict, indent: int = 0):
    pad = "  " * indent
    n = len(node.get("arguments", []))
    name = node.get("name", "(Wurzel)")
    print(f"{pad}▸ {name}  [{n} Argumente]")
    if node.get("description"):
        print(f"{pad}    {node['description']}")
    for ch in node.get("children", []):
        _print_tree_args(ch, indent + 1)


async def run_args(ballot_rkey: str):
    """Argument-basierter Parallel-Pfad, ZWEIPHASIG (simuliert den realen Prozess):

      Phase 1 — Grundstruktur: Wurzelthemen NUR aus den offiziellen Argumenten
                ableiten und die offiziellen Argumente einsortieren.
      Phase 2 — Community NACHTRÄGLICH: die Community-Argumente in die FIXE
                Struktur einsortieren (keine neuen Wurzelthemen). Argumente, die
                in kein Thema passen, landen unter „nicht zugeordnet" (andere) —
                das zeigt, ob die offizielle Struktur die Debatte abdeckt.

    Einheit = Argument; jedes Argument wird genau einem Thema zugeordnet.
    Read-only, schreibt JSON."""
    data = await load_arguments(ballot_rkey)
    args = data["args"]
    official = [a for a in args if a["source_type"] == "official"]
    community = [a for a in args if a["source_type"] != "official"]
    if not official:
        print(
            f"Keine offiziellen Argumente für {ballot_rkey} — keine Grundstruktur möglich."
        )
        return
    llm = _CountingLLM(get_llm())

    # --- Phase 1: Grundstruktur aus den offiziellen Argumenten -----------------
    roots = propose_roots(
        llm, data["seed"], ballot_description=data.get("ballot_description")
    )
    names = [r["name"] for r in roots]
    assign = classify_arguments(llm, names, official)
    print(
        f"Phase 1 — Grundstruktur aus {len(official)} offiziellen Argumenten: "
        f"{len(roots)} Wurzelthemen"
    )

    # --- Phase 2: Community-Argumente nachträglich in die fixe Struktur ---------
    if community:
        assign.update(classify_arguments(llm, names, community))
        n_andere = sum(
            1 for a in community if assign.get(a["uri"], "andere") == "andere"
        )
        print(
            f"Phase 2 — {len(community)} Community-Argumente einsortiert: "
            f"{n_andere} nicht zugeordnet"
        )

    root = _distribute_args(roots, args, assign)
    root["name"] = f"Vorlage {ballot_rkey}"
    andere = root.get("arguments", [])
    print(
        f"\n({llm.calls} LLM-Calls) — {len(args)} Argumente, "
        f"{len(andere)} nicht zugeordnet\n" + "=" * 72
    )
    _print_tree_args(root)
    if andere:
        print(f"\n[nicht zugeordnet — Wurzel]: {len(andere)} Argumente")

    out_path = f"topdown_args_{ballot_rkey.replace('.', '_')}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(root, f, ensure_ascii=False, indent=2)
    print(f"\nBaum als JSON: {out_path}")
    await db.close_pool()


async def run(ballot_rkey: str):
    data = await load_inputs(ballot_rkey)
    codes, code_args, seed = data["codes"], data["code_args"], data["seed"]
    if not codes:
        print(f"Keine codierten Argumente für {ballot_rkey}.")
        return
    print(
        f"Seed: {data['n_off']} offizielle Argumente, {len(codes)} Codes, "
        f"{data['n_args']} codierte Argumente.\n"
    )
    llm = _CountingLLM(get_llm())
    root, andere = induce_tree(
        llm,
        codes,
        seed,
        ballot_description=data.get("ballot_description"),
    )
    root["name"] = f"Vorlage {ballot_rkey}"
    root["own_codes"] = andere
    print(f"({llm.calls} LLM-Calls)\n" + "=" * 72)
    _print_tree(root, code_args)
    if andere:
        print(
            f"\n[andere — Wurzel]: {len(andere)} Codes, z.B. " + ", ".join(andere[:6])
        )

    out_path = f"topdown_{ballot_rkey.replace('.', '_')}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(root, f, ensure_ascii=False, indent=2)
    print(f"\nBaum als JSON: {out_path}")
    await db.close_pool()


if __name__ == "__main__":
    # `--args` → argument-basierter Parallel-Pfad; ohne Flag → Open-Code-Pfad.
    argv = [a for a in sys.argv[1:] if not a.startswith("--")]
    use_args = "--args" in sys.argv[1:]
    ballot = argv[0] if argv else "663.1"
    asyncio.run(run_args(ballot) if use_args else run(ballot))
