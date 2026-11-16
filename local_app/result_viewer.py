"""Image display and compositing helpers for local Streamlit UI.

Provides checkerboard background, alpha blending, bounding box visualization,
and candidate caption generation.
"""
from __future__ import annotations

import io
from typing import Sequence, Tuple, Union

import numpy as np
from PIL import Image, ImageDraw

from server_reference.schemas import CandidateMeta


def checkerboard(size: Tuple[int, int], tile: int = 16) -> Image.Image:
    """Generate a checkerboard pattern image of given (width, height).

    Args:
        size: (width, height) in pixels (> 0).
        tile: Checker tile square size in pixels (> 0).

    Returns:
        RGB PIL Image displaying an alternating white/light-gray checker pattern.

    Raises:
        ValueError: If size dimensions or tile size are <= 0.
    """
    width, height = size
    if width <= 0 or height <= 0 or tile <= 0:
        raise ValueError("Width, height, and tile size must be positive integers.")

    y = np.arange(height)[:, None] // tile
    x = np.arange(width)[None, :] // tile
    pattern = ((y + x) % 2).astype(np.uint8)
    gray = np.where(pattern == 0, 240, 200).astype(np.uint8)
    rgb = np.stack([gray, gray, gray], axis=-1)
    return Image.fromarray(rgb, mode="RGB")


def composite_on_background(rgba: Image.Image, kind: str = "checker") -> Image.Image:
    """Composite an RGBA image onto a background ('checker', 'dark', or 'light').

    Args:
        rgba: PIL Image with alpha channel (converted to RGBA if not already).
        kind: Background type: 'checker', 'dark', or 'light'.

    Returns:
        RGB PIL Image with alpha blended over the requested background.

    Raises:
        ValueError: If `kind` is not one of ('checker', 'dark', 'light').
    """
    kind_lower = kind.strip().lower()
    if kind_lower not in ("checker", "dark", "light"):
        raise ValueError(
            f"Unknown background kind '{kind}'. Must be 'checker', 'dark', or 'light'."
        )

    if rgba.mode != "RGBA":
        rgba = rgba.convert("RGBA")

    if kind_lower == "checker":
        bg = checkerboard(rgba.size, tile=16).convert("RGBA")
    elif kind_lower == "dark":
        bg = Image.new("RGBA", rgba.size, (32, 32, 32, 255))
    else:  # "light"
        bg = Image.new("RGBA", rgba.size, (245, 245, 245, 255))

    composite = Image.alpha_composite(bg, rgba)
    return composite.convert("RGB")


def draw_bbox(
    image: Image.Image,
    xyxy: Sequence[Union[int, float]],
    color: Union[str, Tuple[int, int, int]] = "red",
    width: int = 3,
) -> Image.Image:
    """Draw a bounding box rectangle on a copy of the image.

    Args:
        image: Original PIL Image.
        xyxy: [x1, y1, x2, y2] bounding box coordinates.
        color: Outline color (name or RGB tuple).
        width: Stroke line thickness in pixels.

    Returns:
        New RGB PIL Image with the bounding box drawn.
    """
    if len(xyxy) != 4:
        raise ValueError(f"Expected 4 coordinates for xyxy, got {len(xyxy)}")

    img_copy = image.copy().convert("RGB")
    draw = ImageDraw.Draw(img_copy)
    x1, y1, x2, y2 = xyxy
    box = [min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)]
    draw.rectangle(box, outline=color, width=width)
    return img_copy


def candidate_caption(candidate_meta: CandidateMeta) -> str:
    """Format candidate metadata caption with score (3 decimals), bbox ints, and area.

    Example: 'Score: 0.912 | Box: [410, 250, 780, 560] | Area: 90,210 px'
    """
    bbox = candidate_meta.bbox_xyxy_px
    b_int = [int(round(float(c))) for c in bbox]
    return (
        f"Score: {candidate_meta.score:.3f} | "
        f"Box: [{b_int[0]}, {b_int[1]}, {b_int[2]}, {b_int[3]}] | "
        f"Area: {candidate_meta.mask_area_px:,} px"
    )


def to_png_bytes(image: Image.Image) -> bytes:
    """Serialize a PIL Image to PNG bytes."""
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()
