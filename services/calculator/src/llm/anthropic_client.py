"""
AnthropicLLM — produktiver LLM-Client (Tool-Use / forced tool calls).

Wird automatisch verwendet, wenn ANTHROPIC_API_KEY gesetzt ist. Jede
Entscheidung wird über ein erzwungenes Tool-Schema strukturiert zurückgegeben,
sodass kein Freitext geparst werden muss.
"""

from __future__ import annotations
import hashlib
import logging

from anthropic import Anthropic

from src.llm.base import LLMClient, OPEN_CODE_ERROR_NOTE, OPEN_CODE_EMPTY_NOTE
from src import config
from src.prompts import (SYSTEM_OPEN_CODING, axial_system, axial_split_system,
                         open_code_user, axial_user)

logger = logging.getLogger("calculator.llm")

_OPEN_CODE_TOOL = {
    "name": "open_code",
    "description": "Zerlege das Argument in kurze, eigenständige inhaltliche Codes (Open Coding).",
    "input_schema": {
        "type": "object",
        "properties": {
            "codes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "code": {"type": "string", "description": "kurze inhaltliche Substantiv-Phrase"},
                        "note": {"type": "string", "description": "1 Satz: was dieser Code im Argument meint"},
                        "confidence": {"type": "number", "description": "0..1, wie klar der Aspekt vorkommt"},
                    },
                    "required": ["code", "confidence"],
                },
            },
        },
        "required": ["codes"],
    },
}

_AXIAL_TOOL = {
    "name": "axial_group",
    "description": "Verdichte die Codes zu wenigen Streitachsen (Axial Coding).",
    "input_schema": {
        "type": "object",
        "properties": {
            "themes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string", "description": "kurzer Name des Streitpunkts"},
                        "description": {"type": "string", "description": "1 Satz, worum gestritten wird"},
                        "pole_a": {"type": "string", "description": "Position A (die eine Antwort auf die Streitfrage)"},
                        "pole_b": {"type": "string", "description": "Position B (die Gegenposition zur SELBEN Frage)"},
                        "codes": {
                            "type": "array",
                            "description": "die dieser Achse zugeordneten Codes, je mit Pol-Neigung",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": {"type": "string", "description": "Code-ID, z.B. 'c03'"},
                                    "pole": {"type": "string", "enum": ["a", "b", "neutral"],
                                             "description": "neigt der Code eher zu Pol A, Pol B oder ist neutral?"},
                                },
                                "required": ["id", "pole"],
                            },
                        },
                    },
                    "required": ["label", "description", "pole_a", "pole_b", "codes"],
                },
            },
        },
        "required": ["themes"],
    },
}


class AnthropicLLM(LLMClient):
    name = "anthropic"

    def __init__(self, model: str | None = None, max_tokens: int = 800):
        self.client = Anthropic(api_key=config.ANTHROPIC_API_KEY)
        self.model = model or config.LLM_MODEL
        self.max_tokens = max_tokens
        # Modell + Hash des Open-Coding-Prompts → ändert sich der Prompt oder
        # das Modell, ändert sich die Signatur und der Cache invalidiert.
        prompt_hash = hashlib.sha256(SYSTEM_OPEN_CODING.encode("utf-8")).hexdigest()[:8]
        self.open_code_signature = f"anthropic:{self.model}:{prompt_hash}"

    def _call(self, tool: dict, user: str, system: str,
              max_tokens: int | None = None) -> dict | None:
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens or self.max_tokens,
            system=system,
            tools=[tool],
            tool_choice={"type": "tool", "name": tool["name"]},
            messages=[{"role": "user", "content": user}],
        )
        for block in resp.content:
            if block.type == "tool_use":
                return block.input
        return None

    def open_code(self, argument: str, max_codes: int = 3,
                  raise_on_error: bool = False) -> list[dict]:
        user = open_code_user(argument, max_codes)
        try:
            out = self._call(_OPEN_CODE_TOOL, user, system=SYSTEM_OPEN_CODING)
        except Exception as err:
            logger.error("Anthropic open_code failed: %s", err)
            if raise_on_error:
                raise
            return [{"code": "Sonstiges", "note": OPEN_CODE_ERROR_NOTE, "confidence": 0.3}]
        codes = (out or {}).get("codes", [])
        return codes[:max_codes] if codes else [
            {"code": "Sonstiges", "note": OPEN_CODE_EMPTY_NOTE, "confidence": 0.3}]

    def axial_group(self, codes: list[dict], max_themes: int = 6) -> list[dict]:
        # max_themes (weicher Cap) steckt im System-Prompt.
        return self._group_codes(codes, axial_system(max_themes), what="axial_group")

    def split_axis(self, codes: list[dict], max_sub: int = 3) -> list[dict]:
        # Reorganisation: dieselbe Mechanik, aber Split-Prompt auf den Codes
        # EINER überladenen Achse (engeres Blickfeld → schärfere Schnitte).
        return self._group_codes(codes, axial_split_system(max_sub), what="split_axis")

    def _group_codes(self, codes: list[dict], system: str, *, what: str) -> list[dict]:
        """Gemeinsame Mechanik für Axial Coding und Achsen-Split: Codes mit
        stabilen IDs versehen, das Achsen-Tool zwingen, IDs zurück auf
        Original-Labels mappen. `system` unterscheidet axial vs. split."""
        # Stabile IDs vergeben, damit die Zuordnung NICHT über fragiles
        # String-Matching der (vom LLM oft umformulierten) Labels läuft.
        id_to_label: dict[str, str] = {}
        lines = []
        for i, c in enumerate(codes, 1):
            cid = f"c{i:02d}"
            label = (c.get("code") or "").strip()
            id_to_label[cid] = label
            lines.append(f"[{cid}] {label}"
                         + (f" — {c['note']}" if c.get("note") else ""))
        user = axial_user(lines)
        try:
            # Mehr Tokens: die Ausgabe listet potenziell viele Code-IDs auf.
            out = self._call(_AXIAL_TOOL, user, system=system, max_tokens=2000)
        except Exception as err:
            logger.error("Anthropic %s failed: %s", what, err)
            return []

        # IDs zurück auf Original-Labels übersetzen (Fallback: das LLM nannte das
        # Label selbst). Pol-Neigung je Code mitführen.
        known = set(id_to_label.values())
        themes = []
        for th in (out or {}).get("themes", []):
            code_items = []
            for item in th.get("codes", []):
                if isinstance(item, dict):
                    token, pole = str(item.get("id", "")).strip(), item.get("pole")
                else:                       # tolerant: nur ID als String
                    token, pole = str(item).strip(), None
                if token in id_to_label:
                    code_items.append({"code": id_to_label[token], "pole": pole})
                elif token in known:
                    code_items.append({"code": token, "pole": pole})
            themes.append({"label": th.get("label", ""),
                           "description": th.get("description", ""),
                           "pole_a": th.get("pole_a"),
                           "pole_b": th.get("pole_b"),
                           "codes": code_items})
        return themes
