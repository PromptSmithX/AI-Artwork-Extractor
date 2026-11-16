import ast
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from server_reference.schemas import HealthResponse

from local_app.app import check_health, get_client, init_session_state
from local_app.remote_client import Disconnected


def test_app_ast_parse():
    app_path = Path(__file__).resolve().parent.parent.parent / "local_app" / "app.py"
    content = app_path.read_text(encoding="utf-8")
    parsed = ast.parse(content)
    assert isinstance(parsed, ast.Module)


def test_init_session_state(monkeypatch):
    import streamlit as st

    # Clear session state for test isolation
    for key in list(st.session_state.keys()):
        del st.session_state[key]

    init_session_state()

    assert "config" in st.session_state
    assert "api_url" in st.session_state
    assert "confidence_threshold" in st.session_state
    assert st.session_state.confidence_threshold == 0.35
    assert st.session_state.uploaded_image_bytes is None


def test_get_client_configuration():
    import streamlit as st

    st.session_state.api_url = "https://custom-colab.example.com"
    st.session_state.api_token = "tok_123"

    client = get_client()
    assert client.base_url == "https://custom-colab.example.com"
    assert client.token == "tok_123"


def test_check_health_connected():
    import streamlit as st

    init_session_state()
    mock_health = HealthResponse(
        status="ok",
        gpu="NVIDIA A100",
        sam3_loaded=True,
        qwen_loaded=True,
        prompt_assistant_available=True,
        busy=False,
    )

    with patch.object(
        st.session_state.config, "timeout", 10.0
    ), patch("local_app.app.get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.health.return_value = mock_health
        mock_get_client.return_value = mock_client

        check_health()

        hs = st.session_state.health_status
        assert hs is not None
        assert hs["connected"] is True
        assert hs["gpu"] == "NVIDIA A100"
        assert hs["sam3_loaded"] is True
        assert hs["qwen_loaded"] is True


def test_check_health_disconnected():
    import streamlit as st

    init_session_state()

    with patch("local_app.app.get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.health.side_effect = Disconnected("Tunnel offline")
        mock_get_client.return_value = mock_client

        check_health()

        hs = st.session_state.health_status
        assert hs is not None
        assert hs["connected"] is False
        assert "Tunnel offline" in hs["message"]
