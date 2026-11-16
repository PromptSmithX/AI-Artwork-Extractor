"""Integration tests for reference server FastAPI application.

Uses TestClient with fake engines to test endpoints, auth, validation,
and status codes per API contract §1 and project plan §7.
"""
from __future__ import annotations

import io
import json
import zipfile

from fastapi.testclient import TestClient
import numpy as np
from PIL import Image
import pytest

from server_reference.api import create_app
from server_reference.fake_engines import FakePromptAssistant, FakeSam3Engine
from server_reference.schemas import HealthResponse, Mode, PromptSuggestion, SegmentMetadata

TEST_TOKEN = "test-secret-token-12345"


def _make_image_bytes(fmt: str = "PNG", size: tuple[int, int] = (64, 64), mode: str = "RGB") -> bytes:
    """Generate in-memory image bytes."""
    arr = np.zeros((size[1], size[0], 3 if mode == "RGB" else 4), dtype=np.uint8)
    arr[:, :, 0] = 100
    arr[:, :, 1] = 150
    arr[:, :, 2] = 200
    if mode == "RGBA":
        arr[:, :, 3] = 255
    img = Image.fromarray(arr, mode=mode)
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture
def fake_sam() -> FakeSam3Engine:
    return FakeSam3Engine(device="cpu")


@pytest.fixture
def fake_assistant() -> FakePromptAssistant:
    return FakePromptAssistant(available=True, loaded=True)


@pytest.fixture
def client(fake_sam: FakeSam3Engine, fake_assistant: FakePromptAssistant) -> TestClient:
    app = create_app(
        sam_engine=fake_sam,
        assistant=fake_assistant,
        api_token=TEST_TOKEN,
        max_upload_mb=2,
    )
    return TestClient(app)


def test_health_without_auth(client: TestClient):
    """GET /health must be accessible without authorization and report correct status."""
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    health = HealthResponse.model_validate(data)
    assert health.status == "ok"
    assert health.sam3_loaded is True
    assert health.prompt_assistant_available is True
    assert health.busy is False


def test_auth_missing_or_wrong_token(client: TestClient):
    """Missing or incorrect Bearer token on POST endpoints returns 401."""
    img_bytes = _make_image_bytes("PNG")

    # 1. assistant/prompt without auth
    resp = client.post(
        "/api/v1/assistant/prompt",
        data={"user_request": "tách logo mũ"},
        files={"image": ("cap.png", img_bytes, "image/png")},
    )
    assert resp.status_code == 401

    # 2. assistant/prompt with wrong token
    resp = client.post(
        "/api/v1/assistant/prompt",
        headers={"Authorization": "Bearer wrong-token"},
        data={"user_request": "tách logo mũ"},
        files={"image": ("cap.png", img_bytes, "image/png")},
    )
    assert resp.status_code == 401

    # 3. segment without auth
    resp = client.post(
        "/api/v1/segment",
        data={"mode": "text", "prompt": "patch"},
        files={"image": ("cap.png", img_bytes, "image/png")},
    )
    assert resp.status_code == 401

    # 4. segment with wrong token
    resp = client.post(
        "/api/v1/segment",
        headers={"Authorization": "Bearer wrong-token"},
        data={"mode": "text", "prompt": "patch"},
        files={"image": ("cap.png", img_bytes, "image/png")},
    )
    assert resp.status_code == 401


