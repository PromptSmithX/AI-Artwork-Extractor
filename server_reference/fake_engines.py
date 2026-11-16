"""Deterministic fake engines for testing and local development without GPU.

Per contract §3 and project plan.
No torch dependency.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any, List, Optional

import numpy as np

from server_reference.sam3_engine import SegResult
from server_reference.schemas import Mode, PromptSuggestion, Scope, ScopePreference

if TYPE_CHECKING:
    import PIL.Image

# Import or define exceptions matching contract §3
try:
    from server_reference.qwen_prompt_assistant import (  # type: ignore
        PromptAssistantOutputError,
        PromptAssistantUnavailable,
    )
except ImportError:
    class PromptAssistantUnavailable(RuntimeError):
        """Raised when the prompt assistant model cannot be loaded or used."""

    class PromptAssistantOutputError(RuntimeError):
        """Raised when the prompt assistant model produces unparseable output."""


class FakeSam3Engine:
    """Deterministic fake SAM 3 engine for testing."""

    def __init__(self, device: str = "cpu", confidence_threshold: float = 0.35) -> None:
        self.device = device
        self.confidence_threshold = confidence_threshold
        self._loaded: bool = True

    def load(self) -> None:
        """Mark as loaded."""
        self._loaded = True

    @property
    def loaded(self) -> bool:
        """Return True if fake engine is loaded."""
        return self._loaded

    @loaded.setter
    def loaded(self, value: bool) -> None:
        self._loaded = bool(value)

    def segment(
        self,
        image: PIL.Image.Image,
        mode: Mode,
        prompt: Optional[str] = None,
        bbox_cxcywh_norm: Optional[List[float]] = None,
        threshold: Optional[float] = None,
    ) -> SegResult:
        """Return deterministic segmentation candidates without torch."""
        if not self._loaded:
            raise RuntimeError("FakeSam3Engine is not loaded.")

        w, h = image.width, image.height

        # Zero candidates case
        if prompt == "nothing":
            return SegResult(
                masks=np.zeros((0, h, w), dtype=bool),
                boxes_xyxy=np.zeros((0, 4), dtype=np.float32),
                scores=np.zeros((0,), dtype=np.float32),
            )

        if mode == Mode.TEXT:
            # 2 candidates: centered rectangle and centered ellipse
            masks = np.zeros((2, h, w), dtype=bool)

            # Candidate 0: Centered rectangle
            r_x1 = max(0, int(w * 0.25))
            r_x2 = min(w, int(w * 0.75))
            r_y1 = max(0, int(h * 0.25))
            r_y2 = min(h, int(h * 0.75))
            masks[0, r_y1:r_y2, r_x1:r_x2] = True

            # Candidate 1: Centered ellipse
            cx, cy = w / 2.0, h / 2.0
            rx, ry = max(1.0, w * 0.2), max(1.0, h * 0.2)
            y_coords, x_coords = np.ogrid[:h, :w]
            ellipse_mask = (((x_coords - cx) / rx) ** 2 + ((y_coords - cy) / ry) ** 2) <= 1.0
            masks[1] = ellipse_mask

            boxes_xyxy = np.array(
                [
                    [float(r_x1), float(r_y1), float(r_x2), float(r_y2)],
                    [float(cx - rx), float(cy - ry), float(cx + rx), float(cy + ry)],
                ],
                dtype=np.float32,
            )
            scores = np.array([0.92, 0.81], dtype=np.float32)

            return SegResult(
                masks=masks,
                boxes_xyxy=boxes_xyxy,
                scores=scores,
            )

        if mode in (Mode.BOX, Mode.TEXT_BOX):
            if bbox_cxcywh_norm is None:
                raise ValueError("bbox_cxcywh_norm is required for box and text_box modes")

            cx_n, cy_n, bw_n, bh_n = bbox_cxcywh_norm
            x1 = max(0, int((cx_n - bw_n / 2.0) * w))
            y1 = max(0, int((cy_n - bh_n / 2.0) * h))
            x2 = min(w, max(x1 + 1, int((cx_n + bw_n / 2.0) * w)))
            y2 = min(h, max(y1 + 1, int((cy_n + bh_n / 2.0) * h)))

            masks = np.zeros((1, h, w), dtype=bool)
            masks[0, y1:y2, x1:x2] = True

            boxes_xyxy = np.array([[float(x1), float(y1), float(x2), float(y2)]], dtype=np.float32)
            scores = np.array([0.95], dtype=np.float32)

            return SegResult(
                masks=masks,
                boxes_xyxy=boxes_xyxy,
                scores=scores,
            )

        raise ValueError(f"Unknown mode: {mode}")


class FakePromptAssistant:
    """Deterministic fake prompt assistant for testing."""

    def __init__(
        self,
        available: bool = True,
        loaded: bool = True,
        raise_unavailable: bool = False,
        raise_output_error: bool = False,
    ) -> None:
        self.available: bool = available
        self.loaded: bool = loaded
        self.raise_unavailable: bool = raise_unavailable
        self.raise_output_error: bool = raise_output_error

    def load(self) -> None:
        """Simulate loading."""
        if self.raise_unavailable:
            raise PromptAssistantUnavailable("Simulated load failure")
        self.loaded = True

    def unload(self) -> None:
        """Simulate unloading."""
        self.loaded = False

    def suggest(
        self,
        image: Any,
        user_request: str,
        scope_preference: ScopePreference = ScopePreference.AUTO,
    ) -> PromptSuggestion:
        """Generate deterministic prompt suggestions."""
        if not self.available or self.raise_unavailable:
            raise PromptAssistantUnavailable("Prompt assistant is currently unavailable")

        if self.raise_output_error:
            raise PromptAssistantOutputError("Assistant produced invalid output JSON")

        if scope_preference == ScopePreference.AUTO or str(scope_preference) == "auto":
            scope = Scope.ENTIRE_PATCH
        else:
            try:
                scope = Scope(scope_preference)
            except ValueError:
                scope = Scope.ENTIRE_PATCH

        return PromptSuggestion(
            target_description="Embroidered fabric patch on baseball cap",
            scope=scope,
            sam_prompt="embroidered fabric patch",
            alternative_prompts=["fabric patch", "embroidered logo patch"],
            location_hint="front center panel",
            needs_clarification=False,
            clarification_question="",
            reason="Extracted candidate patch based on user request",
        )
