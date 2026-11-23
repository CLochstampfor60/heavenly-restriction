"""Access log without personal details.

Uvicorn's access log writes every request path with its query string. For this app the path
alone says things about the owner's health: `POST /api/sessions/2026-11-23/stops` records that
a workout was stopped (a symptom) on that day. The log keeps the method, the first two path
segments and the status, so it still shows what is being called and whether it works:

    "POST /api/sessions/... HTTP/1.1" 201

Static files (the app shell) are logged as they are; they carry no data.
"""

import copy
import logging

from uvicorn.config import LOGGING_CONFIG


def redact(path: str) -> str:
    """'/api/sessions/2026-11-23/stops' -> '/api/sessions/...', '/api/today?date=...' ->
    '/api/today?...'; paths outside /api/ unchanged."""
    bare = path.split("?", 1)[0]
    if not bare.startswith("/api/"):
        return path
    parts = bare.split("/")  # ['', 'api', 'sessions', ...]
    short = "/".join(parts[:3])
    if len(parts) > 3:
        short += "/..."
    if bare != path:
        short += "?..."
    return short


class RedactPaths(logging.Filter):
    """Rewrites the path argument of uvicorn.access records (client, method, path, version,
    status)."""

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) == 5 and isinstance(args[2], str):
            record.args = (args[0], args[1], redact(args[2]), args[3], args[4])
        return True


def log_config() -> dict:
    """Uvicorn's default logging config with RedactPaths on the access log."""
    config = copy.deepcopy(LOGGING_CONFIG)
    config.setdefault("filters", {})["redact_paths"] = {"()": "app.accesslog.RedactPaths"}
    config["handlers"]["access"]["filters"] = ["redact_paths"]
    return config
