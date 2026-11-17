"""FastAPI application for AI Artwork Extractor reference server.

Implements contract §1 and project plan §7.
Endpoints:
  GET /health
  POST /api/v1/assistant/prompt
  POST /api/v1/segment
"""
from __future__ import annotations

import io
import json
import logging
import secrets
import threading
import time
from typing import TYPE_CHECKING, Any, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps

from server_reference.errors import PromptAssistantOutputError, PromptAssistantUnavailable
from server_reference.image_export import build_result_zip
from server_reference.sam3_engine import gpu_name
from server_reference.schemas import HealthResponse, Mode, PromptSuggestion, ScopePreference

if TYPE_CHECKING:
    from server_reference.sam3_engine import Sam3Engine

logger = logging.getLogger("server_reference.api")
ALLOWED_FORMATS = ("JPEG", "JPG", "PNG", "WEBP")


def _read_and_validate_image(file: UploadFile, max_upload_mb: int) -> Image.Image:
    """Read uploaded file with size cap and validate format.

    Raises:
        HTTPException 413 if upload exceeds max_upload_mb.
        HTTPException 415 if file is not a supported decodable image.
    """
    max_bytes = max_upload_mb * 1024 * 1024
    content = file.file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Upload exceeds maximum allowed size of {max_upload_mb}MB")

    try:
        img_probe = Image.open(io.BytesIO(content))
        img_probe.verify()
    except Exception:
        raise HTTPException(status_code=415, detail="Uploaded file is not a valid decodable image")

    fmt = (img_probe.format or "").upper()
    if fmt not in ALLOWED_FORMATS:
        raise HTTPException(status_code=415, detail=f"Image format '{fmt}' is not supported. Use JPG, PNG, or WebP.")

    # Re-open clean image after verify() and apply orientation
    img = Image.open(io.BytesIO(content))
    img = ImageOps.exif_transpose(img)
    return img


