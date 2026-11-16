"""Tests for parse_suggestion in qwen_prompt_assistant."""
from __future__ import annotations

import pytest

from server_reference.qwen_prompt_assistant import (
    PromptAssistantOutputError,
    parse_suggestion,
)
from server_reference.schemas import Scope


def test_parse_plain_json():
    """Parser handles clean, plain JSON without markdown fences."""
    raw = """
    {
        "target_description": "Square chest patch with flower",
        "scope": "entire_patch",
        "sam_prompt": "square embroidered fabric patch",
        "alternative_prompts": ["square badge", "fabric applique"],
        "location_hint": "chest area",
        "needs_clarification": false,
        "clarification_question": "",
        "reason": "Designer requested the complete outer patch"
    }
    """
    sug = parse_suggestion(raw)
    assert sug.target_description == "Square chest patch with flower"
    assert sug.scope == Scope.ENTIRE_PATCH
    assert sug.sam_prompt == "square embroidered fabric patch"
    assert sug.alternative_prompts == ["square badge", "fabric applique"]
    assert sug.location_hint == "chest area"
    assert sug.needs_clarification is False
    assert sug.clarification_question == ""
    assert sug.reason == "Designer requested the complete outer patch"


def test_parse_fenced_json():
    """Parser handles JSON wrapped in ```json ... ``` fences."""
    raw = """```json
    {
        "target_description": "Embroidered rose",
        "scope": "inner_artwork",
        "sam_prompt": "red embroidered rose flower",
        "alternative_prompts": ["embroidered rose"],
        "location_hint": "left collar",
        "needs_clarification": false,
        "clarification_question": "",
        "reason": "Extracted the inner rose motif"
    }
    ```"""
    sug = parse_suggestion(raw)
    assert sug.scope == Scope.INNER_ARTWORK
    assert sug.sam_prompt == "red embroidered rose flower"


def test_parse_fenced_json_without_lang():
    """Parser handles JSON wrapped in plain ``` ... ``` fences."""
    raw = """```
    {
        "target_description": "Embroidered star",
        "scope": "individual_decoration",
        "sam_prompt": "golden embroidered star decoration",
        "alternative_prompts": [],
        "needs_clarification": false
    }
    ```"""
    sug = parse_suggestion(raw)
    assert sug.scope == Scope.INDIVIDUAL_DECORATION
    assert sug.sam_prompt == "golden embroidered star decoration"


def test_parse_prose_around_json():
    """Parser extracts JSON when preceded and followed by assistant prose."""
    raw = """Here is the suggested segmentation prompt for SAM 3:

```json
{
    "target_description": "Circular hat patch",
    "scope": "entire_patch",
    "sam_prompt": "circular embroidered hat patch",
    "alternative_prompts": ["round patch"],
    "location_hint": "front visor",
    "needs_clarification": false,
    "clarification_question": "",
    "reason": "Identified the round patch on the front visor."
}
```

Please confirm or edit this prompt in the UI before segmenting!"""
    sug = parse_suggestion(raw)
    assert sug.target_description == "Circular hat patch"
    assert sug.sam_prompt == "circular embroidered hat patch"
    assert sug.scope == Scope.ENTIRE_PATCH


def test_parse_nested_braces_inside_strings():
    """Parser handles string values containing curly braces without breaking."""
    raw = """{
        "target_description": "A patch with {curly} and {nested} braces inside description",
        "scope": "entire_patch",
        "sam_prompt": "patch with {custom} embroidery",
        "alternative_prompts": ["patch with {alt} text"],
        "location_hint": "center",
        "needs_clarification": false,
        "clarification_question": "",
        "reason": "String has {braces} and escaped quotes \\"like {this}\\""
    }"""
    sug = parse_suggestion(raw)
    assert sug.target_description == "A patch with {curly} and {nested} braces inside description"
    assert sug.sam_prompt == "patch with {custom} embroidery"
    assert sug.alternative_prompts == ["patch with {alt} text"]
    assert "braces" in sug.reason