def test_segment_modes_success(client: TestClient):
    """Verify text, box, and text_box modes all return 200 application/zip."""
    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
    img_bytes = _make_image_bytes("PNG", size=(80, 80))

    # 1. Mode TEXT
    resp_text = client.post(
        "/api/v1/segment",
        headers=headers,
        data={"mode": "text", "prompt": "embroidered patch"},
        files={"image": ("cap.png", img_bytes, "image/png")},
    )
    assert resp_text.status_code == 200
    assert resp_text.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(resp_text.content), "r") as zf:
        meta = SegmentMetadata.model_validate_json(zf.read("result/metadata.json"))
        assert meta.mode == Mode.TEXT
        assert meta.prompt == "embroidered patch"
        assert meta.num_candidates == 2

    # 2. Mode BOX
    resp_box = client.post(
        "/api/v1/segment",
        headers=headers,
        data={"mode": "box", "bbox": json.dumps([0.5, 0.5, 0.4, 0.4])},
        files={"image": ("cap.png", img_bytes, "image/png")},
    )
    assert resp_box.status_code == 200
    with zipfile.ZipFile(io.BytesIO(resp_box.content), "r") as zf:
        meta = SegmentMetadata.model_validate_json(zf.read("result/metadata.json"))
        assert meta.mode == Mode.BOX
        assert meta.bbox_input == [0.5, 0.5, 0.4, 0.4]
        assert meta.num_candidates == 1

    # 3. Mode TEXT_BOX
    resp_text_box = client.post(
        "/api/v1/segment",
        headers=headers,
        data={
            "mode": "text_box",
            "prompt": "front patch",
            "bbox": json.dumps([0.4, 0.4, 0.3, 0.3]),
            "confidence_threshold": 0.4,
        },
        files={"image": ("cap.png", img_bytes, "image/png")},
    )
    assert resp_text_box.status_code == 200
    with zipfile.ZipFile(io.BytesIO(resp_text_box.content), "r") as zf:
        meta = SegmentMetadata.model_validate_json(zf.read("result/metadata.json"))
        assert meta.mode == Mode.TEXT_BOX
        assert meta.confidence_threshold == 0.4
        assert meta.num_candidates == 1


def test_segment_box_without_bbox_422(client: TestClient):
    """Box and text_box mode without bbox must return 422."""
    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
    img_bytes = _make_image_bytes("PNG")

    # box mode missing bbox
    resp = client.post(
        "/api/v1/segment",
        headers=headers,
        data={"mode": "box"},
        files={"image": ("cap.png", img_bytes, "image/png")},
    )
    assert resp.status_code == 422

    # text_box mode missing bbox
    resp = client.post(
        "/api/v1/segment",
        headers=headers,
        data={"mode": "text_box", "prompt": "patch"},
        files={"image": ("cap.png", img_bytes, "image/png")},
    )
    assert resp.status_code == 422


def test_segment_bad_bbox_422(client: TestClient):
    """Malformed or out-of-range bbox inputs return 422."""
    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
    img_bytes = _make_image_bytes("PNG")

    bad_boxes = [
        "not-a-json",
        "[0.5, 0.5, 0.5]",  # 3 elements instead of 4
        "[0.5, 0.5, 0.5, 0.5, 0.5]",  # 5 elements
        "[1.5, 0.5, 0.2, 0.2]",  # cx > 1
        "[-0.1, 0.5, 0.2, 0.2]",  # cx < 0
        "[0.5, 0.5, 0.0, 0.2]",  # w <= 0
        "[0.5, 0.5, -0.2, 0.2]",  # w < 0
        "[0.5, 0.5, 1.2, 0.2]",  # w > 1
        '["a", "b", "c", "d"]',  # non-numeric
    ]

    for bad in bad_boxes:
        resp = client.post(
            "/api/v1/segment",
            headers=headers,
            data={"mode": "box", "bbox": bad},
            files={"image": ("cap.png", img_bytes, "image/png")},
        )
        assert resp.status_code == 422, f"Expected 422 for bad bbox: {bad}"


def test_segment_text_without_prompt_422(client: TestClient):
    """Text and text_box modes without non-empty prompt return 422."""
    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
    img_bytes = _make_image_bytes("PNG")

    # text mode without prompt
    resp = client.post(
        "/api/v1/segment",
        headers=headers,
        data={"mode": "text"},
        files={"image": ("cap.png", img_bytes, "image/png")},
    )
    assert resp.status_code == 422

    # text mode with empty whitespace prompt
    resp = client.post(
        "/api/v1/segment",
        headers=headers,
        data={"mode": "text", "prompt": "   "},
        files={"image": ("cap.png", img_bytes, "image/png")},
    )
    assert resp.status_code == 422

    # text_box mode with empty prompt
    resp = client.post(
        "/api/v1/segment",
        headers=headers,
        data={"mode": "text_box", "prompt": "", "bbox": json.dumps([0.5, 0.5, 0.2, 0.2])},
        files={"image": ("cap.png", img_bytes, "image/png")},
    )
    assert resp.status_code == 422


