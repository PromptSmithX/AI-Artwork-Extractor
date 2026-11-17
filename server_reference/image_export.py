"""Image export and ZIP packaging for AI Artwork Extractor.

Produces transparent cutouts, overlays, masks, and metadata.json
strictly following contract §2 and project plan §5.4.
"""
from __future__ import annotations

import io
import zipfile
from typing import TYPE_CHECKING, Any, List, Optional

import numpy as np
from PIL import Image

from server_reference.schemas import CandidateMeta, Mode, SegmentMetadata

if TYPE_CHECKING:
    import PIL.Image
    from server_reference.sam3_engine import SegResult


def normalize_masks(masks_input: Any, target_size: tuple[int, int]) -> np.ndarray:
    """Normalize masks array/tensor of shape [N,1,H,W], [N,H,W], or [H,W] to bool [N, target_H, target_W].

    Resizes to target_size (width, height) using NEAREST interpolation if dimensions differ.
    """
    if hasattr(masks_input, "detach"):
        arr = masks_input.detach().float().cpu().numpy()
    else:
        arr = np.asarray(masks_input)

    # Convert to float/bool
    if arr.dtype == bool:
        pass
    elif np.issubdtype(arr.dtype, np.floating):
        arr = arr > 0.5
    else:
        arr = arr != 0

    if arr.ndim == 4 and arr.shape[1] == 1:
        arr = arr[:, 0]
    elif arr.ndim == 2:
        arr = arr[None, ...]
    elif arr.ndim == 3:
        pass
    else:
        raise ValueError(f"Unsupported mask shape: {arr.shape}")

    arr = arr.astype(bool)
    target_w, target_h = target_size
    n_instances = arr.shape[0]

    if n_instances == 0:
        return np.zeros((0, target_h, target_w), dtype=bool)

    cur_h, cur_w = arr.shape[1], arr.shape[2]
    if (cur_h, cur_w) == (target_h, target_w):
        return arr

    resized = np.zeros((n_instances, target_h, target_w), dtype=bool)
    for i in range(n_instances):
        pil_mask = Image.fromarray(arr[i].astype(np.uint8) * 255, mode="L")
        resized_pil = pil_mask.resize((target_w, target_h), resample=Image.Resampling.NEAREST)
        resized[i] = np.array(resized_pil) > 127

    return resized


