"""Run local reference server with deterministic fake engines.

Enables local development of UI and integration tests without GPU.
Usage:
  python -m server_reference.run_local_fake [--port 8000] [--token TOKEN]
"""
from __future__ import annotations

import argparse
import os
import secrets
import sys

import uvicorn

from server_reference.api import create_app
from server_reference.fake_engines import FakePromptAssistant, FakeSam3Engine


def main() -> None:
    """Parse arguments and start Uvicorn with fake engines."""
    parser = argparse.ArgumentParser(description="Run AI Artwork Extractor fake server locally")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default 8000)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to listen on (default 127.0.0.1)")
    parser.add_argument("--token", type=str, default=None, help="API bearer token (optional)")
    parser.add_argument(
        "--cors-origin",
        action="append",
        default=None,
        help="Allowed CORS origin (repeatable, defaults to http://localhost:5173 and http://127.0.0.1:5173)",
    )

    args = parser.parse_args()

    token = args.token or os.environ.get("API_TOKEN")
    if not token:
        token = secrets.token_urlsafe(32)
        print(f"\n[LOCAL DEV ONLY] Generated bearer token: {token}\n", flush=True)
    else:
        print("\n[LOCAL DEV ONLY] Using token from --token/API_TOKEN\n", flush=True)

    fake_sam = FakeSam3Engine(device="cpu")
    fake_assistant = FakePromptAssistant(available=True, loaded=True)

    cors_origins = (
        args.cors_origin
        if args.cors_origin is not None
        else ["http://localhost:5173", "http://127.0.0.1:5173"]
    )

    app = create_app(
        sam_engine=fake_sam,
        assistant=fake_assistant,
        api_token=token,
        cors_origins=cors_origins,
    )

    print(f"Starting server on http://{args.host}:{args.port}")
    print(f"Health check: http://{args.host}:{args.port}/health\n")
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
