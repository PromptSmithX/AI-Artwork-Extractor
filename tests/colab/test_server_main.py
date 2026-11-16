"""Unit tests for colab/server_main.py helper functions.

Tests run on CPU without requiring GPU, torch, or external network access.
"""
from __future__ import annotations

import subprocess
import threading
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from colab.server_main import (
    build_assistant,
    parse_tunnel_url_from_text,
    stop_server_and_tunnel,
)
from server_reference.errors import PromptAssistantUnavailable


def test_parse_tunnel_url_from_text() -> None:
    """Test extracting https://*.trycloudflare.com from log text."""
    sample_log = (
        "2026-11-16T08:00:00Z INF Starting tunnel\n"
        "2026-11-16T08:00:02Z INF Your quick Tunnel has been created! Visit it at "
        "https://random-word-subdomain.trycloudflare.com\n"
        "2026-11-16T08:00:03Z INF Registered tunnel connection"
    )
    url = parse_tunnel_url_from_text(sample_log)
    assert url == "https://random-word-subdomain.trycloudflare.com"

    # No match case
    assert parse_tunnel_url_from_text("no tunnel url here") is None
    assert parse_tunnel_url_from_text("") is None


def test_stop_server_and_tunnel_with_none() -> None:
    """stop_server_and_tunnel should not raise when arguments are None."""
    stop_server_and_tunnel(server=None, tunnel_proc=None)


def test_stop_server_and_tunnel_terminates_proc_and_signals_server() -> None:
    """Verify tunnel proc is terminated and server.should_exit is set to True."""
    mock_proc = MagicMock(spec=subprocess.Popen)
    mock_server = MagicMock()
    mock_server.should_exit = False

    stop_server_and_tunnel(server=mock_server, tunnel_proc=mock_proc)

    mock_proc.terminate.assert_called_once()
    mock_proc.wait.assert_called_once_with(timeout=5)
    assert mock_server.should_exit is True


def test_stop_server_and_tunnel_kills_on_timeout() -> None:
    """If process does not terminate within timeout, kill should be called."""
    mock_proc = MagicMock(spec=subprocess.Popen)
    mock_proc.wait.side_effect = subprocess.TimeoutExpired(cmd="tunnel", timeout=5)

    stop_server_and_tunnel(server=None, tunnel_proc=mock_proc)

    mock_proc.terminate.assert_called_once()
    mock_proc.kill.assert_called_once()


def test_build_assistant_disabled() -> None:
    """When enabled=False, assistant should not call load()."""
    with patch("server_reference.qwen_prompt_assistant.QwenPromptAssistant.load") as mock_load:
        assistant = build_assistant(enabled=False)
        assert assistant.enabled is False
        mock_load.assert_not_called()


def test_build_assistant_handles_unavailable_gracefully() -> None:
    """When assistant.load() raises PromptAssistantUnavailable, function does not crash."""
    with patch("server_reference.qwen_prompt_assistant.QwenPromptAssistant.load") as mock_load:
        mock_load.side_effect = PromptAssistantUnavailable("Insufficient VRAM on device")
        assistant = build_assistant(enabled=True)
        assert assistant is not None
        mock_load.assert_called_once()
