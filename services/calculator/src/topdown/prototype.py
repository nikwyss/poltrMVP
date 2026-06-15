"""
Top-down Themen-Hierarchie: Kern-Logik (genutzt von src/topdown/router.py).

Wir bauen einen Themen-BAUM von oben — Einheit ist das ARGUMENT:

  1. Wurzelthemen aus den OFFIZIELLEN Argumenten der Vorlage ableiten (der Seed).
  2. Argumente top-down in die Themen einsortieren (genau EIN Thema pro Argument).
  3. Überladene Knoten bei Bedarf in Unterthemen aufteilen (/grow).

ZWEIPHASIG, um den realen Prozess zu simulieren: Phase 1 leitet die Grundstruktur
NUR aus den offiziellen Argumenten ab; Phase 2 sortiert die Community-Argumente
NACHTRÄGLICH in diese fixe Struktur ein.

Die CLI (`python -m src.topdown.prototype <rkey>`) ist read-only und schreibt
`topdown_args_<rkey>.json` zur Exploration; der produktive Pfad läuft über die
Endpoints in router.py (persistiert in app_topic_node / app_topic_membership).
"""

from __future__ import annotations
import asyncio
import json
import sys
from collections import defaultdict

from src.core import db
from src.llm import get_llm

# Knoten ab dieser Tiefe werden nicht weiter gesplittet (Finanzierung → Steuern
# → Mehrwertsteuer).
MAX_DEPTH = 3

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
                            "Verständlich, als neutraler Erzähler mit indirekter Rede (Beispiel: 'Das Ja-Lager geht davon aus, dass...', Das Nein-Lager zweifelt an, dass). Schweizer Rechtschreibung (ss statt ß).",
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
    " Verfasse pro Thema ZUSÄTZLICH eine kurze `introduction` (1–2 Sätze) AN DIE "
    "STIMMBÜRGERSCHAFT: warum dieses Thema bei der Abstimmung von Bedeutung ist "
    "und ganz grob erwähnen ob es fürs Ja- oder Nein-Lager (oder beide) wichtig ist. "
    "Verständlich, als neutraler Erzähler mit indirekter Rede (Beispiel: 'Das Ja-Lager "
    "geht davon aus, dass...', Das Nein-Lager zweifelt an, dass). Schweizer "
    "Rechtschreibung (ss statt ß)."
)

# Klassifikation (Einheit = Argument): jedes Argument wird GENAU EINEM Thema
# zugeordnet (keine Mehrfachmitgliedschaft).
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
                        "confidence": {
                            "type": "integer",
                            "description": "Wie sicher passt das Argument zu diesem "
                            "Thema? 1–5 (5=eindeutig, 3=plausibel, 1=sehr unsicher).",
                        },
                    },
                    "required": ["id", "topic", "confidence"],
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
    "Du verfeinerst EIN Themenfeld einer Abstimmungsdebatte. Unten die Argumente, die diesem "
    "Thema zugeordnet sind. Zerfallen sie in 2–4 sinnvolle UNTERTHEMEN (spezifischer als "
    "das Oberthema, aber weiterhin inhaltlich)? "
    "Wenn das Thema bereits kohärent/atomar ist oder zu wenig Substanz für eine sinnvolle "
    "Unterteilung hat, gib eine LEERE Liste zurück — NICHT künstlich aufteilen. "
    "Schweizer Rechtschreibung (ss statt ß)." + _IMPORTANCE_NOTE + _INTRODUCTION_NOTE
)

_SYS_CLASSIFY_ARGS = (
    "Ordne jedes Argument GENAU EINEM Thema aus der vorgegebenen Liste zu (exakter "
    "Name). Passt es zu keinem, nutze 'andere'. Gib für jedes Argument id + Thema "
    "zurück sowie eine confidence 1–5, wie sicher die Zuordnung ist "
    "(5=eindeutig, 3=plausibel, 1=sehr unsicher)."
)

# Für horizontales Wachstum: die Argumente passten in KEIN bestehendes Wurzelthema.
_SYS_NEW_BRANCHES = (
    "Die folgenden Argumente einer Abstimmungsdebatte passten in KEINES der "
    "bestehenden Themenfelder. Bilden sie 1–4 NEUE, eigenständige Themenfelder "
    "(so breit und inhaltlich wie die bestehenden Wurzelthemen — nicht pro/contra)? "
    "Gib nur wirklich tragfähige Themen zurück; für vereinzelte Ausreisser eine "
    "LEERE Liste. Schweizer Rechtschreibung (ss statt ß)."
    + _IMPORTANCE_NOTE
    + _INTRODUCTION_NOTE
)


def _clamp_importance(v) -> int | None:
    """LLM-Wert auf eine ganze Zahl 1–5 normieren (None, falls unbrauchbar)."""
    try:
        i = int(round(float(v)))
    except (TypeError, ValueError):
        return None
    return max(1, min(5, i))


