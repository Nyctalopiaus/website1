"""
Passenger/LiteSpeed (WSGI) entry point for cPanel's "Setup Python App".

FastAPI/backend.main:app is an ASGI app; the app server here only speaks WSGI.

This originally used the `a2wsgi` package's ASGIMiddleware to bridge ASGI-under-WSGI,
but on this host that bridge hung indefinitely on every request (worker process alive,
near-zero CPU, no response, no error) - almost certainly a deadlock in a2wsgi's internal
background event-loop thread under this specific app-server/venv combination.

Diagnosed by calling the FastAPI app directly in-process with Starlette's own
`TestClient` (which FastAPI/Starlette ship and use for their own test suite - it
bridges sync WSGI-style calls to the async ASGI app via anyio's blocking portal).
That returned correctly in ~10ms, proving the app itself, its imports, and its routes
are all fine - only the WSGI bridge was broken. So instead of a2wsgi, this file uses
that same already-proven TestClient mechanism as the bridge itself.

It also normalizes PATH_INFO defensively: different cPanel/CloudLinux/LiteSpeed
Passenger-style setups are inconsistent about whether the Application URL prefix
(here, /hf-model-matcher/api) has already been stripped from PATH_INFO by the time
it reaches this app, or is passed through unstripped. This handles both cases so
backend/main.py's existing "/api/..." routes work without guessing which behavior
this specific server uses.

Place this file directly in the Application root (the folder cPanel creates for
this app), alongside the backend/ folder (main.py, engine.py, hardware.py,
hf_client.py, requirements.txt) copied in as-is.
"""
import sys
import os

# Make the application root importable as the `backend` package.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from starlette.testclient import TestClient
from backend.main import app as fastapi_app

# Created once per worker process and reused across requests. TestClient wraps
# httpx + anyio's blocking portal, which spins up its own background event loop
# thread once and keeps it alive for the life of this object - so this must stay
# a module-level singleton, not be recreated per-request.
_client = TestClient(fastapi_app, base_url="http://testserver")

# Must match the path portion of "Application URL" set in cPanel exactly.
MOUNT_PREFIX = "/hf-model-matcher/api"


def _normalize_path(path):
    if path.startswith(MOUNT_PREFIX):
        # App server passed the full original URL through unstripped.
        path = path[len(MOUNT_PREFIX):] or "/"
        if not path.startswith("/api"):
            path = "/api" + path
    elif not path.startswith("/api"):
        # App server already stripped SCRIPT_NAME down to the route tail
        # (e.g. "/recommend") - restore the "/api" prefix main.py's routes expect.
        path = "/api" + (path if path.startswith("/") else "/" + path)
    # else: PATH_INFO already starts with "/api" - leave it as-is.
    return path


_HOP_BY_HOP_RESPONSE_HEADERS = {"content-encoding", "transfer-encoding", "connection"}


def application(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET")
    path = _normalize_path(environ.get("PATH_INFO", "") or "/")
    query_string = environ.get("QUERY_STRING", "")
    url = path + (("?" + query_string) if query_string else "")

    try:
        content_length = int(environ.get("CONTENT_LENGTH") or 0)
    except (TypeError, ValueError):
        content_length = 0
    body = environ["wsgi.input"].read(content_length) if content_length else b""

    headers = {}
    for key, value in environ.items():
        if key.startswith("HTTP_"):
            header_name = key[5:].replace("_", "-").title()
            headers[header_name] = value
        elif key in ("CONTENT_TYPE", "CONTENT_LENGTH") and value:
            headers[key.replace("_", "-").title()] = str(value)

    try:
        resp = _client.request(method, url, content=body, headers=headers, timeout=30.0)
    except Exception as exc:  # noqa: BLE001 - surface bridge failures instead of hanging
        body_bytes = f"WSGI bridge error: {exc!r}".encode()
        start_response(
            "500 Internal Server Error",
            [("Content-Type", "text/plain"), ("Content-Length", str(len(body_bytes)))],
        )
        return [body_bytes]

    response_headers = [
        (k, v) for k, v in resp.headers.items() if k.lower() not in _HOP_BY_HOP_RESPONSE_HEADERS
    ]
    status_line = f"{resp.status_code} {resp.reason_phrase}"
    start_response(status_line, response_headers)
    return [resp.content]