def test_segment_non_image_415(client: TestClient):
    """Uploading non-image or unsupported format returns 415."""
    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}

    # 1. Plain text file
    resp = client.post(
        "/api/v1/segment",
        headers=headers,
        data={"mode": "text", "prompt": "patch"},
        files={"image": ("not_an_image.txt", b"hello world this is text", "text/plain")},
    )
    assert resp.status_code == 415

    # 2. Unsupported format (e.g. BMP)
    bmp_buf = io.BytesIO()
    Image.new("RGB", (10, 10)).save(bmp_buf, format="BMP")
    resp_bmp = client.post(
        "/api/v1/segment",
        headers=headers,
        data={"mode": "text", "prompt": "patch"},
        files={"image": ("test.bmp", bmp_buf.getvalue(), "image/bmp")},
    )
    assert resp_bmp.status_code == 415


def test_segment_oversize_413(fake_sam: FakeSam3Engine, fake_assistant: FakePromptAssistant):
    """Uploading file larger than max_upload_mb returns 413."""
    # App configured with very small upload limit: 1MB
    app = create_app(
        sam_engine=fake_sam,
        assistant=fake_assistant,
        api_token=TEST_TOKEN,
        max_upload_mb=1,
    )
    small_client = TestClient(app)
    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}

    # Generate noise image larger than 1MB (noise cannot be compressed by PNG)
    rng = np.random.RandomState(42)
    noise_arr = rng.randint(0, 256, (800, 800, 3), dtype=np.uint8)
    buf = io.BytesIO()
    Image.fromarray(noise_arr).save(buf, format="PNG")
    large_img = buf.getvalue()
    assert len(large_img) > 1 * 1024 * 1024

    resp = small_client.post(
        "/api/v1/segment",
        headers=headers,
        data={"mode": "text", "prompt": "patch"},
        files={"image": ("large.png", large_img, "image/png")},
    )
    assert resp.status_code == 413


def test_busy_concurrency_409(client: TestClient):
    """Holding the global inference lock causes requests to return 409 busy and health reports busy."""
    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
    img_bytes = _make_image_bytes("PNG")

    lock = client.app.state.lock
    acquired = lock.acquire(blocking=False)
    assert acquired is True

    try:
        # /health must report busy = True
        h_resp = client.get("/health")
        assert h_resp.status_code == 200
        assert h_resp.json()["busy"] is True

        # POST /api/v1/segment must return 409 {"detail": "busy"}
        seg_resp = client.post(
            "/api/v1/segment",
            headers=headers,
            data={"mode": "text", "prompt": "patch"},
            files={"image": ("cap.png", img_bytes, "image/png")},
        )
        assert seg_resp.status_code == 409
        assert seg_resp.json() == {"detail": "busy"}

        # POST /api/v1/assistant/prompt must return 409 {"detail": "busy"}
        asst_resp = client.post(
            "/api/v1/assistant/prompt",
            headers=headers,
            data={"user_request": "tách patch"},
            files={"image": ("cap.png", img_bytes, "image/png")},
        )
        assert asst_resp.status_code == 409
        assert asst_resp.json() == {"detail": "busy"}
    finally:
        lock.release()

    # After releasing lock, health reports busy = False and request succeeds
    h_resp2 = client.get("/health")
    assert h_resp2.json()["busy"] is False

    seg_ok = client.post(
        "/api/v1/segment",
        headers=headers,
        data={"mode": "text", "prompt": "patch"},
        files={"image": ("cap.png", img_bytes, "image/png")},
    )
    assert seg_ok.status_code == 200


