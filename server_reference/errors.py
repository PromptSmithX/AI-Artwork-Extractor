"""Error classes for the AI Artwork Extractor reference server.

Shared across api.py, fake_engines.py, and qwen_prompt_assistant.py.
"""
from __future__ import annotations


class PromptAssistantUnavailable(RuntimeError):
    """Raised when the prompt assistant model is unavailable or failed to load."""


class PromptAssistantOutputError(RuntimeError):
    """Raised when the prompt assistant model returns invalid or unparseable output."""
