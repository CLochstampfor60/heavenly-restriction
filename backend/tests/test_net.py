"""The app answers loopback only, and the launcher refuses a LAN bind."""

import pytest
from fastapi.testclient import TestClient

from app import __main__ as launcher
from app.main import app
from app.net import is_loopback


@pytest.mark.parametrize(
    ("host", "ok"),
    [("127.0.0.1", True), ("::1", True), ("localhost", True), ("192.168.1.20", False),
     ("100.64.0.5", False), ("0.0.0.0", False), (None, False), ("testclient", False)],
)  # fmt: skip
def test_is_loopback(host, ok) -> None:
    assert is_loopback(host) is ok


def test_lan_client_is_refused(monkeypatch) -> None:
    monkeypatch.delenv("HR_ALLOW_REMOTE_CLIENTS", raising=False)
    lan = TestClient(app, client=("192.168.1.20", 40000))
    r = lan.get("/api/health")
    assert r.status_code == 403
    assert TestClient(app, client=("127.0.0.1", 40000)).get("/api/health").status_code == 200


def test_forwarded_header_does_not_help(monkeypatch) -> None:
    monkeypatch.delenv("HR_ALLOW_REMOTE_CLIENTS", raising=False)
    lan = TestClient(app, client=("192.168.1.20", 40000))
    assert lan.get("/api/health", headers={"X-Forwarded-For": "127.0.0.1"}).status_code == 403


def test_container_flag_allows_bridge_clients(monkeypatch) -> None:
    monkeypatch.setenv("HR_ALLOW_REMOTE_CLIENTS", "1")
    assert TestClient(app, client=("172.18.0.1", 40000)).get("/api/health").status_code == 200


def test_launcher_refuses_lan_bind(monkeypatch, capsys) -> None:
    monkeypatch.setenv("HR_BIND_HOST", "0.0.0.0")
    monkeypatch.delenv("HR_IN_CONTAINER", raising=False)
    called = []
    monkeypatch.setattr(launcher.uvicorn, "run", lambda *a, **k: called.append(k))
    assert launcher.main() == 2 and not called
    assert "Refusing to bind 0.0.0.0" in capsys.readouterr().err


def test_launcher_defaults_to_loopback(monkeypatch) -> None:
    monkeypatch.delenv("HR_BIND_HOST", raising=False)
    called = []
    monkeypatch.setattr(launcher.uvicorn, "run", lambda *a, **k: called.append(k))
    assert launcher.main() == 0 and called[0]["host"] == "127.0.0.1"