def test_assistant_endpoints(fake_sam: FakeSam3Engine):
    """Test assistant ok, 503 unavailable, 502 bad output, and validation errors."""
    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
    img_bytes = _make_image_bytes("JPEG")

    # 1. Assistant OK
    asst_ok = FakePromptAssistant(available=True, loaded=True)
    app_ok = create_app(sam_engine=fake_sam, assistant=asst_ok, api_token=TEST_TOKEN)
    client_ok = TestClient(app_ok)

    resp = client_ok.post(
        "/api/v1/assistant/prompt",
        headers=headers,
        data={"user_request": "Tách phần huy hiệu thêu phía trước", "scope_preference": "auto"},
        files={"image": ("cap.jpg", img_bytes, "image/jpeg")},
    )
    assert resp.status_code == 200
    suggestion = PromptSuggestion.model_validate(resp.json())
    assert suggestion.sam_prompt != ""
    assert len(suggestion.alternative_prompts) > 0

    # 2. Assistant not available -> 503
    asst_unavail = FakePromptAssistant(available=False)
    app_unavail = create_app(sam_engine=fake_sam, assistant=asst_unavail, api_token=TEST_TOKEN)
    client_unavail = TestClient(app_unavail)

    resp_503 = client_unavail.post(
        "/api/v1/assistant/prompt",
        headers=headers,
        data={"user_request": "Tách huy hiệu"},
        files={"image": ("cap.jpg", img_bytes, "image/jpeg")},
    )
    assert resp_503.status_code == 503

    # Assistant is None -> 503
    app_no_asst = create_app(sam_engine=fake_sam, assistant=None, api_token=TEST_TOKEN)
    client_no_asst = TestClient(app_no_asst)
    resp_none = client_no_asst.post(
        "/api/v1/assistant/prompt",
        headers=headers,
        data={"user_request": "Tách huy hiệu"},
        files={"image": ("cap.jpg", img_bytes, "image/jpeg")},
    )
    assert resp_none.status_code == 503

    # 3. Assistant output error -> 502
    asst_bad_out = FakePromptAssistant(available=True, loaded=True, raise_output_error=True)
    app_bad = create_app(sam_engine=fake_sam, assistant=asst_bad_out, api_token=TEST_TOKEN)
    client_bad = TestClient(app_bad)

    resp_502 = client_bad.post(
        "/api/v1/assistant/prompt",
        headers=headers,
        data={"user_request": "Tách huy hiệu"},
        files={"image": ("cap.jpg", img_bytes, "image/jpeg")},
    )
    assert resp_502.status_code == 502

    # 4. user_request validation (empty -> 422, >1000 chars -> 422)
    resp_empty_req = client_ok.post(
        "/api/v1/assistant/prompt",
        headers=headers,
        data={"user_request": "   "},
        files={"image": ("cap.jpg", img_bytes, "image/jpeg")},
    )
    assert resp_empty_req.status_code == 422

    resp_long_req = client_ok.post(
        "/api/v1/assistant/prompt",
        headers=headers,
        data={"user_request": "a" * 1001},
        files={"image": ("cap.jpg", img_bytes, "image/jpeg")},
    )
    assert resp_long_req.status_code == 422


def test_segment_zero_candidates(client: TestClient):
    """When engine returns 0 candidates, segment returns 200 with num_candidates 0."""
    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
    img_bytes = _make_image_bytes("PNG")

    resp = client.post(
        "/api/v1/segment",
        headers=headers,
        data={"mode": "text", "prompt": "nothing"},
        files={"image": ("cap.png", img_bytes, "image/png")},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"

    with zipfile.ZipFile(io.BytesIO(resp.content), "r") as zf:
        meta = SegmentMetadata.model_validate_json(zf.read("result/metadata.json"))
        assert meta.num_candidates == 0
        assert meta.candidates == []


def test_sam3_engine_not_loaded_503(fake_assistant: FakePromptAssistant):
    """When SAM 3 engine is not loaded, segment returns 503."""
    unloaded_sam = FakeSam3Engine()
    unloaded_sam.loaded = False

    app = create_app(sam_engine=unloaded_sam, assistant=fake_assistant, api_token=TEST_TOKEN)
    client = TestClient(app)

    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
    img_bytes = _make_image_bytes("PNG")

    resp = client.post(
        "/api/v1/segment",
        headers=headers,
        data={"mode": "text", "prompt": "patch"},
        files={"image": ("cap.png", img_bytes, "image/png")},
    )
    assert resp.status_code == 503
