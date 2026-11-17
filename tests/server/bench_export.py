"""Benchmark script for image export performance: lean vs full profile.

Builds or loads a realistic 2000x1805 image and 20 circular/blob masks,
then benchmarks build_result_zip under both 'full' and 'lean' profiles.
Supports running directly or as: python -m tests.server.bench_export
Not collected by pytest (named bench_*, not test_*).
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path
import numpy as np
from PIL import Image

from server_reference.image_export import build_result_zip
from server_reference.sam3_engine import SegResult
from server_reference.schemas import Mode

SAMPLE_IMAGE_PATH = "D:/AI_Artwork_Extractor/test sam 3/123.png"


def load_or_create_benchmark_image(width: int = 2000, height: int = 1805) -> Image.Image:
    """Load sample image if available, otherwise generate a smooth color gradient image."""
    if os.path.exists(SAMPLE_IMAGE_PATH):
        try:
            raw_img = Image.open(SAMPLE_IMAGE_PATH)
            return raw_img.convert("RGBA").resize((width, height), resample=Image.Resampling.BILINEAR)
        except Exception:
            pass

    # Smooth gradient fallback (realistic compressibility, not random noise)
    y, x = np.ogrid[:height, :width]
    r = ((x / width) * 200 + 30).astype(np.uint8)
    g = ((y / height) * 180 + 40).astype(np.uint8)
    b = (((x + y) / (width + height)) * 220).astype(np.uint8)
    arr = np.dstack([r, g, b])
    return Image.fromarray(arr, mode="RGB")


def generate_benchmark_masks(width: int = 2000, height: int = 1805, n_masks: int = 20) -> SegResult:
    masks = np.zeros((n_masks, height, width), dtype=bool)
    boxes = np.zeros((n_masks, 4), dtype=np.float32)
    scores = np.linspace(0.98, 0.45, n_masks, dtype=np.float32)

    y_grid, x_grid = np.ogrid[:height, :width]

    # Deterministic blob generator (4 columns x 5 rows)
    cols = 4
    rows = 5
    for i in range(n_masks):
        c = i % cols
        r = i // cols
        cx = int(width * 0.15 + c * (width * 0.70 / (cols - 1)))
        cy = int(height * 0.15 + r * (height * 0.70 / (rows - 1)))
        rx = 140 + (i % 3) * 30
        ry = 130 + (i % 2) * 40

        blob = ((x_grid - cx) / rx) ** 2 + ((y_grid - cy) / ry) ** 2 <= 1.0
        masks[i] = blob

        ys, xs = np.where(blob)
        if len(xs) > 0:
            boxes[i] = [float(xs.min()), float(ys.min()), float(xs.max() + 1), float(ys.max() + 1)]
        else:
            boxes[i] = [0.0, 0.0, 10.0, 10.0]

    return SegResult(masks=masks, boxes_xyxy=boxes, scores=scores)


def run_benchmark():
    width, height, n_masks = 2000, 1805, 20
    print(f"Loading/preparing {width}x{height} image and {n_masks} masks...")
    image = load_or_create_benchmark_image(width, height)
    result = generate_benchmark_masks(width, height, n_masks)
    print(f"Image mode: {image.mode}, size: {image.size}")

    # 1. Benchmark FULL profile
    print("\n--- Running FULL profile export (max_candidates=12) ---")
    t0_full = time.perf_counter()
    zip_bytes_full = build_result_zip(
        image,
        result,
        prompt="embroidered patch",
        mode=Mode.TEXT,
        bbox_input=None,
        threshold=0.35,
        elapsed_ms=1500,
        max_candidates=12,
        export_profile="full",
    )
    t1_full = time.perf_counter()
    full_elapsed_s = t1_full - t0_full
    full_size_bytes = len(zip_bytes_full)
    full_size_mb = full_size_bytes / (1024 * 1024)
    print(f"FULL export time: {full_elapsed_s:.3f} s ({full_elapsed_s * 1000:.1f} ms)")
    print(f"FULL ZIP size   : {full_size_bytes} bytes ({full_size_mb:.2f} MB)")

    # 2. Benchmark LEAN profile
    print("\n--- Running LEAN profile export (max_candidates=12, overlay_max_side=768) ---")
    t0_lean = time.perf_counter()
    zip_bytes_lean = build_result_zip(
        image,
        result,
        prompt="embroidered patch",
        mode=Mode.TEXT,
        bbox_input=None,
        threshold=0.35,
        elapsed_ms=1500,
        max_candidates=12,
        export_profile="lean",
        overlay_max_side=768,
    )
    t1_lean = time.perf_counter()
    lean_elapsed_s = t1_lean - t0_lean
    lean_size_bytes = len(zip_bytes_lean)
    lean_size_mb = lean_size_bytes / (1024 * 1024)
    print(f"LEAN export time: {lean_elapsed_s:.3f} s ({lean_elapsed_s * 1000:.1f} ms)")
    print(f"LEAN ZIP size   : {lean_size_bytes} bytes ({lean_size_mb:.2f} MB)")

    print("\n" + "=" * 60)
    print(f"{'Profile':<10} | {'Export Time':<15} | {'ZIP Size':<15}")
    print("-" * 60)
    print(f"{'FULL':<10} | {full_elapsed_s:.3f} s ({full_elapsed_s*1000:.1f} ms) | {full_size_mb:.2f} MB ({full_size_bytes} B)")
    print(f"{'LEAN':<10} | {lean_elapsed_s:.3f} s ({lean_elapsed_s*1000:.1f} ms) | {lean_size_mb:.2f} MB ({lean_size_bytes} B)")
    print("=" * 60)

    return (full_elapsed_s, full_size_bytes), (lean_elapsed_s, lean_size_bytes)


if __name__ == "__main__":
    run_benchmark()
