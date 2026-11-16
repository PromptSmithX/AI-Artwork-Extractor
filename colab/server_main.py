"""Colab server runner and helper utilities for AI Artwork Extractor.

Performs engine setup, app creation, background uvicorn server startup,
and Cloudflare Quick Tunnel exposure.
"""
from __future__ import annotations

import logging
import os
import re
import secrets
import subprocess
import threading
import time
import urllib.request
from typing import Any, Optional, Tuple

from server_reference.api import create_app
from server_reference.schemas import Mode, ScopePreference

logger = logging.getLogger("colab.server_main")


def build_sam_engine(
    device: str = "cuda",
    confidence_threshold: float = 0.35,
) -> Any:
    """Build and load Sam3Engine onto target device.

    Imports sam3 lazily so CPU/non-GPU test environments can import server_main.
    """
    from server_reference.sam3_engine import Sam3Engine

    engine = Sam3Engine(device=device, confidence_threshold=confidence_threshold)
    engine.load()
    return engine


def build_assistant(
    model_id: str = "Qwen/Qwen3-VL-4B-Instruct",
    enabled: bool = True,
    min_free_vram_gb: float = 5.0,
    device: str = "cuda",
) -> Any:
    """Build and optionally load QwenPromptAssistant in 4-bit mode.

    If loading fails with PromptAssistantUnavailable, falls back cleanly
    so SAM 3 manual mode continues to function.
    """
    from server_reference.errors import PromptAssistantUnavailable
    from server_reference.qwen_prompt_assistant import QwenPromptAssistant

    assistant = QwenPromptAssistant(
        model_id=model_id,
        enabled=enabled,
        min_free_vram_gb=min_free_vram_gb,
        max_image_side=768,
        max_new_tokens=160,
        device=device,
    )
    if enabled:
        try:
            assistant.load()
        except PromptAssistantUnavailable as err:
            logger.warning("Prompt assistant unavailable: %s", err)
        except Exception as err:
            logger.warning("Unexpected error loading assistant: %s", err)
    return assistant


def start_uvicorn(
    app: Any,
    host: str = "127.0.0.1",
    port: int = 8000,
    timeout: float = 30.0,
) -> Tuple[Any, threading.Thread]:
    """Start uvicorn server in a daemon background thread and wait for /health response."""
    import requests
    import uvicorn

    config = uvicorn.Config(
        app=app,
        host=host,
        port=port,
        log_level="info",
        loop="asyncio",
    )
    server = uvicorn.Server(config=config)
    thread = threading.Thread(target=server.run, daemon=True, name="uvicorn-worker-thread")
    thread.start()

    health_url = f"http://{host}:{port}/health"
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            resp = requests.get(health_url, timeout=1.0)
            if resp.status_code == 200:
                logger.info("Local server answered at %s", health_url)
                return server, thread
        except Exception:
            pass
        time.sleep(0.5)

    raise RuntimeError(f"Timed out waiting for uvicorn server to start at {health_url}")


def parse_tunnel_url_from_text(text: str) -> Optional[str]:
    """Extract https://*.trycloudflare.com from log text."""
    pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
    match = pattern.search(text)
    return match.group(0) if match else None


def start_cloudflared(
    port: int = 8000,
    binary_path: str = "/content/cloudflared",
    log_path: str = "/content/cloudflared.log",
    timeout: float = 60.0,
) -> Tuple[subprocess.Popen, str]:
    """Download (if needed) and run cloudflared Quick Tunnel, returning process and URL."""
    if not os.path.exists(binary_path):
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
        logger.info("Downloading cloudflared from %s to %s", url, binary_path)
        urllib.request.urlretrieve(url, binary_path)
        os.chmod(binary_path, 0o755)

    log_file = open(log_path, "w")
    proc = subprocess.Popen(
        [binary_path, "tunnel", "--url", f"http://127.0.0.1:{port}", "--no-autoupdate"],
        stdout=log_file,
        stderr=subprocess.STDOUT,
        text=True,
    )

    start_time = time.time()
    tunnel_url = None

    while time.time() - start_time < timeout:
        if os.path.exists(log_path):
            with open(log_path, "r", errors="ignore") as f:
                content = f.read()
                tunnel_url = parse_tunnel_url_from_text(content)
                if tunnel_url:
                    break
        if proc.poll() is not None:
            raise RuntimeError(f"cloudflared exited unexpectedly with code {proc.returncode}")
        time.sleep(1.0)

    if not tunnel_url:
        tail = ""
        if os.path.exists(log_path):
            with open(log_path, "r", errors="ignore") as f:
                tail = f.read()[-500:]
        raise RuntimeError(f"Failed to find Cloudflare tunnel URL within {timeout}s:\n{tail}")

    return proc, tunnel_url


def stop_server_and_tunnel(
    server: Optional[Any] = None,
    tunnel_proc: Optional[subprocess.Popen] = None,
) -> None:
    """Terminate the cloudflared process and signal uvicorn server to exit."""
    if tunnel_proc is not None:
        try:
            tunnel_proc.terminate()
            tunnel_proc.wait(timeout=5)
        except Exception:
            try:
                tunnel_proc.kill()
            except Exception:
                pass

    if server is not None:
        server.should_exit = True
