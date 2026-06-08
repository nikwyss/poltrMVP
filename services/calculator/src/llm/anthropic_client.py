"""
AnthropicLLM — produktiver LLM-Client (Tool-Use / forced tool calls).

Wird automatisch verwendet, wenn ANTHROPIC_API_KEY gesetzt ist. Jede
Entscheidung wird über ein erzwungenes Tool-Schema strukturiert zurückgegeben,
sodass kein Freitext geparst werden muss. Genutzt vom Top-down-Pfad
(src/topdown) über `_call`.
"""

from __future__ import annotations
import logging

from anthropic import Anthropic

from src.llm.base import LLMClient
from src import config

logger = logging.getLogger("calculator.llm")


class AnthropicLLM(LLMClient):
    name = "anthropic"

    def __init__(self, model: str | None = None, max_tokens: int = 800):
        self.client = Anthropic(api_key=config.ANTHROPIC_API_KEY)
        self.model = model or config.LLM_MODEL
        self.max_tokens = max_tokens

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
