# API & Module Contract — AI Artwork Extractor MVP

Single source of truth for every worker. Background/rationale: `AI_Artwork_Extractor_MVP_Project_Plan.md`.
Shared Pydantic models live in `server_reference/schemas.py` (do not edit without coordinator approval).

## 1. HTTP API (FastAPI in Colab, exposed via Cloudflare Quick Tunnel)

Base URL = `COLAB_API_URL` (e.g. `https://xxxx.trycloudflare.com`). JSON errors always `{"detail": "<message>"}`.

Auth: every endpoint except `GET /health` requires header `Authorization: Bearer <token>`.
Missing/wrong token → **401**. Token is never accepted via query string.

### `GET /health` (no auth)
Response `HealthResponse`:
```json
{"status":"ok","gpu":"Tesla T4","sam3_loaded":true,"qwen_loaded":false,"prompt_assistant_available":true,"busy":false}
```

### `POST /api/v1/assistant/prompt` (multipart/form-data)
| field | type | required | notes |
|---|---|---|---|
| image | file | yes | JPG/JPEG/PNG/WebP |
| user_request | str | yes | usually Vietnamese, non-empty, ≤ 1000 chars |
| scope_preference | str | no | `auto` (default) \| `entire_patch` \| `inner_artwork` \| `individual_decoration` |

200 → `PromptSuggestion` JSON (plan §4.4). 503 → assistant unavailable (not loaded / OOM / disabled);
502 → model produced invalid JSON after one retry. Never runs SAM.

### `POST /api/v1/segment` (multipart/form-data)
| field | type | required | notes |
|---|---|---|---|
| image | file | yes | original image |
| mode | str | yes | `text` \| `box` \| `text_box` |
| prompt | str | text/text_box | user-confirmed prompt; ignored for `box` |
| bbox | str (JSON) | box/text_box | `[cx, cy, w, h]` normalized 0–1, w,h > 0 |
| confidence_threshold | float | no | default = server `DEFAULT_CONFIDENCE_THRESHOLD` (0.35), range (0,1] |

200 → `application/zip` (`Content-Disposition: attachment; filename="result.zip"`).
Zero candidates is still 200 with `num_candidates: 0` (UI shows "no candidate").

### Status codes
| code | when |
|---|---|
| 401 | missing/invalid bearer token |
| 409 | another inference is running (`{"detail":"busy"}`) — server does not queue |
| 413 | upload > `MAX_UPLOAD_MB` (default 20) |
| 415 | file is not a decodable image of allowed format |
| 422 | bad/missing mode, prompt, bbox, threshold, scope |
| 502 | assistant returned unparseable output |
| 503 | assistant unavailable / SAM not loaded |
| 500 | unexpected inference error (message must not include image data or tokens) |

## 2. ZIP layout (segment response)
```
result/
  metadata.json                 # SegmentMetadata
  candidate_00_mask.png         # L mode, 0/255, original image size
  candidate_00_overlay.png      # RGB, original + colored mask (review only)
  candidate_00_cutout.png       # RGBA full canvas, RGB = original pixels, alpha = orig_alpha*mask
  candidate_00_cutout_crop.png  # RGBA crop to mask bbox + crop_padding_px (absent if mask empty)
  candidate_01_...
```
Candidate ids are 0-based, ordered by score descending. `metadata.json` example:
```json
{"prompt":"square embroidered fabric patch","mode":"text_box","bbox_input":[0.5,0.4,0.3,0.25],
 "image_size":[1200,900],"confidence_threshold":0.35,"crop_padding_px":12,"elapsed_ms":2310,
 "num_candidates":1,
 "candidates":[{"id":0,"score":0.91,"bbox_xyxy_px":[410.0,250.0,780.0,560.0],"mask_area_px":90210,
   "files":{"mask":"candidate_00_mask.png","overlay":"candidate_00_overlay.png",
            "cutout":"candidate_00_cutout.png","cutout_crop":"candidate_00_cutout_crop.png"}}]}
```

## 3. Python module interfaces (server_reference/)

```python
# sam3_engine.py
@dataclass
class SegResult:
    masks: np.ndarray        # bool [N, H, W] at ORIGINAL image size
    boxes_xyxy: np.ndarray   # float32 [N, 4] pixel coords
    scores: np.ndarray       # float32 [N]

class Sam3Engine:
    def __init__(self, device: str = "cuda", confidence_threshold: float = 0.35): ...
    def load(self) -> None                       # build_sam3_image_model + Sam3Processor (lazy import sam3)
    @property
    def loaded(self) -> bool
    def segment(self, image: PIL.Image.Image, mode: Mode, prompt: str | None,
                bbox_cxcywh_norm: list[float] | None, threshold: float | None = None) -> SegResult
    # fresh state per call: set_image -> (set_text_prompt) -> (add_geometric_prompt); FP16 autocast on CUDA

# qwen_prompt_assistant.py
class PromptAssistantUnavailable(RuntimeError): ...
class PromptAssistantOutputError(RuntimeError): ...
class QwenPromptAssistant:
    def __init__(self, model_id="Qwen/Qwen3-VL-4B-Instruct", enabled=True,
                 min_free_vram_gb=5.0, max_image_side=768, max_new_tokens=160): ...
    available: bool   # enabled and not disabled by OOM/load failure
    loaded: bool
    def load(self) -> None                       # 4-bit NF4; raises PromptAssistantUnavailable
    def unload(self) -> None
    def suggest(self, image, user_request: str, scope_preference: ScopePreference) -> PromptSuggestion
    # lazy-loads on first call; JSON parse + 1 retry -> PromptAssistantOutputError; OOM -> unload, available=False, PromptAssistantUnavailable

# image_export.py
def build_result_zip(image: PIL.Image.Image, result: SegResult, *, prompt: str, mode: Mode,
                     bbox_input: list[float] | None, threshold: float, elapsed_ms: int,
                     crop_padding_px: int = 12) -> bytes

# fake_engines.py   (no GPU, deterministic; used by tests and run_local_fake.py)
class FakeSam3Engine        # same interface as Sam3Engine
class FakePromptAssistant   # same interface as QwenPromptAssistant

# api.py
def create_app(sam_engine, assistant, api_token: str, max_upload_mb: int = 20,
               default_threshold: float = 0.35) -> FastAPI
```

## 4. Local app expectations (local_app/)
- Config from `.env`: `COLAB_API_URL`, `COLAB_API_TOKEN`, `REQUEST_TIMEOUT_SECONDS` (default 180); editable in UI sidebar.
- Box from canvas → original pixel xyxy → normalized `[cx, cy, w, h]` clamped to [0,1].
- Never auto-run SAM after Qwen, never auto-pick a candidate.