# Klassifikations-Konfidenz nutzt dieselbe 1–5-Normierung wie die Node-Importance.
_clamp_confidence = _clamp_importance


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


def _auri(a: dict) -> str:
    """Argument-URI eines Items — toleriert beide Loader-Schlüssel: `uri`
    (prototype.load_arguments) und `argument_uri` (db.fetch_arguments)."""
    return a.get("uri") or a.get("argument_uri")


def classify_arguments(
    llm,
    topic_names: list[str],
    args: list[dict],
    *,
    batch_size: int = 40,
    conf_out: dict | None = None,
) -> dict[str, str]:
    """Jedes Argument GENAU EINEM Thema (oder 'andere') zuordnen.

    Einheit = Argument. Rückgabe: {argument_uri: <thema|'andere'>}. Wird `conf_out`
    übergeben, füllt es zusätzlich {argument_uri: confidence 1–5} (Klassifikator-
    Sicherheit; None wenn das LLM keine brauchbare Zahl lieferte).

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
            uri = id_to_uri[aid]
            res[uri] = topic if topic in valid else "andere"
            if conf_out is not None:
                conf_out[uri] = _clamp_confidence(a.get("confidence"))
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
    db.fetch_topic_tree / db._insert_topic_tree erwarten). Jedes Argument hängt an
    GENAU EINEM Knoten (kein is_primary mehr). `confidence` = Klassifikator-
    Sicherheit 1–5 (falls vorhanden)."""
    return {
        "argument_uri": arg.get("uri") or arg.get("argument_uri"),
        "stance": arg.get("stance"),
        "confidence": arg.get("confidence"),
    }


def _distribute_args(
    roots: list[dict], args: list[dict], assign: dict[str, str]
) -> dict:
    """Argumente (je einem Thema zugeordnet) auf die FIXEN Wurzelthemen verteilen.

    Jeder Knoten bekommt `arguments`: [{argument_uri, stance, confidence}].
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


def serialize_node_args(node: dict) -> dict:
    """Argument-Knoten → saubere API-Form (camelCase, Counts). `arguments` =
    [{argument_uri, stance, confidence}]. `argumentCount` = distinct Argumente im
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
                "stance": a.get("stance"),
                "confidence": a.get("confidence"),
            }
            for a in node.get("arguments", [])
        ],
    }


async def load_arguments(ballot_rkey: str, limit: int | None = None) -> dict:
    """Lädt die Argumente eines Ballots (read-only). Einheit ist das Argument
    selbst (direkt auf Titel + Body klassifiziert). Rückgabe-Dict:
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


def classify_incremental_args(
    llm, root_node: dict, new_args: list[dict], *, conf_out: dict | None = None
) -> dict[str, object]:
    """Sortiert `new_args` ([{uri, text}]) top-down in den bestehenden Baum ein
    (`root_node` = Nested-Dict mit 'children' und je Knoten 'uid'/'id').

    Pro Ebene ein classify-Call: passt ein Argument in ein Kind-Thema, steigt es
    ab; passt es in keins ('andere'), bleibt es am aktuellen Knoten hängen.
    Wurzel-'andere' → nicht platziert (kein Eintrag). Rückgabe: {uri: node_key}.
    Wird `conf_out` übergeben, füllt es {uri: confidence 1–5} (Sicherheit der
    Zuordnung auf der Ebene, auf der das Argument schliesslich landet)."""
    placements: dict[str, object] = {}

    def descend(node: dict, items: list[dict], is_root: bool = False):
        children = node.get("children", [])
        if not children or not items:
            if is_root:
                return
            for it in items:
                placements[it["uri"]] = _node_key(node)
            return
        assign = classify_arguments(
            llm, [ch["name"] for ch in children], items, conf_out=conf_out
        )
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
    """Überladene Knoten eines IN-MEMORY-Baums (State-Editor) anhand der
    DIREKTEN Argumente bestimmen.
    Knoten tragen `arguments`: [{argument_uri, …}]. Rückgabe:
    [{uid, name, depth, arguments:[uri,…], is_root}], grösste zuerst."""
    out: list[dict] = []

    def direct_args(node: dict) -> list[str]:
        seen: set[str] = set()
        uris: list[str] = []
        for a in node.get("arguments", []) or []:
            uri = (a.get("argument_uri") if isinstance(a, dict) else a) or ""
            uri = str(uri).strip()
            if uri and uri not in seen:
                seen.add(uri)
                uris.append(uri)
        return uris

    def walk(node: dict, depth: int):
        uris = direct_args(node)
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


if __name__ == "__main__":
    # Read-only-Exploration des argument-basierten Baums (schreibt JSON).
    argv = [a for a in sys.argv[1:] if not a.startswith("--")]
    ballot = argv[0] if argv else "663.1"
    asyncio.run(run_args(ballot))
