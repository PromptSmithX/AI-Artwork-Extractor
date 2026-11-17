"""Shared Pydantic schemas for the AI Artwork Extractor API.

This file is the single source of truth shared by the Colab server
(server_reference/*) and the local Streamlit app (local_app/*).
Do NOT change it without coordinator approval — see docs/API_CONTRACT.md.
"""
from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class Mode(str, Enum):
    TEXT = "text"
    BOX = "box"
    TEXT_BOX = "text_box"


class Scope(str, Enum):
    ENTIRE_PATCH = "entire_patch"
    INNER_ARTWORK = "inner_artwork"
    INDIVIDUAL_DECORATION = "individual_decoration"
    UNKNOWN = "unknown"


class ScopePreference(str, Enum):
    AUTO = "auto"
    ENTIRE_PATCH = "entire_patch"
    INNER_ARTWORK = "inner_artwork"
    INDIVIDUAL_DECORATION = "individual_decoration"


class PromptSuggestion(BaseModel):
    """Qwen Prompt Assistant output (plan section 4.4)."""

    target_description: str = ""
    scope: Scope = Scope.UNKNOWN
    sam_prompt: str = ""
    alternative_prompts: List[str] = Field(default_factory=list, max_length=3)
    location_hint: str = ""
    needs_clarification: bool = False
    clarification_question: str = ""
    reason: str = ""

    @field_validator("alternative_prompts", mode="before")
    @classmethod
    def _clean_alternatives(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            v = [v]
        out = []
        for p in v:
            p = str(p).strip()
            if p and p not in out:
                out.append(p)
        return out[:3]

    @field_validator("sam_prompt", "target_description", "location_hint",
                     "clarification_question", "reason", mode="before")
    @classmethod
    def _strip(cls, v):
        return "" if v is None else str(v).strip()


class HealthResponse(BaseModel):
    status: str = "ok"
    gpu: Optional[str] = None
    sam3_loaded: bool = False
    qwen_loaded: bool = False
    prompt_assistant_available: bool = False
    busy: bool = False


class CandidateMeta(BaseModel):
    id: int
    score: float
    bbox_xyxy_px: List[float] = Field(..., min_length=4, max_length=4)
    mask_area_px: int
    files: dict = Field(
        default_factory=dict,
        description="Relative names inside result/: mask, overlay, cutout, cutout_crop (may be absent if mask empty)",
    )


class SegmentMetadata(BaseModel):
    prompt: str = ""
    mode: Mode
    bbox_input: Optional[List[float]] = Field(
        default=None, description="Normalized [cx, cy, w, h] as received, or null for text mode"
    )
    image_size: List[int] = Field(..., min_length=2, max_length=2, description="[width, height]")
    confidence_threshold: float
    crop_padding_px: int = 12
    elapsed_ms: int
    num_candidates: int
    num_candidates_total: Optional[int] = Field(
        default=None,
        description="Candidates SAM 3 returned before the top-N max_candidates cut (>= num_candidates)",
    )
    candidates: List[CandidateMeta] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    detail: str
