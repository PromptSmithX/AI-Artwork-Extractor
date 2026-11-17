/**
 * Shared types — mirror of server_reference/schemas.py and docs/API_CONTRACT.md.
 * Owned by the coordinator. Workers: ask before changing (orca orchestration ask).
 */

export type Mode = 'text' | 'box' | 'text_box'

export type Scope = 'entire_patch' | 'inner_artwork' | 'individual_decoration' | 'unknown'

export type ScopePreference = 'auto' | 'entire_patch' | 'inner_artwork' | 'individual_decoration'

export interface PromptSuggestion {
  target_description: string
  scope: Scope
  /** Short ENGLISH noun phrase for SAM 3. */
  sam_prompt: string
  alternative_prompts: string[]
  location_hint: string
  needs_clarification: boolean
  clarification_question: string
  reason: string
}

export interface HealthResponse {
  status: string
  gpu: string | null
  sam3_loaded: boolean
  qwen_loaded: boolean
  prompt_assistant_available: boolean
  busy: boolean
}

export type CandidateFileKey = 'mask' | 'overlay' | 'cutout' | 'cutout_crop'

export interface CandidateMeta {
  id: number
  score: number
  /** [x1, y1, x2, y2] in original image pixels. */
  bbox_xyxy_px: [number, number, number, number]
  mask_area_px: number
  /** Relative file names inside result/ (cutout_crop absent when mask empty). */
  files: Partial<Record<CandidateFileKey, string>>
}

export interface SegmentMetadata {
  prompt: string
  mode: Mode
  /** Normalized [cx, cy, w, h] as sent, or null for text mode. */
  bbox_input: [number, number, number, number] | null
  /** [width, height] */
  image_size: [number, number]
  confidence_threshold: number
  crop_padding_px: number
  elapsed_ms: number
  num_candidates: number
  num_candidates_total?: number | null
  candidates: CandidateMeta[]
}

/** One candidate after ZIP parsing: object URLs + blobs for download. */
export interface CandidateAssets {
  meta: CandidateMeta
  urls: Partial<Record<CandidateFileKey, string>>
  blobs: Partial<Record<CandidateFileKey, Blob>>
}

export interface SegmentResult {
  metadata: SegmentMetadata
  candidates: CandidateAssets[]
  /** Raw ZIP for "download all". */
  zipBlob: Blob
  /** Revoke every object URL created for this result. */
  dispose: () => void
}

export interface SegmentRequest {
  image: Blob
  filename: string
  mode: Mode
  /** Required for text / text_box. */
  prompt?: string
  /** Normalized [cx, cy, w, h]; required for box / text_box. */
  bbox?: [number, number, number, number]
  confidenceThreshold?: number
}

export interface SuggestRequest {
  image: Blob
  filename: string
  userRequest: string
  scopePreference: ScopePreference
}

export interface ConnectionConfig {
  baseUrl: string
  token: string
  timeoutMs: number
}

/** Pixel rectangle in ORIGINAL (natural) image coordinates, x1<=x2, y1<=y2. */
export interface BoxXYXY {
  x1: number
  y1: number
  x2: number
  y2: number
}
