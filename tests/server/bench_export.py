"""Benchmark script for image export performance.

Builds a 2000x1805 RGB image and 20 random-blob masks,
then measures build_result_zip execution time and output ZIP size.
Not collected by pytest (named bench_*, not test_*).
"""
from __future__ import annotations

import time
import numpy as np
from PIL import Image

from server_reference.image_export import build_result_zip
from server_reference.sam3_engine import SegResult
from server_reference.schemas import Mode


def generate_benchmark_data(width: int = 2000, height: int = 1805, n_masks: int = 20):
    rng = np.random.default_rng(42)
    # Realistic RGB image (gradient + noise)
    base_arr = rng.integers(0, 256, (height, width, 3), dtype=np.uint8)
    image = Image.fromarray(base_arr, mode="RGB")

    # Generate 20 random-blob masks
    masks = np.zeros((n_masks, height, width), dtype=bool)
    boxes = np.zeros((n_masks, 4), dtype=np.float32)
    scores = np.linspace(0.95, 0.40, n_masks, dtype=np.float32)

    y_indices, x_indices = np.ogrid[:height, :width]

    for i in range(n_masks):
        # Random center and radius for blob
        cx = rng.integers(int(width * 0.15), int(width * 0.85))
        cy = rng.integers(int(height * 0.15), int(height * 0.85))
        rx = rng.integers(80, 250)
        ry = rng.integers(80, 250)

        # Elliptical blob
        blob = ((x_indices - cx) / rx) ** 2 + ((y_indices - cy) / ry) ** 2 <= 1.0
        masks[i] = blob

        ys, xs = np.where(blob)
        if len(xs) > 0:
            boxes[i] = [float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())]
        else:
            boxes[i] = [0.0, 0.0, 10.0, 10.0]

    result = SegResult(masks=masks, boxes_xyxy=boxes, scores=scores)
    return image, result


def run_benchmark():
    width, height, n_masks = 2000, 1805, 20
    print(f"Generating test data: {width}x{height} image, {n_masks} masks...")
    image, result = generate_benchmark_data(width, height, n_masks)

    print("Running build_result_zip...")
    t0 = time.perf_counter()
    zip_bytes = build_result_zip(
        image,
        result,
        prompt="embroidered patch",
        mode=Mode.TEXT,
        bbox_input=None,
        threshold=0.35,
        elapsed_ms=1500,
    )
    t1 = time.perf_counter()

    elapsed_s = t1 - t0
    elapsed_ms = elapsed_s * 1000.0
    size_bytes = len(zip_bytes)
    size_mb = size_bytes / (1024 * 1024)

    print(f"Export time: {elapsed_s:.3f} s ({elapsed_ms:.1f} ms)")
    print(f"ZIP size: {size_bytes} bytes ({size_mb:.2f} MB)")
    return elapsed_s, size_bytes


if __name__ == "__main__":
    run_benchmark()
