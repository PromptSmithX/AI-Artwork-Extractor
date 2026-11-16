"""HTTP client for communicating with the Colab-hosted AI Artwork Extractor API.

Follows docs/API_CONTRACT.md and shared schemas from server_reference/schemas.py.
"""
from __future__ import annotations

import io
import json
import os
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import requests
from PIL import Image

# Ensure repo root is on sys.path for server_reference imports
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from server_reference.schemas import (  # noqa: E402
    HealthResponse,
    Mode,
    PromptSuggestion,
    ScopePreference,
    SegmentMetadata,
)


# --- Error Hierarchy ---


class RemoteError(Exception):
    """Base exception for all remote client failures."""


class Disconnected(RemoteError):
    """Raised when connection fails, times out, or Cloudflare tunnel is dead/error."""


class AuthError(RemoteError):
    """Raised on 401 Unauthorized (missing or invalid bearer token)."""


class ServerBusy(RemoteError):
    """Raised on 409 Conflict when Colab server is running another inference."""


class AssistantUnavailable(RemoteError):
    """Raised on 503 Service Unavailable specifically for Qwen prompt assistant."""


class ApiError(RemoteError):
    """Raised on other API errors (e.g. 400, 413, 422, 500, 502, or 503 on segment)."""

    def __init__(self, status_code: int, detail: str = ""):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"API Error {status_code}: {detail}")


# --- Data Structures ---


@dataclass
class SegmentResult:
    """Parsed output of POST /api/v1/segment."""

    zip_bytes: bytes
    metadata: SegmentMetadata
    candidate_images: List[Dict[str, Image.Image]] = field(default_factory=list)

    @property
    def images(self) -> List[Dict[str, Image.Image]]:
        return self.candidate_images

    @property
    def num_candidates(self) -> int:
        return self.metadata.num_candidates

    def get_candidate_image(
        self, candidate_idx: int, kind: str
    ) -> Optional[Image.Image]:
        if 0 <= candidate_idx < len(self.candidate_images):
            return self.candidate_images[candidate_idx].get(kind)
        return None


class ClientConfig:
    """Holds API connection settings loaded from environment or .env."""

    def __init__(
        self,
        url: str = "",
        token: str = "",
        timeout: float = 180.0,
    ):
        self.url = url
        self.token = token
        self.timeout = timeout

    @property
    def api_url(self) -> str:
        return self.url

    @property
    def api_token(self) -> str:
        return self.token

    def __getitem__(self, key: str) -> Any:
        key_lower = key.lower()
        if key_lower in ("url", "colab_api_url", "api_url"):
            return self.url
        if key_lower in ("token", "colab_api_token", "api_token"):
            return self.token
        if key_lower in ("timeout", "request_timeout_seconds"):
            return self.timeout
        raise KeyError(key)

    def get(self, key: str, default: Any = None) -> Any:
        try:
            return self[key]
        except KeyError:
            return default


def load_config() -> ClientConfig:
    """Read configuration from local_app/.env or fallback to repo-root .env.

    Returns:
        ClientConfig with url, token, and timeout.
    """
    try:
        from dotenv import load_dotenv

        local_env = Path(_REPO_ROOT) / "local_app" / ".env"
        root_env = Path(_REPO_ROOT) / ".env"

        if local_env.is_file():
            load_dotenv(local_env)
        elif root_env.is_file():
            load_dotenv(root_env)
    except ImportError:
        pass

    url = os.environ.get("COLAB_API_URL", "").strip()
    token = os.environ.get("COLAB_API_TOKEN", "").strip()
    timeout_raw = os.environ.get("REQUEST_TIMEOUT_SECONDS", "180").strip()

    try:
        timeout = float(timeout_raw)
    except ValueError:
        timeout = 180.0

    return ClientConfig(url=url, token=token, timeout=timeout)


# --- Remote Client ---