def build_result_zip(
    image: PIL.Image.Image,
    result: SegResult,
    *,
    prompt: str,
    mode: Mode,
    bbox_input: Optional[List[float]],
    threshold: float,
    elapsed_ms: int,
    crop_padding_px: int = 12,
    max_candidates: int = 12,
    export_profile: str = "lean",
    overlay_max_side: int = 768,
) -> bytes:
    """Export segmentation results into an in-memory ZIP package per contract §2.

    Returns the raw ZIP bytes without creating any temporary files on disk.
    Supports export profiles:
      - 'lean' (default): mask, cutout_crop, downscaled overlay (max side <= overlay_max_side),
        and NO full-canvas cutout.
      - 'full': original behavior with full-canvas cutout and full-res overlay.
    """
    profile = (export_profile or "lean").strip().lower()
    if profile not in ("lean", "full"):
        raise ValueError(f"Invalid export_profile '{export_profile}'. Allowed: ['full', 'lean']")

    w, h = image.width, image.height
    masks = normalize_masks(result.masks, (w, h))
    num_candidates_total = masks.shape[0]

    # Scores and boxes
    scores = (
        result.scores.reshape(-1)
        if hasattr(result.scores, "reshape")
        else np.array(result.scores, dtype=np.float32)
    )
    boxes = (
        result.boxes_xyxy
        if hasattr(result.boxes_xyxy, "ndim") and result.boxes_xyxy.ndim == 2
        else np.zeros((num_candidates_total, 4), dtype=np.float32)
    )

    # Sort candidate indices by score descending
    if num_candidates_total > 0 and len(scores) >= num_candidates_total:
        order = np.argsort(-scores[:num_candidates_total])
    else:
        order = np.arange(num_candidates_total)

    if max_candidates is not None and max_candidates > 0:
        order = order[:max_candidates]

    # Prepare base RGBA numpy array
    if image.mode == "RGBA":
        source_rgba = np.array(image)
    else:
        source_rgba = np.array(image.convert("RGBA"))

    orig_alpha = source_rgba[:, :, 3].astype(np.uint16)
    has_orig_transparency = bool((orig_alpha < 255).any())
    base_rgb = source_rgba[:, :, :3]
    tint = np.array([255, 40, 170], dtype=np.uint16)

    # In lean profile, pre-downscale base RGB image for overlay review previews
    max_dim = max(w, h)
    if profile == "lean" and overlay_max_side and max_dim > overlay_max_side:
        scale = overlay_max_side / float(max_dim)
        dw = max(1, int(round(w * scale)))
        dh = max(1, int(round(h * scale)))
        base_pil = Image.fromarray(base_rgb, mode="RGB")
        downscaled_base_rgb = np.array(
            base_pil.resize((dw, dh), resample=Image.Resampling.BILINEAR)
        )
    else:
        dw, dh = w, h
        downscaled_base_rgb = None

    candidates_meta: List[CandidateMeta] = []
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_STORED) as zf:
        for new_id, orig_idx in enumerate(order):
            mask = masks[orig_idx]
            mask_u8 = mask.astype(np.uint8) * 255
            score_val = float(scores[orig_idx]) if orig_idx < len(scores) else 0.0

            # 1. Mask PNG (L mode, 0/255)
            mask_filename = f"candidate_{new_id:02d}_mask.png"
            mask_pil = Image.fromarray(mask_u8, mode="L")
            mask_bytes = io.BytesIO()
            mask_pil.save(mask_bytes, format="PNG", compress_level=1)
            zf.writestr(f"result/{mask_filename}", mask_bytes.getvalue())

            # 2. Cutout Crop (clamped to image; absent if mask is empty)
            ys, xs = np.where(mask)
            has_crop = len(xs) > 0
            crop_filename: Optional[str] = None
            crop_box_xyxy_px: Optional[List[int]] = None
            if has_crop:
                x0 = max(0, int(xs.min()) - crop_padding_px)
                x1 = min(w, int(xs.max()) + crop_padding_px + 1)
                y0 = max(0, int(ys.min()) - crop_padding_px)
                y1 = min(h, int(ys.max()) + crop_padding_px + 1)
                crop_box_xyxy_px = [x0, y0, x1, y1]

                crop_rgba = source_rgba[y0:y1, x0:x1].copy()
                mask_crop = mask_u8[y0:y1, x0:x1]
                if has_orig_transparency:
                    crop_rgba[:, :, 3] = (
                        (crop_rgba[:, :, 3].astype(np.uint16) * mask_crop.astype(np.uint16)) // 255
                    ).astype(np.uint8)
                else:
                    crop_rgba[:, :, 3] = mask_crop

                crop_pil = Image.fromarray(crop_rgba, mode="RGBA")
                crop_filename = f"candidate_{new_id:02d}_cutout_crop.png"
                crop_bytes = io.BytesIO()
                crop_pil.save(crop_bytes, format="PNG", compress_level=1)
                zf.writestr(f"result/{crop_filename}", crop_bytes.getvalue())

            # 3. Overlay PNG (RGB colored mask review preview)
            overlay_filename = f"candidate_{new_id:02d}_overlay.png"
            overlay_bytes = io.BytesIO()
            if downscaled_base_rgb is not None:
                # Lean profile: compute on downscaled image
                d_mask = np.array(
                    mask_pil.resize((dw, dh), resample=Image.Resampling.NEAREST)
                ) > 127
                overlay_arr = downscaled_base_rgb.copy()
                overlay_arr[d_mask] = (
                    (downscaled_base_rgb[d_mask].astype(np.uint16) * 145 + tint * 110 + 127) // 255
                ).astype(np.uint8)
                overlay_pil = Image.fromarray(overlay_arr, mode="RGB")
            else:
                # Full profile or small image: full resolution overlay
                overlay_arr = base_rgb.copy()
                overlay_arr[mask] = (
                    (base_rgb[mask].astype(np.uint16) * 145 + tint * 110 + 127) // 255
                ).astype(np.uint8)
                overlay_pil = Image.fromarray(overlay_arr, mode="RGB")

            overlay_pil.save(overlay_bytes, format="PNG", compress_level=1)
            zf.writestr(f"result/{overlay_filename}", overlay_bytes.getvalue())

            # 4. Full Canvas Cutout (full profile ONLY)
            cutout_filename: Optional[str] = None
            if profile == "full":
                cutout_arr = source_rgba.copy()
                if has_orig_transparency:
                    cutout_arr[:, :, 3] = (
                        (orig_alpha * mask_u8.astype(np.uint16)) // 255
                    ).astype(np.uint8)
                else:
                    cutout_arr[:, :, 3] = mask_u8

                cutout_filename = f"candidate_{new_id:02d}_cutout.png"
                cutout_pil = Image.fromarray(cutout_arr, mode="RGBA")
                cutout_bytes = io.BytesIO()
                cutout_pil.save(cutout_bytes, format="PNG", compress_level=1)
                zf.writestr(f"result/{cutout_filename}", cutout_bytes.getvalue())

            # Candidate bbox
            if orig_idx < len(boxes) and len(boxes[orig_idx]) == 4:
                bbox_xyxy = [float(b) for b in boxes[orig_idx]]
            elif has_crop:
                bbox_xyxy = [float(xs.min()), float(ys.min()), float(xs.max() + 1), float(ys.max() + 1)]
            else:
                bbox_xyxy = [0.0, 0.0, 0.0, 0.0]

            files_dict = {
                "mask": mask_filename,
                "overlay": overlay_filename,
            }
            if cutout_filename is not None:
                files_dict["cutout"] = cutout_filename
            if crop_filename is not None:
                files_dict["cutout_crop"] = crop_filename

            candidate_meta = CandidateMeta(
                id=new_id,
                score=score_val,
                bbox_xyxy_px=bbox_xyxy,
                mask_area_px=int(np.sum(mask)),
                crop_box_xyxy_px=crop_box_xyxy_px,
                files=files_dict,
            )
            candidates_meta.append(candidate_meta)

        # 5. SegmentMetadata
        metadata = SegmentMetadata(
            prompt=prompt,
            mode=mode,
            bbox_input=bbox_input,
            image_size=[w, h],
            confidence_threshold=threshold,
            crop_padding_px=crop_padding_px,
            export_profile=profile,
            overlay_max_side=overlay_max_side if profile == "lean" else None,
            elapsed_ms=elapsed_ms,
            num_candidates=len(candidates_meta),
            num_candidates_total=num_candidates_total,
            candidates=candidates_meta,
        )

        metadata_json = metadata.model_dump_json(indent=2)
        zf.writestr("result/metadata.json", metadata_json.encode("utf-8"))

    return zip_buffer.getvalue()
