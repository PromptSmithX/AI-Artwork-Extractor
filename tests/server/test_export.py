"""Tests for image export and ZIP generation.

Verifies:
- Cutout RGB matches original pixels, alpha is zero where mask is False.
- RGBA input alpha channel is properly preserved.
- Crop bounding box includes padding and is clamped to image boundary.
- Empty mask produces no crop file.
- ZIP package layout and metadata validate against SegmentMetadata.
"""
from __future__ import annotations

import io
import json
import zipfile

import numpy as np
from PIL import Image
import pytest

from server_reference.image_export import build_result_zip, normalize_masks
from server_reference.sam3_engine import SegResult
from server_reference.schemas import Mode, SegmentMetadata


def _create_test_image(mode: str = "RGB", size: tuple[int, int] = (100, 80)) -> Image.Image:
    """Create a deterministic test PIL image."""
    w, h = size
    if mode == "RGB":
        arr = np.zeros((h, w, 3), dtype=np.uint8)
        arr[:, :, 0] = 120  # R
        arr[:, :, 1] = 200  # G
        arr[:, :, 2] = 50   # B
        return Image.fromarray(arr, mode="RGB")
    elif mode == "RGBA":
        arr = np.zeros((h, w, 4), dtype=np.uint8)
        arr[:, :, 0] = 120  # R
        arr[:, :, 1] = 200  # G
        arr[:, :, 2] = 50   # B
        arr[:, :, 3] = 180  # semi-transparent alpha
        return Image.fromarray(arr, mode="RGBA")
    raise ValueError(f"Unsupported mode: {mode}")


def test_normalize_masks_various_shapes():
    """Verify mask normalization accepts 2D, 3D, and 4D arrays and handles resizing."""
    target_size = (100, 80)  # (w, h)

    # 1. 2D mask [H, W]
    mask_2d = np.ones((80, 100), dtype=bool)
    res_2d = normalize_masks(mask_2d, target_size)
    assert res_2d.shape == (1, 80, 100)
    assert res_2d.dtype == bool
    assert res_2d.all()

    # 2. 3D mask [N, H, W]
    mask_3d = np.zeros((2, 80, 100), dtype=np.float32)
    mask_3d[0, 10:20, 10:20] = 0.9
    res_3d = normalize_masks(mask_3d, target_size)
    assert res_3d.shape == (2, 80, 100)
    assert bool(res_3d[0, 15, 15]) is True
    assert bool(res_3d[0, 0, 0]) is False
    assert res_3d[1].sum() == 0

    # 3. 4D mask [N, 1, H, W]
    mask_4d = np.zeros((1, 1, 80, 100), dtype=np.uint8)
    mask_4d[0, 0, 5, 5] = 1
    res_4d = normalize_masks(mask_4d, target_size)
    assert res_4d.shape == (1, 80, 100)
    assert bool(res_4d[0, 5, 5]) is True

    # 4. Resizing when mask dimension differs from target_size
    small_mask = np.ones((1, 40, 50), dtype=bool)
    res_resized = normalize_masks(small_mask, target_size)
    assert res_resized.shape == (1, 80, 100)
    assert res_resized.dtype == bool
    assert res_resized.all()

    # 5. Empty instances
    empty_mask = np.zeros((0, 80, 100), dtype=bool)
    res_empty = normalize_masks(empty_mask, target_size)
    assert res_empty.shape == (0, 80, 100)


