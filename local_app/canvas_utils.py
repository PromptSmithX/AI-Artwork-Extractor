"""Pure utility functions for canvas coordinate transformations, sizing, and image loading.

Fully unit-tested and independent of Streamlit UI rendering.
"""
from __future__ import annotations

import io
from typing import Any, Dict, List, Optional, Sequence, Tuple

from PIL import Image, ImageOps


def load_display_image(image_bytes: bytes) -> Image.Image:
    """Load an image from bytes and apply EXIF orientation transpose.

    Ensures canvas display coordinates, bounding boxes, and previews match
    the server's internal orientation (which also runs ImageOps.exif_transpose).

    Args:
        image_bytes: Raw binary bytes of the image file.

    Returns:
        PIL Image with EXIF orientation applied (transposed to upright).
    """
    raw_img = Image.open(io.BytesIO(image_bytes))
    transposed = ImageOps.exif_transpose(raw_img)
    return transposed if transposed is not None else raw_img


def fit_display_size(
    img_w: int, img_h: int, max_w: int, max_h: int
) -> Tuple[int, int, float]:
    """Fit image dimensions within max_w and max_h while maintaining aspect ratio.

    Args:
        img_w: Original image width in pixels (> 0).
        img_h: Original image height in pixels (> 0).
        max_w: Maximum display width in pixels (> 0).
        max_h: Maximum display height in pixels (> 0).

    Returns:
        (disp_w, disp_h, scale) where disp_w and disp_h are integer display dimensions,
        and scale = disp_w / img_w (or disp_h / img_h).

    Raises:
        ValueError: If any input dimension is <= 0.
    """
    if img_w <= 0 or img_h <= 0 or max_w <= 0 or max_h <= 0:
        raise ValueError("Dimensions must be positive integers.")

    scale = min(max_w / img_w, max_h / img_h)
    disp_w = max(1, min(max_w, int(round(img_w * scale))))
    disp_h = max(1, min(max_h, int(round(img_h * scale))))
    return disp_w, disp_h, scale


def canvas_rect_to_image_xyxy(
    left: float,
    top: float,
    width: float,
    height: float,
    scale: float,
    img_w: int,
    img_h: int,
) -> Tuple[float, float, float, float]:
    """Convert canvas rectangle coordinates to original image pixel coordinates (xyxy).

    Handles negative width/height (when user drags in reverse direction),
    scales back by 1/scale, and clamps coordinates to image boundaries [0, img_w] / [0, img_h].

    Args:
        left: Starting horizontal position on canvas.
        top: Starting vertical position on canvas.
        width: Drawn width on canvas (may be negative).
        height: Drawn height on canvas (may be negative).
        scale: Display scale factor (canvas_dim / img_dim > 0).
        img_w: Original image width (> 0).
        img_h: Original image height (> 0).

    Returns:
        (x1, y1, x2, y2) in original image pixel space, where x1 <= x2 and y1 <= y2.

    Raises:
        ValueError: If scale <= 0 or img_w <= 0 or img_h <= 0.
    """
    if scale <= 0.0:
        raise ValueError("Scale must be strictly positive.")
    if img_w <= 0 or img_h <= 0:
        raise ValueError("Image dimensions must be positive integers.")

    # Handle negative drag dimensions
    x1 = left if width >= 0 else left + width
    x2 = left + width if width >= 0 else left
    y1 = top if height >= 0 else top + height
    y2 = top + height if height >= 0 else top

    # Convert canvas coords to image coords
    img_x1 = x1 / scale
    img_y1 = y1 / scale
    img_x2 = x2 / scale
    img_y2 = y2 / scale

    # Clamp to original image bounds
    clamped_x1 = max(0.0, min(float(img_w), img_x1))
    clamped_x2 = max(0.0, min(float(img_w), img_x2))
    clamped_y1 = max(0.0, min(float(img_h), img_y1))
    clamped_y2 = max(0.0, min(float(img_h), img_y2))

    # Ensure min <= max
    out_x1, out_x2 = min(clamped_x1, clamped_x2), max(clamped_x1, clamped_x2)
    out_y1, out_y2 = min(clamped_y1, clamped_y2), max(clamped_y1, clamped_y2)

    return out_x1, out_y1, out_x2, out_y2


