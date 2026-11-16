"""Tests for QwenPromptAssistant class and inference workflow."""
from __future__ import annotations

from typing import Any, List
from unittest.mock import MagicMock, patch
from PIL import Image
import pytest

from server_reference.qwen_prompt_assistant import (
    PromptAssistantOutputError,
    PromptAssistantUnavailable,
    QwenPromptAssistant,
    SYSTEM_PROMPT,
)
from server_reference.schemas import Scope, ScopePreference


class SubclassPromptAssistant(QwenPromptAssistant):
    """Subclass overriding load and _generate to test suggest() without GPU/torch."""

    def __init__(self, outputs: List[Any], **kwargs):
        super().__init__(**kwargs)
        self.outputs = list(outputs)
        self.call_count = 0
        self.received_messages: List[List[dict]] = []
        self.load_called = False

    def load(self) -> None:
        if not self.available:
            raise PromptAssistantUnavailable(
                f"Prompt assistant is unavailable (last error: {self.last_error or 'disabled'})."
            )
        self.load_called = True
        self.model = MagicMock()
        self.processor = MagicMock()

    def _generate(self, messages: list[dict[str, Any]]) -> str:
        self.call_count += 1
        self.received_messages.append(messages)
        if not self.outputs:
            raise RuntimeError("No more outputs configured")
        next_output = self.outputs.pop(0)
        if isinstance(next_output, Exception):
            raise next_output
        return next_output


def test_init_defaults():
    """Verify default initialization parameters and attributes."""
    asst = QwenPromptAssistant()
    assert asst.model_id == "Qwen/Qwen3-VL-4B-Instruct"
    assert asst.enabled is True
    assert asst.available is True
    assert asst.loaded is False
    assert asst.min_free_vram_gb == 5.0
    assert asst.max_image_side == 768
    assert asst.max_new_tokens == 160
    assert asst.device == "cuda"
    assert asst.last_error == ""


def test_disabled_assistant_raises_unavailable():
    """Disabled assistant has available=False and raises PromptAssistantUnavailable on suggest and load."""
    asst = QwenPromptAssistant(enabled=False)
    assert asst.available is False
    assert asst.loaded is False

    dummy_img = Image.new("RGB", (100, 100), "white")
    with pytest.raises(PromptAssistantUnavailable):
        asst.suggest(dummy_img, "Tách logo")

    with pytest.raises(PromptAssistantUnavailable):
        asst.load()


def test_suggest_success():
    """Single-turn successful suggestion without retry."""
    valid_json = """{
        "target_description": "Embroidered badge on chest",
        "scope": "entire_patch",
        "sam_prompt": "square embroidered chest badge",
        "alternative_prompts": ["embroidered patch"],
        "location_hint": "chest",
        "needs_clarification": false,
        "clarification_question": "",
        "reason": "Clear user request"
    }"""
    asst = SubclassPromptAssistant(outputs=[valid_json])
    img = Image.new("RGB", (200, 200), "blue")

    res = asst.suggest(img, "Tách badge ở ngực", ScopePreference.ENTIRE_PATCH)

    assert asst.load_called is True
    assert asst.loaded is True
    assert asst.call_count == 1
    assert res.scope == Scope.ENTIRE_PATCH
    assert res.sam_prompt == "square embroidered chest badge"

    # Verify messages passed to _generate
    msgs = asst.received_messages[0]
    assert len(msgs) == 2
    assert msgs[0]["role"] == "system"
    assert msgs[0]["content"][0]["text"] == SYSTEM_PROMPT
    assert msgs[1]["role"] == "user"
    assert msgs[1]["content"][0]["type"] == "image"
    assert msgs[1]["content"][1]["type"] == "text"
    assert "Tách badge ở ngực" in msgs[1]["content"][1]["text"]
    assert "The designer prefers that scope: entire_patch." in msgs[1]["content"][1]["text"]


def test_suggest_retry_then_success():
    """Model returns non-JSON on 1st turn, then valid JSON on retry turn."""
    invalid_json = "I cannot determine the patch. Here is what I think: maybe a flower."
    valid_json = """{
        "target_description": "Flower motif",
        "scope": "inner_artwork",
        "sam_prompt": "embroidered red flower",
        "alternative_prompts": [],
        "needs_clarification": false
    }"""
    asst = SubclassPromptAssistant(outputs=[invalid_json, valid_json])
    img = Image.new("RGB", (100, 100), "red")

    res = asst.suggest(img, "Lấy bông hoa")

    assert asst.call_count == 2
    assert res.scope == Scope.INNER_ARTWORK
    assert res.sam_prompt == "embroidered red flower"

    # Verify retry messages structure
    retry_msgs = asst.received_messages[1]
    assert len(retry_msgs) == 4
    assert retry_msgs[0]["role"] == "system"
    assert retry_msgs[1]["role"] == "user"
    assert retry_msgs[2]["role"] == "assistant"
    assert retry_msgs[2]["content"][0]["text"] == invalid_json
    assert retry_msgs[3]["role"] == "user"
    assert retry_msgs[3]["content"][0]["text"] == "Return valid JSON only, matching the schema."


def test_suggest_double_failure_raises_output_error():
    """Model returns invalid JSON on both attempts -> raises PromptAssistantOutputError."""
    asst = SubclassPromptAssistant(outputs=["Not JSON at all", "Still not valid JSON"])
    img = Image.new("RGB", (100, 100), "green")

    with pytest.raises(PromptAssistantOutputError, match="failed to produce valid JSON after retry"):
        asst.suggest(img, "Tách logo")

    assert asst.call_count == 2
    assert asst.available is True  # Output error does NOT disable the assistant (unlike OOM)


