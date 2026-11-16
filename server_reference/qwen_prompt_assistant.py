"""Qwen3-VL-4B Prompt Assistant for Meta SAM 3 Segmentation.

Converts designer natural-language requests into concise object concepts
and noun phrases for SAM 3 text prompts.
"""
from __future__ import annotations

import io
import json
import os
import re
from typing import Any, List, Optional

from server_reference.schemas import PromptSuggestion, Scope, ScopePreference

try:
    from server_reference.errors import (
        PromptAssistantUnavailable,
        PromptAssistantOutputError,
    )
except ImportError:  # pragma: no cover - until server worker merges
    class PromptAssistantUnavailable(RuntimeError):
        pass

    class PromptAssistantOutputError(RuntimeError):
        pass

__all__ = [
    "PromptAssistantUnavailable",
    "PromptAssistantOutputError",
    "SYSTEM_PROMPT",
    "build_user_message",
    "parse_suggestion",
    "QwenPromptAssistant",
]

SYSTEM_PROMPT = """You are an assistant that converts a designer's natural-language
request into concise object concepts for Meta SAM 3 segmentation.

You receive:
1. A product image.
2. A request written by the designer, usually in Vietnamese.

Your job is NOT to segment the image. Your job is to identify the
intended visible object and propose short text prompts for SAM 3.

Rules:
- Preserve the designer's intended extraction scope.
- Distinguish entire_patch, inner_artwork, and individual_decoration.
- If the user asks for the whole patch, describe the patch itself,
  not only the artwork inside it.
- If the user asks for the inner artwork, describe only that inner
  artwork.
- Prefer short noun phrases, not long natural-language instructions.
- Describe one concept per prompt.
- Do not combine multiple object categories into one prompt.
- Do not invent hidden, occluded, or unseen details.
- Do not rewrite or recreate lettering, logos, or artwork.
- Do not generate bounding-box coordinates.
- Provide up to 3 alternative prompts only when useful.
- If the target is ambiguous, explain briefly and set needs_clarification=true.
- The user must approve or edit the suggested prompt before segmentation.

Return valid JSON only, using this schema:
{
  "target_description": "short description",
  "scope": "entire_patch | inner_artwork | individual_decoration | unknown",
  "sam_prompt": "short noun phrase for SAM 3",
  "alternative_prompts": ["prompt 1", "prompt 2"],
  "location_hint": "short visible location or empty string",
  "needs_clarification": false,
  "clarification_question": "empty string or one short question",
  "reason": "brief explanation"
}"""


def build_user_message(
    user_request: str,
    scope_preference: ScopePreference | str = ScopePreference.AUTO,
) -> str:
    """Format user message for the assistant prompt.

    Contains the designer request; if scope_preference != auto,
    adds a line saying the designer prefers that scope.
    """
    user_req = (user_request or "").strip()
    if isinstance(scope_preference, ScopePreference):
        pref_val = scope_preference.value
    elif scope_preference is not None:
        pref_val = str(scope_preference).strip().lower()
    else:
        pref_val = ScopePreference.AUTO.value

    lines: list[str] = []
    if user_req:
        lines.append(user_req)
    if pref_val and pref_val != ScopePreference.AUTO.value:
        lines.append(f"The designer prefers that scope: {pref_val}.")
    return "\n".join(lines)


def _extract_first_json_object(text: str) -> str:
    """Find the first balanced {...} substring using string-aware brace matching."""
    start_idx = text.find("{")
    if start_idx == -1:
        raise PromptAssistantOutputError("No JSON object found in output text")

    depth = 0
    in_string = False
    escape = False

    for i in range(start_idx, len(text)):
        char = text[i]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
        else:
            if char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return text[start_idx : i + 1]

    raise PromptAssistantOutputError("Unbalanced braces in JSON object")


def parse_suggestion(text: str) -> PromptSuggestion:
    """Parse raw LLM output into a validated PromptSuggestion instance.

    Strips ```json fences, finds the first balanced {...} object,
    validates with PromptSuggestion schema, converts invalid scopes to unknown,
    and checks the empty sam_prompt rule.
    """
    if not isinstance(text, str) or not text.strip():
        raise PromptAssistantOutputError("Assistant output is empty or not text")

    # Strip ```json and ``` fences
    cleaned = re.sub(r"```(?:json)?", "", text, flags=re.IGNORECASE)

    # Find the first balanced {...} object (string-aware brace matching)
    json_str = _extract_first_json_object(cleaned)

    try:
        data = json.loads(json_str)
    except Exception as e:
        raise PromptAssistantOutputError(f"Failed to decode JSON: {e}") from e

    if not isinstance(data, dict):
        raise PromptAssistantOutputError(f"Expected a JSON object, got {type(data).__name__}")

    # Unknown/invalid scope -> unknown
    valid_scopes = {s.value for s in Scope}
    raw_scope = data.get("scope")
    if isinstance(raw_scope, Scope):
        pass
    elif isinstance(raw_scope, str) and raw_scope.strip().lower() in valid_scopes:
        data["scope"] = Scope(raw_scope.strip().lower())
    else:
        data["scope"] = Scope.UNKNOWN

    try:
        suggestion = PromptSuggestion.model_validate(data)
    except Exception as e:
        raise PromptAssistantOutputError(f"Schema validation error: {e}") from e

    # Empty sam_prompt while needs_clarification is false -> invalid
    if not suggestion.needs_clarification and not suggestion.sam_prompt:
        raise PromptAssistantOutputError(
            "sam_prompt cannot be empty when needs_clarification is False"
        )

    return suggestion