def xyxy_to_norm_cxcywh(
    xyxy: Sequence[float], img_w: int, img_h: int
) -> List[float]:
    """Convert pixel [x1, y1, x2, y2] to normalized [cx, cy, w, h] in [0, 1].

    Args:
        xyxy: [x1, y1, x2, y2] coordinates in pixel space.
        img_w: Original image width (> 0).
        img_h: Original image height (> 0).

    Returns:
        [cx, cy, w, h] normalized to range [0, 1].

    Raises:
        ValueError: If dimensions <= 0, length != 4, or bounding box has zero area.
    """
    if len(xyxy) != 4:
        raise ValueError(f"Expected 4 coordinates, got {len(xyxy)}")
    if img_w <= 0 or img_h <= 0:
        raise ValueError("Image dimensions must be positive.")

    x1, y1, x2, y2 = xyxy
    min_x, max_x = min(float(x1), float(x2)), max(float(x1), float(x2))
    min_y, max_y = min(float(y1), float(y2)), max(float(y1), float(y2))

    # Clamp to image boundaries
    min_x = max(0.0, min(float(img_w), min_x))
    max_x = max(0.0, min(float(img_w), max_x))
    min_y = max(0.0, min(float(img_h), min_y))
    max_y = max(0.0, min(float(img_h), max_y))

    w_px = max_x - min_x
    h_px = max_y - min_y

    if w_px <= 0.0 or h_px <= 0.0:
        raise ValueError(f"Zero-area bounding box: width={w_px}, height={h_px}")

    norm_w = min(1.0, max(0.0, w_px / img_w))
    norm_h = min(1.0, max(0.0, h_px / img_h))
    norm_cx = min(1.0, max(0.0, (min_x + w_px / 2.0) / img_w))
    norm_cy = min(1.0, max(0.0, (min_y + h_px / 2.0) / img_h))

    return [norm_cx, norm_cy, norm_w, norm_h]


def norm_cxcywh_to_xyxy(
    cxcywh: Sequence[float], img_w: int, img_h: int
) -> Tuple[float, float, float, float]:
    """Convert normalized [cx, cy, w, h] in [0, 1] back to pixel [x1, y1, x2, y2].

    Args:
        cxcywh: [cx, cy, w, h] normalized in [0, 1].
        img_w: Original image width (> 0).
        img_h: Original image height (> 0).

    Returns:
        (x1, y1, x2, y2) in pixel space clamped to [0, img_w] and [0, img_h].

    Raises:
        ValueError: If dimensions <= 0, length != 4, or bounding box has zero area.
    """
    if len(cxcywh) != 4:
        raise ValueError(f"Expected 4 coordinates, got {len(cxcywh)}")
    if img_w <= 0 or img_h <= 0:
        raise ValueError("Image dimensions must be positive.")

    cx, cy, w, h = cxcywh
    if w <= 0.0 or h <= 0.0:
        raise ValueError(f"Zero-area bounding box: w={w}, h={h}")

    cx = max(0.0, min(1.0, float(cx)))
    cy = max(0.0, min(1.0, float(cy)))
    w = max(0.0, min(1.0, float(w)))
    h = max(0.0, min(1.0, float(h)))

    x1 = (cx - w / 2.0) * img_w
    y1 = (cy - h / 2.0) * img_h
    x2 = (cx + w / 2.0) * img_w
    y2 = (cy + h / 2.0) * img_h

    clamped_x1 = max(0.0, min(float(img_w), x1))
    clamped_y1 = max(0.0, min(float(img_h), y1))
    clamped_x2 = max(0.0, min(float(img_w), x2))
    clamped_y2 = max(0.0, min(float(img_h), y2))

    if clamped_x2 <= clamped_x1 or clamped_y2 <= clamped_y1:
        raise ValueError("Zero-area bounding box after clamping to image bounds.")

    return clamped_x1, clamped_y1, clamped_x2, clamped_y2


def extract_last_rect(canvas_json_data: Optional[Dict[str, Any]]) -> Optional[Dict[str, float]]:
    """Extract the last drawn rectangle from streamlit-drawable-canvas JSON data.

    Accounts for Fabric.js scaleX and scaleY properties.

    Args:
        canvas_json_data: The `json_data` dictionary from CanvasResult, or None.

    Returns:
        Dict with keys {'left', 'top', 'width', 'height'} as floats, or None if no rect found.
    """
    if not canvas_json_data or not isinstance(canvas_json_data, dict):
        return None

    objects = canvas_json_data.get("objects")
    if not objects or not isinstance(objects, list):
        return None

    rect_objects = [
        obj for obj in objects if isinstance(obj, dict) and obj.get("type") == "rect"
    ]
    if not rect_objects:
        return None

    last_rect = rect_objects[-1]
    left = float(last_rect.get("left", 0.0))
    top = float(last_rect.get("top", 0.0))
    width = float(last_rect.get("width", 0.0)) * float(last_rect.get("scaleX", 1.0))
    height = float(last_rect.get("height", 0.0)) * float(last_rect.get("scaleY", 1.0))

    return {
        "left": left,
        "top": top,
        "width": width,
        "height": height,
    }
