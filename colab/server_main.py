"""Colab server runner and helper utilities for AI Artwork Extractor.

Performs engine setup, app creation, background uvicorn server startup,
and Cloudflare Quick Tunnel exposure.
"""
from __future__ import annotations

import gc
import logging
import os
import re
import subprocess
import threading
import time
import urllib.request
from typing import Any, Optional, Tuple

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

    Cleans GPU cache before measuring VRAM and loading, so previous SAM inference
    does not cause spurious VRAM check failures.
    """
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass
    gc.collect()

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
    existing_proc: Optional[subprocess.Popen] = None,
) -> Tuple[subprocess.Popen, str]:
    """Download (if needed) and run cloudflared Quick Tunnel, returning process and URL.

    Re-run safe: cleanly terminates any existing_proc and its log handle.
    Keeps a reference to the opened log file on success (attached to proc.log_file)
    and closes the log file on failure to avoid leaking file descriptors.
    """
    if existing_proc is not None:
        stop_server_and_tunnel(tunnel_proc=existing_proc)

    if not os.path.exists(binary_path):
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
        logger.info("Downloading cloudflared from %s to %s", url, binary_path)
        try:
            urllib.request.urlretrieve(url, binary_path)
        except Exception as err:
            raise RuntimeError(f"Failed to download cloudflared binary from {url}: {err}") from err
        try:
            os.chmod(binary_path, 0o755)
        except Exception as err:
            raise RuntimeError(f"Failed to set executable permissions on {binary_path}: {err}") from err

    log_file = open(log_path, "w", encoding="utf-8")
    proc: Optional[subprocess.Popen] = None
    try:
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
                with open(log_path, "r", errors="ignore", encoding="utf-8") as f:
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
                with open(log_path, "r", errors="ignore", encoding="utf-8") as f:
                    tail = f.read()[-500:]
            raise RuntimeError(f"Failed to find Cloudflare tunnel URL within {timeout}s:\n{tail}")

        # Attach log file handle to process so it can be closed upon shutdown
        setattr(proc, "log_file", log_file)
        return proc, tunnel_url

    except Exception:
        if proc is not None:
            try:
                proc.terminate()
                proc.wait(timeout=2)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        if not log_file.closed:
            try:
                log_file.close()
            except Exception:
                pass
        raise


def stop_server_and_tunnel(
    server: Optional[Any] = None,
    tunnel_proc: Optional[subprocess.Popen] = None,
    thread: Optional[threading.Thread] = None,
    timeout: float = 10.0,
) -> None:
    """Terminate the cloudflared process, close its log file, signal uvicorn server to exit,
    and wait for the uvicorn background thread to join so port 8000 is freed for restart.
    """
    if tunnel_proc is not None:
        try:
            tunnel_proc.terminate()
            tunnel_proc.wait(timeout=5)
        except Exception:
            try:
                tunnel_proc.kill()
            except Exception:
                pass
        finally:
            log_file = getattr(tunnel_proc, "log_file", None)
            if log_file and not log_file.closed:
                try:
                    log_file.close()
                except Exception:
                    pass

    if server is not None:
        server.should_exit = True

    if thread is not None and thread.is_alive():
        thread.join(timeout=timeout)

    # Brief pause to ensure OS releases bound sockets
    if server is not None or thread is not None:
        time.sleep(0.5)