class QwenPromptAssistant:
    """Assistant powered by Qwen3-VL-4B-Instruct for generating SAM 3 prompts."""

    def __init__(
        self,
        model_id: str = "Qwen/Qwen3-VL-4B-Instruct",
        enabled: bool = True,
        min_free_vram_gb: float = 5.0,
        max_image_side: int = 768,
        max_new_tokens: int = 160,
        device: str = "cuda",
    ) -> None:
        self.model_id = model_id
        self.enabled = bool(enabled)
        self.min_free_vram_gb = float(min_free_vram_gb)
        self.max_image_side = int(max_image_side)
        self.max_new_tokens = int(max_new_tokens)
        self.device = device

        self._available = bool(enabled)
        self.last_error: str = ""
        self.model: Any = None
        self.processor: Any = None

    @property
    def available(self) -> bool:
        """Return True if enabled and not disabled by an error or OOM."""
        return self._available and self.enabled

    @available.setter
    def available(self, val: bool) -> None:
        self._available = bool(val)

    @property
    def loaded(self) -> bool:
        """Return True if model and processor are loaded."""
        return self.model is not None and self.processor is not None

    def load(self) -> None:
        """Load model and processor into GPU memory with 4-bit NF4 quantization."""
        if not self.available:
            raise PromptAssistantUnavailable(
                f"Prompt assistant is unavailable (last error: {self.last_error or 'disabled'})."
            )
        if self.loaded:
            return

        try:
            import torch
            from transformers import AutoProcessor, BitsAndBytesConfig

            try:
                from transformers import Qwen3VLForConditionalGeneration
            except ImportError:
                from transformers import (  # type: ignore[assignment]
                    AutoModelForImageTextToText as Qwen3VLForConditionalGeneration,
                )

            if not torch.cuda.is_available():
                raise RuntimeError("CUDA is not available")

            free_bytes, _ = torch.cuda.mem_get_info()
            free_gb = free_bytes / (1024 ** 3)
            if free_gb < self.min_free_vram_gb:
                raise RuntimeError(
                    f"Insufficient VRAM: {free_gb:.2f} GB free, required {self.min_free_vram_gb:.2f} GB"
                )

            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_use_double_quant=True,
            )

            self.processor = AutoProcessor.from_pretrained(self.model_id)
            self.model = Qwen3VLForConditionalGeneration.from_pretrained(
                self.model_id,
                quantization_config=bnb_config,
                device_map="cuda:0",
                dtype=torch.float16,
            )
            self.model.eval()
        except Exception as e:
            self.unload()
            self.available = False
            self.last_error = f"Failed to load Qwen model '{self.model_id}': {e}"
            raise PromptAssistantUnavailable(self.last_error) from e

    def unload(self) -> None:
        """Unload model and processor from memory and release cached VRAM."""
        self.model = None
        self.processor = None
        import gc

        gc.collect()
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass

    def _is_oom_error(self, e: BaseException) -> bool:
        """Check if an exception represents a CUDA Out Of Memory condition."""
        try:
            import torch

            if isinstance(e, torch.cuda.OutOfMemoryError):
                return True
        except (ImportError, AttributeError):
            pass

        msg = str(e).lower()
        return "out of memory" in msg or "cuda oom" in msg or "outofmemoryerror" in type(e).__name__.lower()

    @staticmethod
    def _prepare_image(image: Any, max_side: int) -> Any:
        """Ensure image is an RGB PIL Image with max side <= max_side keeping aspect ratio."""
        from PIL import Image

        if not isinstance(image, Image.Image):
            if isinstance(image, (bytes, bytearray)):
                image = Image.open(io.BytesIO(image))
            elif isinstance(image, (str, os.PathLike)):
                image = Image.open(image)
            else:
                raise ValueError(f"Unsupported image type: {type(image)}")

        if image.mode != "RGB":
            image = image.convert("RGB")

        w, h = image.size
        max_dim = max(w, h)
        if max_dim > max_side:
            scale = max_side / max_dim
            new_w = max(1, int(round(w * scale)))
            new_h = max(1, int(round(h * scale)))
            image = image.resize((new_w, new_h), Image.Resampling.LANCZOS)

        return image

    def _generate(self, messages: list[dict[str, Any]]) -> str:
        """Execute model generation using Hugging Face transformers.

        Overridable in subclasses for testing without GPU/torch.
        """
        import torch

        if not self.loaded:
            self.load()

        with torch.inference_mode():
            inputs = self.processor.apply_chat_template(
                messages,
                tokenize=True,
                add_generation_prompt=True,
                return_dict=True,
                return_tensors="pt",
            )
            device = getattr(self.model, "device", self.device)
            model_dtype = getattr(self.model, "dtype", torch.float16)
            inputs = {
                k: (
                    v.to(device, dtype=model_dtype)
                    if hasattr(v, "is_floating_point") and v.is_floating_point()
                    else (v.to(device) if hasattr(v, "to") else v)
                )
                for k, v in inputs.items()
            }
            prompt_len = inputs["input_ids"].shape[1]
            generated_ids = self.model.generate(
                **inputs,
                max_new_tokens=self.max_new_tokens,
                do_sample=False,
                temperature=None,
                top_p=None,
                top_k=None,
            )
            trimmed_ids = generated_ids[:, prompt_len:]
            output_texts = self.processor.batch_decode(
                trimmed_ids,
                skip_special_tokens=True,
                clean_up_tokenization_spaces=False,
            )
            del inputs, generated_ids
            return output_texts[0] if output_texts else ""

    def suggest(
        self,
        image: Any,
        user_request: str,
        scope_preference: ScopePreference | str = ScopePreference.AUTO,
    ) -> PromptSuggestion:
        """Suggest SAM 3 prompts from an image and designer request.

        Lazy-loads model if needed. Retries once if the model produces
        invalid JSON. Disables assistant on OOM.
        """
        if not self.available:
            raise PromptAssistantUnavailable(
                f"Prompt assistant is unavailable (last error: {self.last_error or 'disabled'})."
            )

        if not self.loaded:
            self.load()

        prepared_image = self._prepare_image(image, self.max_image_side)
        user_text = build_user_message(user_request, scope_preference)

        messages: list[dict[str, Any]] = [
            {
                "role": "system",
                "content": [{"type": "text", "text": SYSTEM_PROMPT}],
            },
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": prepared_image},
                    {"type": "text", "text": user_text},
                ],
            },
        ]

        # First attempt
        try:
            raw_text = self._generate(messages)
        except Exception as e:
            if self._is_oom_error(e):
                self.unload()
                self.available = False
                self.last_error = f"CUDA Out of Memory during generation: {e}"
                raise PromptAssistantUnavailable(self.last_error) from e
            raise

        try:
            return parse_suggestion(raw_text)
        except PromptAssistantOutputError:
            pass

        # Retry once: assistant turn with previous answer, user turn with schema reminder
        retry_messages = list(messages) + [
            {
                "role": "assistant",
                "content": [{"type": "text", "text": raw_text}],
            },
            {
                "role": "user",
                "content": [{"type": "text", "text": "Return valid JSON only, matching the schema."}],
            },
        ]

        try:
            retry_raw_text = self._generate(retry_messages)
        except Exception as e:
            if self._is_oom_error(e):
                self.unload()
                self.available = False
                self.last_error = f"CUDA Out of Memory during generation retry: {e}"
                raise PromptAssistantUnavailable(self.last_error) from e
            raise

        try:
            return parse_suggestion(retry_raw_text)
        except PromptAssistantOutputError as err:
            raise PromptAssistantOutputError(
                f"Prompt assistant failed to produce valid JSON after retry: {err}"
            ) from err

    def vram_report(self) -> dict[str, float]:
        """Report GPU VRAM usage in gigabytes, or empty dict if CUDA is unavailable."""
        try:
            import torch

            if not torch.cuda.is_available():
                return {}
            free_bytes, total_bytes = torch.cuda.mem_get_info()
            allocated_bytes = torch.cuda.memory_allocated()
            gb = 1024 ** 3
            alloc_gb = round(allocated_bytes / gb, 3)
            free_gb = round(free_bytes / gb, 3)
            total_gb = round(total_bytes / gb, 3)
            return {
                "allocated_gb": alloc_gb,
                "free_gb": free_gb,
                "total_gb": total_gb,
                "allocated": alloc_gb,
                "free": free_gb,
                "total": total_gb,
            }
        except Exception:
            return {}
