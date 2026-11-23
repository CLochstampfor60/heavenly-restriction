"""Security headers on API responses, errors, the loopback 403, and static files."""

from fastapi.testclient import TestClient

from app.headers import HEADERS
from app.main import FRONTEND_DIST, app

LOCAL = ("127.0.0.1", 50000)


def assert_headers(response) -> None:
    for name, value in HEADERS.items():
        assert response.headers.get(name) == value, name


def test_api_response_has_headers() -> None:
    assert_headers(TestClient(app, client=LOCAL).get("/api/health"))


def test_errors_have_headers() -> None:
    client = TestClient(app, client=LOCAL)
    assert_headers(client.get("/api/exercises/not-a-number"))  # 422
    assert_headers(client.get("/api/no-such-route"))  # 404


def test_loopback_refusal_has_headers(monkeypatch) -> None:
    monkeypatch.delenv("HR_ALLOW_REMOTE_CLIENTS", raising=False)
    r = TestClient(app, client=("192.168.1.20", 40000)).get("/api/health")
    assert r.status_code == 403
    assert_headers(r)


def test_csp_essentials() -> None:
    csp = HEADERS["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in csp
    assert "frame-src https://www.youtube-nocookie.com" in csp
    assert "script-src 'self'" in csp and "unsafe-inline" not in csp and "unsafe-eval" not in csp


def test_static_files_have_headers() -> None:
    if not (FRONTEND_DIST / "index.html").is_file():
        return  # not built in this checkout
    assert_headers(TestClient(app, client=LOCAL).get("/"))


def test_unhandled_error_500_has_headers() -> None:
    from app.main import App

    broken = App()

    @broken.get("/api/boom")
    def boom() -> None:
        raise RuntimeError("boom")

    r = TestClient(broken, client=LOCAL, raise_server_exceptions=False).get("/api/boom")
    assert r.status_code == 500
    assert_headers(r)
    assert r.headers["Cache-Control"] == "no-store"


def test_api_responses_are_never_cached() -> None:
    client = TestClient(app, client=LOCAL)
    assert client.get("/api/health").headers["Cache-Control"] == "no-store"
    assert client.get("/api/today").headers["Cache-Control"] == "no-store"  # 401
    assert client.get("/api/no-such-route").headers["Cache-Control"] == "no-store"


def test_static_files_keep_normal_caching() -> None:
    if not (FRONTEND_DIST / "index.html").is_file():
        return  # not built in this checkout
    assert "Cache-Control" not in TestClient(app, client=LOCAL).get("/").headers


def test_no_public_api_docs() -> None:
    client = TestClient(app, client=LOCAL)
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404, path