class RemoteClient:
    """HTTP client communicating with the Colab FastAPI endpoints."""

    def __init__(
        self,
        base_url: str = "",
        token: str = "",
        timeout: float = 180.0,
        session: Optional[requests.Session] = None,
    ):
        self.base_url = (base_url or "").rstrip("/")
        self.token = (token or "").strip()
        self.timeout = float(timeout)
        self._session = session or requests.Session()

    def _headers(self, require_auth: bool = True) -> Dict[str, str]:
        headers = {}
        if require_auth:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _extract_detail(self, response: requests.Response) -> str:
        try:
            data = response.json()
            if isinstance(data, dict) and "detail" in data:
                return str(data["detail"])
            return response.text
        except Exception:
            return response.text

    def _check_cloudflare(self, response: requests.Response) -> bool:
        """Detect Cloudflare 502/530 error HTML pages."""
        if response.status_code in (502, 530):
            content_type = response.headers.get("content-type", "").lower()
            if "text/html" in content_type:
                return True
            prefix = response.text[:500].lower()
            if "<!doctype html" in prefix or "<html" in prefix or "cloudflare" in prefix:
                return True
        return False

    def _handle_response(
        self, response: requests.Response, is_assistant: bool = False
    ) -> None:
        """Inspect status code and headers; raise appropriate RemoteError subclasses."""
        if self._check_cloudflare(response):
            raise Disconnected(
                f"Cloudflare tunnel error ({response.status_code}): "
                "Colab tunnel may be down or expired."
            )

        if response.status_code == 401:
            detail = self._extract_detail(response)
            raise AuthError(detail or "Unauthorized: invalid or missing API token.")

        if response.status_code == 409:
            detail = self._extract_detail(response)
            raise ServerBusy(detail or "Server is busy with another inference.")

        if response.status_code == 503:
            detail = self._extract_detail(response)
            if is_assistant:
                raise AssistantUnavailable(
                    detail or "Prompt assistant or model is currently unavailable."
                )
            # 503 on segment or health indicates SAM not loaded on Colab
            raise ApiError(
                503,
                detail or "SAM 3 model is not loaded or unavailable on Colab server.",
            )

        if response.status_code >= 400:
            detail = self._extract_detail(response)
            raise ApiError(response.status_code, detail)

    def health(self, timeout: Optional[float] = None) -> HealthResponse:
        """Check server health status (GET /health). No auth required."""
        url = f"{self.base_url}/health"
        t = self.timeout if timeout is None else timeout
        try:
            resp = self._session.get(url, timeout=t)
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            raise Disconnected(f"Failed to connect to {url}: {e}") from e
        except requests.exceptions.RequestException as e:
            raise Disconnected(f"Health request failed: {e}") from e

        self._handle_response(resp, is_assistant=False)
        try:
            return HealthResponse.model_validate(resp.json())
        except Exception as e:
            raise ApiError(resp.status_code, f"Invalid health response: {e}") from e

    def suggest_prompt(
        self,
        image_bytes: bytes,
        filename: str,
        user_request: str,
        scope_preference: Union[str, ScopePreference] = ScopePreference.AUTO,
        timeout: Optional[float] = None,
    ) -> PromptSuggestion:
        """Request prompt refinement from Qwen assistant (POST /api/v1/assistant/prompt)."""
        url = f"{self.base_url}/api/v1/assistant/prompt"
        t = self.timeout if timeout is None else timeout

        scope_val = (
            scope_preference.value
            if isinstance(scope_preference, ScopePreference)
            else str(scope_preference)
        )

        files = {
            "image": (
                filename,
                image_bytes,
                "image/png" if filename.lower().endswith(".png") else "image/jpeg",
            )
        }
        data = {
            "user_request": user_request,
            "scope_preference": scope_val,
        }
        headers = self._headers(require_auth=True)

        try:
            resp = self._session.post(
                url, headers=headers, files=files, data=data, timeout=t
            )
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            raise Disconnected(f"Connection failed during prompt suggestion: {e}") from e
        except requests.exceptions.RequestException as e:
            raise Disconnected(f"Prompt suggestion request failed: {e}") from e

        self._handle_response(resp, is_assistant=True)
        try:
            return PromptSuggestion.model_validate(resp.json())
        except Exception as e:
            raise ApiError(
                resp.status_code, f"Invalid prompt suggestion format: {e}"
            ) from e

    def segment(
        self,
        image_bytes: bytes,
        filename: str,
        mode: Union[str, Mode],
        prompt: Optional[str] = None,
        bbox: Optional[List[float]] = None,
        threshold: Optional[float] = None,
        timeout: Optional[float] = None,
    ) -> SegmentResult:
        """Run SAM 3 segmentation on Colab (POST /api/v1/segment).

        Returns:
            SegmentResult containing raw zip bytes, parsed metadata, and PIL candidate images.
        """
        url = f"{self.base_url}/api/v1/segment"
        t = self.timeout if timeout is None else timeout

        mode_val = mode.value if isinstance(mode, Mode) else str(mode)
        files = {
            "image": (
                filename,
                image_bytes,
                "image/png" if filename.lower().endswith(".png") else "image/jpeg",
            )
        }
        data: Dict[str, Any] = {"mode": mode_val}

        if prompt is not None:
            data["prompt"] = prompt
        if bbox is not None:
            data["bbox"] = json.dumps(bbox)
        if threshold is not None:
            data["confidence_threshold"] = str(threshold)

        headers = self._headers(require_auth=True)

        try:
            resp = self._session.post(
                url, headers=headers, files=files, data=data, timeout=t
            )
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            raise Disconnected(f"Connection failed during segmentation: {e}") from e
        except requests.exceptions.RequestException as e:
            raise Disconnected(f"Segmentation request failed: {e}") from e

        self._handle_response(resp, is_assistant=False)
        return self._parse_zip_response(resp.content)

    def _parse_zip_response(self, zip_bytes: bytes) -> SegmentResult:
        """Parse the binary result.zip returned by POST /api/v1/segment."""
        try:
            zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
        except zipfile.BadZipFile as e:
            raise ApiError(200, f"Malformed ZIP response: {e}") from e

        names = zf.namelist()
        meta_name = "result/metadata.json" if "result/metadata.json" in names else "metadata.json"
        if meta_name not in names:
            raise ApiError(200, "ZIP missing metadata.json")

        try:
            meta_bytes = zf.read(meta_name)
            metadata = SegmentMetadata.model_validate_json(meta_bytes.decode("utf-8"))
        except Exception as e:
            raise ApiError(200, f"Failed to parse SegmentMetadata from ZIP: {e}") from e

        candidate_images: List[Dict[str, Image.Image]] = []
        for cand in metadata.candidates:
            imgs: Dict[str, Image.Image] = {}
            for file_key, file_path in cand.files.items():
                target_path = (
                    f"result/{file_path}"
                    if f"result/{file_path}" in names
                    else file_path
                )
                if target_path in names:
                    raw_img = zf.read(target_path)
                    try:
                        imgs[file_key] = Image.open(io.BytesIO(raw_img)).copy()
                    except Exception:
                        pass
            candidate_images.append(imgs)

        return SegmentResult(
            zip_bytes=zip_bytes,
            metadata=metadata,
            candidate_images=candidate_images,
        )