def test_export_cutout_rgb_and_alpha():
    """Verify cutout RGB matches original where mask is True and alpha is 0 elsewhere."""
    img = _create_test_image("RGB", size=(100, 80))
    orig_np = np.array(img)

    # Mask has True only in region [20:50, 30:70]
    mask = np.zeros((1, 80, 100), dtype=bool)
    mask[0, 20:50, 30:70] = True

    seg_res = SegResult(
        masks=mask,
        boxes_xyxy=np.array([[30.0, 20.0, 70.0, 50.0]], dtype=np.float32),
        scores=np.array([0.95], dtype=np.float32),
    )

    zip_bytes = build_result_zip(
        img,
        seg_res,
        prompt="test prompt",
        mode=Mode.TEXT,
        bbox_input=None,
        threshold=0.35,
        elapsed_ms=50,
    )

    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        cutout_data = zf.read("result/candidate_00_cutout.png")
        cutout_img = Image.open(io.BytesIO(cutout_data))
        cutout_np = np.array(cutout_img)

        assert cutout_img.mode == "RGBA"
        assert cutout_img.size == (100, 80)

        # Inside mask: RGB equals original, alpha is 255
        inside_rgb = cutout_np[30, 40, :3]
        inside_alpha = cutout_np[30, 40, 3]
        np.testing.assert_array_equal(inside_rgb, orig_np[30, 40])
        assert inside_alpha == 255

        # Outside mask: alpha is 0, RGB untouched
        outside_rgb = cutout_np[5, 5, :3]
        outside_alpha = cutout_np[5, 5, 3]
        np.testing.assert_array_equal(outside_rgb, orig_np[5, 5])
        assert outside_alpha == 0


def test_export_rgba_input_alpha_preserved():
    """Verify RGBA input image original alpha channel is preserved where mask is True."""
    img = _create_test_image("RGBA", size=(100, 80))
    orig_np = np.array(img)  # alpha is 180 everywhere

    mask = np.zeros((1, 80, 100), dtype=bool)
    mask[0, 10:30, 10:30] = True

    seg_res = SegResult(
        masks=mask,
        boxes_xyxy=np.array([[10.0, 10.0, 30.0, 30.0]], dtype=np.float32),
        scores=np.array([0.90], dtype=np.float32),
    )

    zip_bytes = build_result_zip(
        img,
        seg_res,
        prompt="patch",
        mode=Mode.BOX,
        bbox_input=[0.2, 0.25, 0.2, 0.25],
        threshold=0.35,
        elapsed_ms=42,
    )

    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        cutout_data = zf.read("result/candidate_00_cutout.png")
        cutout_img = Image.open(io.BytesIO(cutout_data))
        cutout_np = np.array(cutout_img)

        # Inside mask: alpha preserved at 180
        assert cutout_np[20, 20, 3] == orig_np[20, 20, 3] == 180
        np.testing.assert_array_equal(cutout_np[20, 20, :3], orig_np[20, 20, :3])

        # Outside mask: alpha is 0
        assert cutout_np[0, 0, 3] == 0


def test_export_crop_bbox_and_padding_clamped():
    """Verify crop box equals mask bbox + padding, clamped to image borders."""
    img = _create_test_image("RGB", size=(100, 80))

    # Mask near corner: x in [2, 10], y in [3, 12]
    # With padding=12, x0 should clamp to 0, y0 should clamp to 0
    mask = np.zeros((1, 80, 100), dtype=bool)
    mask[0, 3:13, 2:11] = True  # ys in 3..12, xs in 2..10

    seg_res = SegResult(
        masks=mask,
        boxes_xyxy=np.array([[2.0, 3.0, 11.0, 13.0]], dtype=np.float32),
        scores=np.array([0.88], dtype=np.float32),
    )

    zip_bytes = build_result_zip(
        img,
        seg_res,
        prompt="corner item",
        mode=Mode.TEXT,
        bbox_input=None,
        threshold=0.35,
        elapsed_ms=30,
        crop_padding_px=12,
    )

    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        crop_data = zf.read("result/candidate_00_cutout_crop.png")
        crop_img = Image.open(io.BytesIO(crop_data))

        # xs: min 2, max 10. pad 12 -> x0 = max(0, 2-12) = 0, x1 = min(100, 10+12+1) = 23
        # ys: min 3, max 12. pad 12 -> y0 = max(0, 3-12) = 0, y1 = min(80, 12+12+1) = 25
        assert crop_img.size == (23, 25)


