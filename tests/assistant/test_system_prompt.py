"""Tests for SYSTEM_PROMPT and build_user_message in qwen_prompt_assistant."""
from __future__ import annotations

import pytest

from server_reference.qwen_prompt_assistant import SYSTEM_PROMPT, build_user_message
from server_reference.schemas import ScopePreference


def test_system_prompt_verbatim():
    """Verify SYSTEM_PROMPT matches plan §4.4 requirements."""
    assert "You are an assistant that converts a designer's natural-language" in SYSTEM_PROMPT
    assert "request into concise object concepts for Meta SAM 3 segmentation." in SYSTEM_PROMPT
    assert "Rules:" in SYSTEM_PROMPT
    assert "- Preserve the designer's intended extraction scope." in SYSTEM_PROMPT
    assert "- Distinguish entire_patch, inner_artwork, and individual_decoration." in SYSTEM_PROMPT
    assert "Return valid JSON only, using this schema:" in SYSTEM_PROMPT
    assert '"target_description": "short description"' in SYSTEM_PROMPT
    assert '"scope": "entire_patch | inner_artwork | individual_decoration | unknown"' in SYSTEM_PROMPT
    assert '"sam_prompt": "short noun phrase for SAM 3"' in SYSTEM_PROMPT
    assert '"alternative_prompts": ["prompt 1", "prompt 2"]' in SYSTEM_PROMPT
    assert '"location_hint": "short visible location or empty string"' in SYSTEM_PROMPT
    assert '"needs_clarification": false' in SYSTEM_PROMPT
    assert '"clarification_question": "empty string or one short question"' in SYSTEM_PROMPT
    assert '"reason": "brief explanation"' in SYSTEM_PROMPT


def test_build_user_message_auto_scope():
    """When scope_preference is auto, do not add a preference line."""
    req = "Tách logo bông hoa ở ngực áo"
    msg_enum = build_user_message(req, ScopePreference.AUTO)
    assert msg_enum == req

    msg_str = build_user_message(req, "auto")
    assert msg_str == req

    msg_none = build_user_message(req, None)
    assert msg_none == req


def test_build_user_message_specific_scopes():
    """When scope_preference != auto, add a line stating the designer preference."""
    req = "Tách huy hiệu trên mũ"

    msg_patch = build_user_message(req, ScopePreference.ENTIRE_PATCH)
    assert req in msg_patch
    assert "The designer prefers that scope: entire_patch." in msg_patch

    msg_inner = build_user_message(req, ScopePreference.INNER_ARTWORK)
    assert req in msg_inner
    assert "The designer prefers that scope: inner_artwork." in msg_inner

    msg_decor = build_user_message(req, ScopePreference.INDIVIDUAL_DECORATION)
    assert req in msg_decor
    assert "The designer prefers that scope: individual_decoration." in msg_decor


def test_build_user_message_string_scope():
    """String scope preferences should be handled case-insensitively."""
    req = "Tách patch"
    msg = build_user_message(req, "ENTIRE_PATCH")
    assert "The designer prefers that scope: entire_patch." in msg


def test_build_user_message_empty_request():
    """Empty or whitespace request should handle gracefully."""
    msg_auto = build_user_message("", ScopePreference.AUTO)
    assert msg_auto == ""

    msg_pref = build_user_message("   ", ScopePreference.ENTIRE_PATCH)
    assert msg_pref == "The designer prefers that scope: entire_patch."
