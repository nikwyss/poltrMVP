"""
LLM-Schnittstelle des Calculator-Service.

Der produktive Pfad ist die Top-down Themen-Hierarchie (src/topdown): sie ruft
`AnthropicLLM._call` (forced tool-use) über die Factory `get_llm()`. `LLMClient`
ist nur noch der gemeinsame Basistyp.
"""

from __future__ import annotations


class LLMClient:
    """Basistyp für LLM-Clients. Konkrete Clients (AnthropicLLM) implementieren
    `_call` (forced tool-use)."""

    name: str = "base"