def test_export_empty_mask_no_crop_file():
    """Verify an all-False mask produces no cutout_crop file in the ZIP."""
    img = _create_test_image("RGB", size=(100, 80))

    mask = np.zeros((1, 80, 100), dtype=bool)  # completely empty mask

    seg_res = SegResult(
        masks=mask,
        boxes_xyxy=np.array([[0.0, 0.0, 0.0, 0.0]], dtype=np.float32),
        scores=np.array([0.50], dtype=np.float32),
    )

    zip_bytes = build_result_zip(
        img,
        seg_res,
        prompt="nothing found",
        mode=Mode.TEXT,
        bbox_input=None,
        threshold=0.35,
        elapsed_ms=10,
    )

    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        names = zf.namelist()
        assert "result/candidate_00_mask.png" in names
        assert "result/candidate_00_cutout.png" in names
        assert "result/candidate_00_overlay.png" in names
        assert "result/candidate_00_cutout_crop.png" not in names

        meta_json = zf.read("result/metadata.json")
        meta = SegmentMetadata.model_validate_json(meta_json)
        assert meta.num_candidates == 1
        assert "cutout_crop" not in meta.candidates[0].files


def test_export_zip_layout_and_metadata_validation():
    """Verify ZIP layout, multiple candidates sorted by score descending, and metadata validation."""
    img = _create_test_image("RGB", size=(120, 90))

    # 2 candidates with scores in non-descending order to test sorting
    masks = np.zeros((2, 90, 120), dtype=bool)
    masks[0, 10:20, 10:20] = True
    masks[1, 30:50, 30:50] = True

    seg_res = SegResult(
        masks=masks,
        boxes_xyxy=np.array([[10.0, 10.0, 20.0, 20.0], [30.0, 30.0, 50.0, 50.0]], dtype=np.float32),
        scores=np.array([0.75, 0.95], dtype=np.float32),  # Candidate 1 has higher score
    )

    zip_bytes = build_result_zip(
        img,
        seg_res,
        prompt="multi patch",
        mode=Mode.TEXT_BOX,
        bbox_input=[0.5, 0.5, 0.4, 0.4],
        threshold=0.35,
        elapsed_ms=120,
    )

    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        names = set(zf.namelist())
        expected = {
            "result/metadata.json",
            "result/candidate_00_mask.png",
            "result/candidate_00_overlay.png",
            "result/candidate_00_cutout.png",
            "result/candidate_00_cutout_crop.png",
            "result/candidate_01_mask.png",
            "result/candidate_01_overlay.png",
            "result/candidate_01_cutout.png",
            "result/candidate_01_cutout_crop.png",
        }
        assert expected.issubset(names)

        meta_data = zf.read("result/metadata.json")
        meta = SegmentMetadata.model_validate_json(meta_data)

        assert meta.prompt == "multi patch"
        assert meta.mode == Mode.TEXT_BOX
        assert meta.bbox_input == [0.5, 0.5, 0.4, 0.4]
        assert meta.image_size == [120, 90]
        assert meta.num_candidates == 2

        # Check candidate 0 corresponds to score 0.95
        assert meta.candidates[0].id == 0
        assert meta.candidates[0].score == pytest.approx(0.95, rel=1e-3)
        assert meta.candidates[1].id == 1
        assert meta.candidates[1].score == pytest.approx(0.75, rel=1e-3)


def test_export_zero_candidates():
    """Verify export when 0 candidates are returned."""
    img = _create_test_image("RGB", size=(100, 80))

    seg_res = SegResult(
        masks=np.zeros((0, 80, 100), dtype=bool),
        boxes_xyxy=np.zeros((0, 4), dtype=np.float32),
        scores=np.zeros((0,), dtype=np.float32),
    )

    zip_bytes = build_result_zip(
        img,
        seg_res,
        prompt="nothing",
        mode=Mode.TEXT,
        bbox_input=None,
        threshold=0.35,
        elapsed_ms=15,
    )

    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        names = zf.namelist()
        assert names == ["result/metadata.json"]

        meta = SegmentMetadata.model_validate_json(zf.read("result/metadata.json"))
        assert meta.num_candidates == 0
        assert meta.candidates == []
