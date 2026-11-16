"""SAM 3 model engine wrapper for AI Artwork Extractor.

Per contract §3 and project plan §5.
Provides SegResult dataclass and Sam3Engine class with lazy imports
so CPU-only test environments without torch/sam3 can import and run.
"""
from __future__ import annotations

import contextlib
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, List, Optional

import numpy as np
from PIL import Image

from server_reference.schemas import Mode

if TYPE_CHECKING:
    import PIL.Image


@dataclass
class SegResult:
    """Segmentation output dataclass per contract §3."""

    masks: np.ndarray  # bool [N, H, W] at ORIGINAL image size
    boxes_xyxy: np.ndarray  # float32 [N, 4] pixel coords
    scores: np.ndarray  # float32 [N]


def gpu_name() -> Optional[str]:
    """Return the GPU model name or None if CUDA/torch is unavailable."""
    try:
        import torch

        if torch.cuda.is_available():
            return str(torch.cuda.get_device_name(0))
    except Exception:
        pass
    return None


def _to_numpy_masks(mask_tensor: Any, target_size: tuple[int, int]) -> np.ndarray:
    """Convert tensor/array masks to boolean [N, H, W] numpy array matching target_size (width, height)."""
    if hasattr(mask_tensor, "detach"):
        arr = mask_tensor.detach().float().cpu().numpy()
    else:
        arr = np.asarray(mask_tensor, dtype=np.float32)

    if arr.ndim == 4 and arr.shape[1] == 1:
        arr = arr[:, 0]
    elif arr.ndim == 2:
        arr = arr[None, ...]
    elif arr.ndim == 3:
        pass
    else:
        raise ValueError(f"Unexpected mask tensor shape: {arr.shape}")

    bool_masks = arr > 0.5
    target_w, target_h = target_size
    n_instances = bool_masks.shape[0]

    if n_instances == 0:
        return np.zeros((0, target_h, target_w), dtype=bool)

    cur_h, cur_w = bool_masks.shape[1], bool_masks.shape[2]
    if (cur_h, cur_w) == (target_h, target_w):
        return bool_masks

    # Resize each mask to original size using NEAREST interpolation
    resized_masks = np.zeros((n_instances, target_h, target_w), dtype=bool)
    for i in range(n_instances):
        pil_mask = Image.fromarray(bool_masks[i].astype(np.uint8) * 255, mode="L")
        resized_pil = pil_mask.resize((target_w, target_h), resample=Image.Resampling.NEAREST)
        resized_masks[i] = np.array(resized_pil) > 127

    return resized_masks


class Sam3Engine:
    """SAM 3 inference engine wrapper."""

    def __init__(self, device: str = "cuda", confidence_threshold: float = 0.35) -> None:
        self.device = device
        self.confidence_threshold = confidence_threshold
        self._model: Any = None
        self._processor: Any = None

    def load(self) -> None:
        """Lazily load SAM 3 model and processor onto target device."""
        if self._processor is not None:
            return

        from sam3.model_builder import build_sam3_image_model
        from sam3.model.sam3_image_processor import Sam3Processor

        self._model = build_sam3_image_model(device=self.device, eval_mode=True)
        self._model.eval()
        self._processor = Sam3Processor(
            self._model,
            device=self.device,
            confidence_threshold=self.confidence_threshold,
        )

    @property
    def loaded(self) -> bool:
        """Return True if model and processor are initialized."""
        return self._processor is not None

    def segment(
        self,
        image: PIL.Image.Image,
        mode: Mode,
        prompt: Optional[str] = None,
        bbox_cxcywh_norm: Optional[List[float]] = None,
        threshold: Optional[float] = None,
    ) -> SegResult:
        """Run segmentation inference on image using given mode and prompts."""
        if not self.loaded:
            raise RuntimeError("Sam3Engine is not loaded. Call load() first.")

        import torch

        target_thresh = threshold if threshold is not None else self.confidence_threshold
        has_thresh_attr = hasattr(self._processor, "confidence_threshold")
        orig_thresh = getattr(self._processor, "confidence_threshold", None) if has_thresh_attr else None

        try:
            if has_thresh_attr and threshold is not None:
                self._processor.confidence_threshold = target_thresh

            if self.device.startswith("cuda") and torch.cuda.is_available():
                amp_ctx = torch.autocast(device_type="cuda", dtype=torch.float16)
            else:
                amp_ctx = contextlib.nullcontext()

            with torch.inference_mode(), amp_ctx:
                # Fresh state per call: never reuse old prompts
                image_state = self._processor.set_image(image)

                if mode == Mode.TEXT:
                    if not prompt or not prompt.strip():
                        raise ValueError("Text mode requires non-empty prompt")
                    output = self._processor.set_text_prompt(state=image_state, prompt=prompt.strip())
                elif mode == Mode.BOX:
                    if bbox_cxcywh_norm is None:
                        raise ValueError("Box mode requires bbox_cxcywh_norm")
                    output = self._processor.add_geometric_prompt(
                        state=image_state,
                        box=bbox_cxcywh_norm,
                        label=True,
                    )
                elif mode == Mode.TEXT_BOX:
                    if not prompt or not prompt.strip():
                        raise ValueError("Text+Box mode requires non-empty prompt")
                    if bbox_cxcywh_norm is None:
                        raise ValueError("Text+Box mode requires bbox_cxcywh_norm")
                    self._processor.set_text_prompt(state=image_state, prompt=prompt.strip())
                    output = self._processor.add_geometric_prompt(
                        state=image_state,
                        box=bbox_cxcywh_norm,
                        label=True,
                    )
                else:
                    raise ValueError(f"Unsupported mode: {mode}")

            w, h = image.width, image.height
            if output is None or "scores" not in output or len(output["scores"]) == 0:
                return SegResult(
                    masks=np.zeros((0, h, w), dtype=bool),
                    boxes_xyxy=np.zeros((0, 4), dtype=np.float32),
                    scores=np.zeros((0,), dtype=np.float32),
                )

            masks = _to_numpy_masks(output["masks"], (w, h))
            boxes = output["boxes"].detach().float().cpu().numpy().astype(np.float32)
            scores = output["scores"].detach().float().cpu().numpy().reshape(-1).astype(np.float32)

            return SegResult(
                masks=masks,
                boxes_xyxy=boxes,
                scores=scores,
            )
        finally:
            if has_thresh_attr and orig_thresh is not None:
                self._processor.confidence_threshold = orig_thresh
