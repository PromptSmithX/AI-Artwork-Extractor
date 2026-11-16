import io
import json
import zipfile
from unittest.mock import MagicMock

import pytest
import requests
from PIL import Image
from server_reference.schemas import Mode, ScopePreference

from local_app.remote_client import (
    ApiError,
    AssistantUnavailable,
    AuthError,
    ClientConfig,
    Disconnected,
    RemoteClient,
    RemoteError,
    ServerBusy,
    load_config,
)


def make_fake_response(
    status_code: int = 200,
    json_data: dict | None = None,
    text: str = "",
    content: bytes = b"",
    headers: dict | None = None,
) -> requests.Response:
    resp = requests.Response()
    resp.status_code = status_code
    resp._content = (
        content
        if content
        else (json.dumps(json_data).encode("utf-8") if json_data is not None else text.encode("utf-8"))
    )
    if headers:
        resp.headers.update(headers)
    else:
        if json_data is not None:
            resp.headers["content-type"] = "application/json"
        elif "html" in text.lower():
            resp.headers["content-type"] = "text/html"
    return resp


def build_mock_zip(num_candidates: int = 1) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        candidates = []
        for i in range(num_candidates):
            prefix = f"candidate_{i:02d}"
            files = {
                "mask": f"{prefix}_mask.png",
                "overlay": f"{prefix}_overlay.png",
                "cutout": f"{prefix}_cutout.png",
                "cutout_crop": f"{prefix}_cutout_crop.png",
            }
            candidates.append(
                {
                    "id": i,
                    "score": 0.85 + 0.05 * i,
                    "bbox_xyxy_px": [10.0, 15.0, 80.0, 85.0],
                    "mask_area_px": 4900,
                    "files": files,
                }
            )
            # Create dummy images
            img_mask = Image.new("L", (100, 100), color=255)
            img_overlay = Image.new("RGB", (100, 100), color=(255, 0, 0))
            img_cutout = Image.new("RGBA", (100, 100), color=(0, 255, 0, 255))
            img_crop = Image.new("RGBA", (70, 70), color=(0, 0, 255, 255))

            for key, fname in files.items():
                img_buf = io.BytesIO()
                target_img = (
                    img_mask
                    if key == "mask"
                    else (
                        img_overlay
                        if key == "overlay"
                        else (img_cutout if key == "cutout" else img_crop)
                    )
                )
                target_img.save(img_buf, format="PNG")
                zf.writestr(f"result/{fname}", img_buf.getvalue())

        meta = {
            "prompt": "test patch",
            "mode": "text",
            "bbox_input": None,
            "image_size": [100, 100],
            "confidence_threshold": 0.35,
            "crop_padding_px": 12,
            "elapsed_ms": 320,
            "num_candidates": num_candidates,
            "candidates": candidates,
        }
        zf.writestr("result/metadata.json", json.dumps(meta))

    return buf.getvalue()


class TestRemoteClientAuthAndHeaders:
    def test_strip_trailing_slash(self):
        client = RemoteClient("https://colab.example.com///", "secret")
        assert client.base_url == "https://colab.example.com"

    def test_bearer_header_sent_on_suggest(self):
        mock_session = MagicMock()
        mock_session.post.return_value = make_fake_response(
            200,
            json_data={
                "target_description": "logo",
                "sam_prompt": "embroidered badge",
                "alternative_prompts": ["badge"],
                "reason": "clear text",
            },
        )
        client = RemoteClient("https://colab.example.com", "my-secret-token", session=mock_session)
        client.suggest_prompt(b"fake-bytes", "test.jpg", "tách logo", ScopePreference.AUTO)

        call_kwargs = mock_session.post.call_args[1]
        assert "Authorization" in call_kwargs["headers"]
        assert call_kwargs["headers"]["Authorization"] == "Bearer my-secret-token"
        assert "image" in call_kwargs["files"]
        assert call_kwargs["data"]["user_request"] == "tách logo"