def test_parse_invalid_json_raises_error():
    """Malformed or non-JSON text raises PromptAssistantOutputError."""
    with pytest.raises(PromptAssistantOutputError):
        parse_suggestion("Sorry, I cannot identify any artwork in this image.")

    with pytest.raises(PromptAssistantOutputError):
        parse_suggestion("")

    with pytest.raises(PromptAssistantOutputError):
        parse_suggestion(None)  # type: ignore[arg-type]

    # Unbalanced braces
    with pytest.raises(PromptAssistantOutputError):
        parse_suggestion('{"sam_prompt": "patch", "scope": "entire_patch"')

    # Non-object JSON (array)
    with pytest.raises(PromptAssistantOutputError):
        parse_suggestion('["entire_patch", "square patch"]')


def test_parse_alternatives_trimmed_to_3_and_deduplicated():
    """alternative_prompts should be deduplicated and trimmed to max 3 items."""
    raw = """{
        "target_description": "Badge",
        "scope": "entire_patch",
        "sam_prompt": "main prompt",
        "alternative_prompts": ["alt1", "alt2", "alt1", "alt3", "alt4", "alt5"],
        "needs_clarification": false
    }"""
    sug = parse_suggestion(raw)
    assert sug.alternative_prompts == ["alt1", "alt2", "alt3"]


def test_parse_bad_scope_becomes_unknown():
    """Unknown, invalid, or missing scope should default to Scope.UNKNOWN."""
    # Unknown string scope
    raw_invalid = """{
        "target_description": "Test",
        "scope": "some_arbitrary_unsupported_scope",
        "sam_prompt": "valid prompt",
        "needs_clarification": false
    }"""
    sug_invalid = parse_suggestion(raw_invalid)
    assert sug_invalid.scope == Scope.UNKNOWN

    # Missing scope key
    raw_missing = """{
        "target_description": "Test",
        "sam_prompt": "valid prompt",
        "needs_clarification": false
    }"""
    sug_missing = parse_suggestion(raw_missing)
    assert sug_missing.scope == Scope.UNKNOWN

    # Non-string scope key
    raw_number = """{
        "target_description": "Test",
        "scope": 999,
        "sam_prompt": "valid prompt",
        "needs_clarification": false
    }"""
    sug_number = parse_suggestion(raw_number)
    assert sug_number.scope == Scope.UNKNOWN


def test_empty_sam_prompt_rule():
    """Empty or blank sam_prompt is invalid when needs_clarification is False, valid when True."""
    # Empty sam_prompt when needs_clarification is False -> error
    raw_empty = """{
        "target_description": "Unclear object",
        "scope": "unknown",
        "sam_prompt": "",
        "needs_clarification": false
    }"""
    with pytest.raises(PromptAssistantOutputError, match="sam_prompt cannot be empty"):
        parse_suggestion(raw_empty)

    # Whitespace only sam_prompt when needs_clarification is False -> error
    raw_whitespace = """{
        "target_description": "Unclear object",
        "scope": "unknown",
        "sam_prompt": "   ",
        "needs_clarification": false
    }"""
    with pytest.raises(PromptAssistantOutputError, match="sam_prompt cannot be empty"):
        parse_suggestion(raw_whitespace)

    # Empty sam_prompt when needs_clarification is True -> valid
    raw_clarify = """{
        "target_description": "Multiple patches detected",
        "scope": "unknown",
        "sam_prompt": "",
        "needs_clarification": true,
        "clarification_question": "Do you want the left patch or the right patch?",
        "reason": "Image has two distinct embroidered patches."
    }"""
    sug_clarify = parse_suggestion(raw_clarify)
    assert sug_clarify.needs_clarification is True
    assert sug_clarify.sam_prompt == ""
    assert sug_clarify.clarification_question == "Do you want the left patch or the right patch?"
