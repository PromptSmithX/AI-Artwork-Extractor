"""Tests for Sam3Engine wrapper and helper functions.

Verifies:
- gpu_name helper works safely without CUDA.
- _to_numpy_masks converts and resizes properly.
- Sam3Engine unloaded state raises RuntimeError on segment().
- Sam3Engine properties and initialization.
"""
from __future__ import annotations

import numpy as np
from PIL import Image
import pytest

from server_reference.sam3_engine import Sam3Engine, SegResult, _to_numpy_masks, gpu_name
from server_reference.schemas import Mode


def test_gpu_name():
    """gpu_name() returns a string or None, never raises."""
    name = gpu_name()
    assert name is None or isinstance(name, str)


def test_to_numpy_masks_shapes():
    """_to_numpy_masks handles 2D, 3D, and 4D inputs."""
    target_size = (60, 40)  # (w, h)

    # 4D [1, 1, 40, 60]
    t4 = np.zeros((1, 1, 40, 60), dtype=np.float32)
    t4[0, 0, 10, 10] = 0.8
    res = _to_numpy_masks(t4, target_size)
    assert res.shape == (1, 40, 60)
    assert bool(res[0, 10, 10]) is True
    assert bool(res[0, 0, 0]) is False

    # 2D [40, 60]
    t2 = np.ones((40, 60), dtype=np.float32)
    res2 = _to_numpy_masks(t2, target_size)
    assert res2.shape == (1, 40, 60)
    assert res2.all()

    # Empty [0, 40, 60]
    t0 = np.zeros((0, 40, 60), dtype=np.float32)
    res0 = _to_numpy_masks(t0, target_size)
    assert res0.shape == (0, 40, 60)


def test_sam3_engine_unloaded_raises():
    """Calling segment() when Sam3Engine is not loaded raises RuntimeError."""
    engine = Sam3Engine(device="cpu", confidence_threshold=0.35)
    assert engine.loaded is False

    img = Image.new("RGB", (50, 50), color=(100, 100, 100))
    with pytest.raises(RuntimeError, match="Sam3Engine is not loaded"):
        engine.segment(img, mode=Mode.TEXT, prompt="patch")


def test_seg_result_dataclass():
    """SegResult holds masks, boxes_xyxy, and scores."""
    res = SegResult(
        masks=np.zeros((1, 10, 10), dtype=bool),
        boxes_xyxy=np.zeros((1, 4), dtype=np.float32),
        scores=np.zeros((1,), dtype=np.float32),
    )
    assert res.masks.shape == (1, 10, 10)
    assert res.boxes_xyxy.shape == (1, 4)
    assert res.scores.shape == (1,)