class TestErrorMappings:
    def test_401_raises_auth_error(self):
        mock_session = MagicMock()
        mock_session.post.return_value = make_fake_response(
            401, json_data={"detail": "Invalid token"}
        )
        client = RemoteClient("https://colab.example.com", "wrong-token", session=mock_session)

        with pytest.raises(AuthError, match="Invalid token"):
            client.suggest_prompt(b"bytes", "img.png", "request")

    def test_409_raises_server_busy(self):
        mock_session = MagicMock()
        mock_session.post.return_value = make_fake_response(
            409, json_data={"detail": "busy"}
        )
        client = RemoteClient("https://colab.example.com", "token", session=mock_session)

        with pytest.raises(ServerBusy, match="busy"):
            client.segment(b"bytes", "img.png", Mode.TEXT, prompt="patch")

    def test_503_raises_assistant_unavailable(self):
        mock_session = MagicMock()
        mock_session.post.return_value = make_fake_response(
            503, json_data={"detail": "Assistant OOM"}
        )
        client = RemoteClient("https://colab.example.com", "token", session=mock_session)

        with pytest.raises(AssistantUnavailable, match="Assistant OOM"):
            client.suggest_prompt(b"bytes", "img.png", "request")

    def test_503_on_segment_raises_api_error(self):
        mock_session = MagicMock()
        mock_session.post.return_value = make_fake_response(
            503, json_data={"detail": "SAM 3 model not loaded"}
        )
        client = RemoteClient("https://colab.example.com", "token", session=mock_session)

        with pytest.raises(ApiError) as exc_info:
            client.segment(b"bytes", "img.png", Mode.TEXT, prompt="patch")
        assert exc_info.value.status_code == 503
        assert "SAM 3 model not loaded" in exc_info.value.detail

    def test_connection_error_raises_disconnected(self):
        mock_session = MagicMock()
        mock_session.get.side_effect = requests.exceptions.ConnectionError("Failed to reach host")
        client = RemoteClient("https://colab.example.com", "token", session=mock_session)

        with pytest.raises(Disconnected, match="Failed to reach"):
            client.health()

    def test_timeout_raises_disconnected(self):
        mock_session = MagicMock()
        mock_session.post.side_effect = requests.exceptions.Timeout("Read timeout")
        client = RemoteClient("https://colab.example.com", "token", session=mock_session)

        with pytest.raises(Disconnected, match="Read timeout"):
            client.segment(b"bytes", "img.png", Mode.TEXT, prompt="patch")

    def test_cloudflare_502_html_raises_disconnected(self):
        mock_session = MagicMock()
        mock_session.get.return_value = make_fake_response(
            502,
            text="<html><head><title>502 Bad Gateway</title></head><body>Cloudflare error</body></html>",
            headers={"content-type": "text/html; charset=UTF-8"},
        )
        client = RemoteClient("https://colab.example.com", "token", session=mock_session)

        with pytest.raises(Disconnected, match="Cloudflare tunnel error"):
            client.health()

    def test_cloudflare_530_raises_disconnected(self):
        mock_session = MagicMock()
        mock_session.post.return_value = make_fake_response(
            530,
            text="<!DOCTYPE html><html><body>Error 530 Cloudflare tunnel down</body></html>",
            headers={"content-type": "text/html"},
        )
        client = RemoteClient("https://colab.example.com", "token", session=mock_session)

        with pytest.raises(Disconnected, match="Cloudflare tunnel error"):
            client.segment(b"bytes", "img.png", Mode.TEXT, prompt="test")

    def test_server_502_json_raises_api_error(self):
        mock_session = MagicMock()
        mock_session.post.return_value = make_fake_response(
            502, json_data={"detail": "Model produced unparseable JSON"}
        )
        client = RemoteClient("https://colab.example.com", "token", session=mock_session)

        with pytest.raises(ApiError) as exc_info:
            client.suggest_prompt(b"bytes", "img.png", "request")
        assert exc_info.value.status_code == 502
        assert "unparseable JSON" in exc_info.value.detail


class TestSegmentResultParsing:
    def test_parse_valid_zip_with_candidates(self):
        zip_bytes = build_mock_zip(num_candidates=2)
        mock_session = MagicMock()
        mock_session.post.return_value = make_fake_response(
            200,
            content=zip_bytes,
            headers={"content-type": "application/zip"},
        )
        client = RemoteClient("https://colab.example.com", "token", session=mock_session)

        res = client.segment(
            b"fake_img",
            "input.jpg",
            mode=Mode.TEXT_BOX,
            prompt="flower",
            bbox=[0.5, 0.5, 0.2, 0.2],
            threshold=0.4,
        )

        assert res.zip_bytes == zip_bytes
        assert res.metadata.num_candidates == 2
        assert res.num_candidates == 2
        assert len(res.candidate_images) == 2

        # Check candidate 0 images
        cand0_imgs = res.candidate_images[0]
        assert "mask" in cand0_imgs
        assert "overlay" in cand0_imgs
        assert "cutout" in cand0_imgs
        assert "cutout_crop" in cand0_imgs
        assert isinstance(cand0_imgs["cutout"], Image.Image)

        # Helper method
        img_crop = res.get_candidate_image(0, "cutout_crop")
        assert img_crop is not None
        assert img_crop.size == (70, 70)

    def test_zero_candidates_in_zip(self):
        zip_bytes = build_mock_zip(num_candidates=0)
        mock_session = MagicMock()
        mock_session.post.return_value = make_fake_response(200, content=zip_bytes)
        client = RemoteClient("https://colab.example.com", "token", session=mock_session)

        res = client.segment(b"fake_img", "input.jpg", mode=Mode.TEXT, prompt="none")
        assert res.num_candidates == 0
        assert len(res.candidate_images) == 0

    def test_bad_zip_raises_api_error(self):
        mock_session = MagicMock()
        mock_session.post.return_value = make_fake_response(200, content=b"corrupt-data")
        client = RemoteClient("https://colab.example.com", "token", session=mock_session)

        with pytest.raises(ApiError, match="Malformed ZIP"):
            client.segment(b"fake_img", "input.jpg", mode=Mode.TEXT)


class TestConfigLoading:
    def test_config_env_vars(self, monkeypatch):
        monkeypatch.setenv("COLAB_API_URL", "https://custom.trycloudflare.com")
        monkeypatch.setenv("COLAB_API_TOKEN", "token-xyz")
        monkeypatch.setenv("REQUEST_TIMEOUT_SECONDS", "120")

        cfg = load_config()
        assert cfg.url == "https://custom.trycloudflare.com"
        assert cfg.token == "token-xyz"
        assert cfg.timeout == 120.0
        assert cfg["colab_api_url"] == "https://custom.trycloudflare.com"
        assert cfg.get("api_token") == "token-xyz"