def create_app(
    sam_engine: Optional[Any] = None,
    assistant: Optional[Any] = None,
    api_token: str = "",
    max_upload_mb: int = 20,
    default_threshold: float = 0.35,
    max_candidates: int = 12,
    cors_origins: Optional[list[str]] = None,
    overlay_max_side: int = 768,
) -> FastAPI:
    """Create and configure the FastAPI application."""
    if not api_token or not api_token.strip() or len(api_token.strip()) < 16:
        raise ValueError("api_token must be a non-empty string of at least 16 characters")
    api_token = api_token.strip()

    app = FastAPI(title="AI Artwork Extractor Colab Server")
    lock = threading.Lock()
    app.state.lock = lock

    # Configure CORS for browser Web UI per contract §1
    allowed_origins = (
        list(cors_origins)
        if cors_origins is not None
        else ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Content-Disposition"],
    )

    @app.exception_handler(RequestValidationError)
    def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        first_err = exc.errors()[0] if exc.errors() else {}
        msg = first_err.get("msg", "Validation error")
        loc = ".".join(str(x) for x in first_err.get("loc", []) if x != "body")
        detail = f"{loc}: {msg}" if loc else msg
        return JSONResponse(status_code=422, content={"detail": detail})

    def verify_auth(authorization: Optional[str] = Header(None)) -> None:
        """Enforce Bearer token authorization header case-insensitively per RFC 6750."""
        if not authorization:
            raise HTTPException(
                status_code=401,
                detail="Missing or invalid Bearer authorization header",
                headers={"WWW-Authenticate": "Bearer"},
            )
        parts = authorization.split(maxsplit=1)
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise HTTPException(
                status_code=401,
                detail="Missing or invalid Bearer authorization header",
                headers={"WWW-Authenticate": "Bearer"},
            )
        token = parts[1].strip()
        if not secrets.compare_digest(token, api_token):
            raise HTTPException(
                status_code=401,
                detail="Invalid API token",
                headers={"WWW-Authenticate": "Bearer"},
            )

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        """Health check endpoint (no auth required)."""
        sam_loaded = bool(getattr(sam_engine, "loaded", False)) if sam_engine else False
        qwen_loaded = bool(getattr(assistant, "loaded", False)) if assistant else False
        asst_avail = bool(getattr(assistant, "available", False)) if assistant else False

        return HealthResponse(
            status="ok",
            gpu=gpu_name(),
            sam3_loaded=sam_loaded,
            qwen_loaded=qwen_loaded,
            prompt_assistant_available=asst_avail,
            busy=lock.locked(),
        )

    @app.post("/api/v1/assistant/prompt", response_model=PromptSuggestion)
    def assistant_prompt(
        image: UploadFile = File(...),
        user_request: str = Form(...),
        scope_preference: Optional[str] = Form("auto"),
        _: None = Depends(verify_auth),
    ) -> PromptSuggestion:
        """Ask prompt assistant to suggest refined prompts for SAM 3."""
        if assistant is None or not getattr(assistant, "available", False):
            raise HTTPException(status_code=503, detail="Prompt assistant is not available")

        # Validate user_request
        clean_request = user_request.strip() if user_request else ""
        if not clean_request:
            raise HTTPException(status_code=422, detail="user_request must not be empty")
        if len(clean_request) > 1000:
            raise HTTPException(status_code=422, detail="user_request exceeds maximum length of 1000 characters")

        # Validate scope_preference
        valid_scopes = {s.value for s in ScopePreference}
        scope_str = (scope_preference or "auto").strip()
        if scope_str not in valid_scopes:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid scope_preference '{scope_str}'. Allowed: {sorted(valid_scopes)}",
            )
        scope_pref = ScopePreference(scope_str)

        # Validate uploaded image
        img = _read_and_validate_image(image, max_upload_mb)

        # Acquire lock non-blocking
        if not lock.acquire(blocking=False):
            raise HTTPException(status_code=409, detail="busy")

        try:
            return assistant.suggest(img, clean_request, scope_pref)
        except PromptAssistantUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc))
        except PromptAssistantOutputError as exc:
            raise HTTPException(status_code=502, detail=str(exc))
        except HTTPException:
            raise
        except Exception:
            logger.exception("Unexpected error in prompt assistant inference")
            raise HTTPException(status_code=500, detail="Internal server error")
        finally:
            lock.release()

    @app.post("/api/v1/segment")
    def segment(
        image: UploadFile = File(...),
        mode: str = Form(...),
        prompt: Optional[str] = Form(None),
        bbox: Optional[str] = Form(None),
        confidence_threshold: Optional[float] = Form(None),
        export_profile: Optional[str] = Form("lean"),
        _: None = Depends(verify_auth),
    ) -> Response:
        """Run SAM 3 segmentation and return in-memory ZIP archive."""
        if sam_engine is None or not getattr(sam_engine, "loaded", False):
            raise HTTPException(status_code=503, detail="SAM 3 engine is not loaded")

        # Validate export_profile
        profile_clean = (export_profile or "lean").strip().lower()
        if profile_clean not in ("lean", "full"):
            raise HTTPException(
                status_code=422,
                detail=f"Invalid export_profile '{profile_clean}'. Allowed: ['full', 'lean']",
            )

        # Validate mode
        valid_modes = {m.value for m in Mode}
        mode_clean = (mode or "").strip()
        if mode_clean not in valid_modes:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid mode '{mode_clean}'. Allowed: {sorted(valid_modes)}",
            )
        mode_enum = Mode(mode_clean)

        # Validate prompt
        clean_prompt = prompt.strip() if prompt else ""
        if mode_enum in (Mode.TEXT, Mode.TEXT_BOX) and not clean_prompt:
            raise HTTPException(status_code=422, detail="prompt is required for text and text_box modes")
        if mode_enum == Mode.BOX:
            clean_prompt = ""

        # Validate bbox
        parsed_bbox: Optional[list[float]] = None
        if mode_enum in (Mode.BOX, Mode.TEXT_BOX):
            if not bbox or not bbox.strip():
                raise HTTPException(status_code=422, detail="bbox is required for box and text_box modes")
            try:
                raw_bbox = json.loads(bbox)
            except Exception:
                raise HTTPException(status_code=422, detail="bbox must be a valid JSON array")

            if not isinstance(raw_bbox, (list, tuple)) or len(raw_bbox) != 4:
                raise HTTPException(status_code=422, detail="bbox must be an array of 4 numbers [cx, cy, w, h]")

            try:
                cx, cy, bw, bh = [float(v) for v in raw_bbox]
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail="bbox values must be numeric")

            if not (0.0 <= cx <= 1.0 and 0.0 <= cy <= 1.0):
                raise HTTPException(status_code=422, detail="bbox center coordinates cx, cy must be within [0, 1]")
            if not (0.0 < bw <= 1.0 and 0.0 < bh <= 1.0):
                raise HTTPException(status_code=422, detail="bbox dimensions w, h must be in (0, 1]")

            parsed_bbox = [cx, cy, bw, bh]

        # Validate confidence_threshold
        if confidence_threshold is not None:
            if not (0.0 < confidence_threshold <= 1.0):
                raise HTTPException(status_code=422, detail="confidence_threshold must be in (0, 1]")
            threshold_val = float(confidence_threshold)
        else:
            threshold_val = default_threshold

        # Validate image upload
        img = _read_and_validate_image(image, max_upload_mb)

        # Prepare export image (preserve RGBA if transparent PNG) and RGB image for SAM engine
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            export_image = img.convert("RGBA")
        else:
            export_image = img.convert("RGB")
        engine_image = export_image.convert("RGB")

        # Acquire lock non-blocking
        if not lock.acquire(blocking=False):
            raise HTTPException(status_code=409, detail="busy")

        t0 = time.perf_counter()
        try:
            seg_result = sam_engine.segment(
                engine_image,
                mode=mode_enum,
                prompt=clean_prompt,
                bbox_cxcywh_norm=parsed_bbox,
                threshold=threshold_val,
            )
            infer_ms = max(1, int((time.perf_counter() - t0) * 1000))
            num_candidates_total = (
                len(seg_result.scores)
                if hasattr(seg_result, "scores") and hasattr(seg_result.scores, "__len__")
                else (
                    seg_result.masks.shape[0]
                    if hasattr(seg_result, "masks") and hasattr(seg_result.masks, "shape")
                    else 0
                )
            )

            t_export_start = time.perf_counter()
            zip_bytes = build_result_zip(
                export_image,
                seg_result,
                prompt=clean_prompt,
                mode=mode_enum,
                bbox_input=parsed_bbox,
                threshold=threshold_val,
                elapsed_ms=infer_ms,
                max_candidates=max_candidates,
                export_profile=profile_clean,
                overlay_max_side=overlay_max_side,
            )
            export_ms = max(0, int((time.perf_counter() - t_export_start) * 1000))
            zip_bytes_len = len(zip_bytes)

            # Safe logging: mode, prompt, profile, infer_ms, export_ms, zip_bytes, num_candidates_total (never images/tokens)
            logger.info(
                "segment finished: mode=%s prompt=%r profile=%s infer_ms=%d export_ms=%d zip_bytes=%d num_candidates_total=%d",
                mode_enum.value,
                clean_prompt,
                profile_clean,
                infer_ms,
                export_ms,
                zip_bytes_len,
                num_candidates_total,
            )

            return Response(
                content=zip_bytes,
                media_type="application/zip",
                headers={"Content-Disposition": 'attachment; filename="result.zip"'},
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except HTTPException:
            raise
        except Exception:
            logger.exception("Unexpected error during segmentation inference")
            raise HTTPException(status_code=500, detail="Internal server error")
        finally:
            lock.release()

    return app
