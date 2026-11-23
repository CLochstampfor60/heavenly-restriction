"""The access log keeps no dates, ids or query strings from API paths."""

import logging
import logging.config

from app.accesslog import RedactPaths, log_config, redact


def test_redact() -> None:
    assert redact("/api/sessions/2026-11-23/stops") == "/api/sessions/..."
    assert redact("/api/sessions/2026-11-23/stops/abc-123") == "/api/sessions/..."
    assert redact("/api/today?date=2026-11-23") == "/api/today?..."
    assert redact("/api/exercises/42?x=1") == "/api/exercises/...?..."
    assert redact("/api/health") == "/api/health"
    assert redact("/assets/index-abc.js") == "/assets/index-abc.js"
    assert redact("/") == "/"


def test_filter_rewrites_uvicorn_access_records() -> None:
    record = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        __file__,
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:5000", "POST", "/api/sessions/2026-11-23/stops", "1.1", 201),
        None,
    )
    assert RedactPaths().filter(record)
    assert record.getMessage() == '127.0.0.1:5000 - "POST /api/sessions/... HTTP/1.1" 201'


def test_log_config_puts_the_filter_on_the_access_handler() -> None:
    config = log_config()
    assert config["handlers"]["access"]["filters"] == ["redact_paths"]
    logging.config.dictConfig(config)  # valid for logging