def test_suggest_simulated_oom_first_call():
    """CUDA OOM on 1st generation unloads model, sets available=False, and raises PromptAssistantUnavailable."""
    oom_error = RuntimeError("CUDA out of memory. Tried to allocate 2.50 GiB")
    asst = SubclassPromptAssistant(outputs=[oom_error])
    img = Image.new("RGB", (100, 100), "yellow")

    with pytest.raises(PromptAssistantUnavailable, match="CUDA Out of Memory"):
        asst.suggest(img, "Tách logo")

    assert asst.available is False
    assert asst.loaded is False
    assert "CUDA Out of Memory" in asst.last_error

    # Subsequent call immediately fails without generating
    with pytest.raises(PromptAssistantUnavailable):
        asst.suggest(img, "Tách logo lại")


def test_suggest_simulated_oom_on_retry():
    """CUDA OOM on retry unloads model, sets available=False, and raises PromptAssistantUnavailable."""
    invalid_json = "Not json"
    oom_error = RuntimeError("CUDA out of memory. Tried to allocate 1.20 GiB")
    asst = SubclassPromptAssistant(outputs=[invalid_json, oom_error])
    img = Image.new("RGB", (100, 100), "yellow")

    with pytest.raises(PromptAssistantUnavailable, match="CUDA Out of Memory during generation retry"):
        asst.suggest(img, "Tách logo")

    assert asst.available is False
    assert asst.loaded is False
    assert "CUDA Out of Memory" in asst.last_error


def test_downscale_keeps_aspect():
    """Image resizing preserves aspect ratio and clamps maximum side to max_image_side."""
    asst = QwenPromptAssistant(max_image_side=768)

    # 1. Landscape image larger than max_image_side
    img_landscape = Image.new("RGB", (1536, 768), "white")
    res_landscape = asst._prepare_image(img_landscape, asst.max_image_side)
    assert res_landscape.size == (768, 384)
    assert res_landscape.width / res_landscape.height == pytest.approx(2.0, rel=1e-2)

    # 2. Portrait image larger than max_image_side
    img_portrait = Image.new("RGB", (600, 1200), "white")
    res_portrait = asst._prepare_image(img_portrait, asst.max_image_side)
    assert res_portrait.size == (384, 768)
    assert res_portrait.height / res_portrait.width == pytest.approx(2.0, rel=1e-2)

    # 3. Image smaller than max_image_side remains unchanged
    img_small = Image.new("RGB", (500, 300), "white")
    res_small = asst._prepare_image(img_small, asst.max_image_side)
    assert res_small.size == (500, 300)

    # 4. RGBA image converted to RGB
    img_rgba = Image.new("RGBA", (400, 400), (255, 0, 0, 128))
    res_rgb = asst._prepare_image(img_rgba, asst.max_image_side)
    assert res_rgb.mode == "RGB"
    assert res_rgb.size == (400, 400)


def test_unload():
    """Unload releases model and processor and marks loaded as False."""
    asst = SubclassPromptAssistant(outputs=[])
    asst.load()
    assert asst.loaded is True

    asst.unload()
    assert asst.loaded is False
    assert asst.model is None
    assert asst.processor is None


def test_load_cuda_unavailable():
    """Calling load() without CUDA raises PromptAssistantUnavailable and disables assistant."""
    asst = QwenPromptAssistant()
    with patch("torch.cuda.is_available", return_value=False):
        with pytest.raises(PromptAssistantUnavailable, match="CUDA is not available"):
            asst.load()

    assert asst.available is False
    assert asst.loaded is False
    assert "CUDA is not available" in asst.last_error


def test_load_insufficient_vram():
    """Calling load() with less than min_free_vram_gb raises PromptAssistantUnavailable."""
    asst = QwenPromptAssistant(min_free_vram_gb=5.0)
    with patch("torch.cuda.is_available", return_value=True), \
         patch("torch.cuda.mem_get_info", return_value=(3 * 1024**3, 16 * 1024**3)):
        with pytest.raises(PromptAssistantUnavailable, match="Insufficient VRAM"):
            asst.load()

    assert asst.available is False
    assert asst.loaded is False
    assert "Insufficient VRAM" in asst.last_error


def test_load_when_already_loaded_is_noop():
    """If already loaded, calling load() returns immediately without reloading."""
    asst = SubclassPromptAssistant(outputs=[])
    asst.load()
    assert asst.loaded is True
    # Second load should return immediately
    asst.load()
    assert asst.loaded is True


def test_vram_report():
    """vram_report returns {} when CUDA is not available or reports allocated/free/total."""
    asst = QwenPromptAssistant()

    # Without CUDA
    with patch("torch.cuda.is_available", return_value=False):
        assert asst.vram_report() == {}

    # With simulated CUDA
    with patch("torch.cuda.is_available", return_value=True), \
         patch("torch.cuda.mem_get_info", return_value=(8 * 1024**3, 16 * 1024**3)), \
         patch("torch.cuda.memory_allocated", return_value=4 * 1024**3):
        rep = asst.vram_report()
        assert rep["allocated_gb"] == 4.0
        assert rep["free_gb"] == 8.0
        assert rep["total_gb"] == 16.0
        assert rep["allocated"] == 4.0
