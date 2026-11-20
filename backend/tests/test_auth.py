"""Login rules from docs/SECURITY.md, one test per rule. Real WebAuthn verification."""

from datetime import timedelta

import pytest
from sqlalchemy import select

from app import auth
from app.models import AuthEvent, AuthSession, Passkey
from tests.soft_authenticator import SoftAuthenticator

DATA_ROUTES = [
    ("get", "/api/program"),
    ("get", "/api/today?date=2026-11-16"),
    ("get", "/api/exercises"),
    ("get", "/api/exercises/1"),
    ("get", "/api/progress?date=2026-11-16"),
    ("get", "/api/body-metrics"),
    ("put", "/api/sessions/2026-11-16"),
    ("post", "/api/sessions/2026-11-16/sets"),
    ("put", "/api/body-metrics/2026-11-16"),
    ("post", "/api/notes"),
]


def enroll_first(anon, key: SoftAuthenticator) -> None:
    anon.get("/api/auth/status")  # makes the setup code
    r = anon.post("/api/auth/register/options", json={"setup_code": auth.SETUP.code})
    assert r.status_code == 200, r.text
    body = r.json()
    r = anon.post(
        "/api/auth/register/verify",
        json={"ceremony": body["ceremony"], "credential": key.register(body["options"])},
    )
    assert r.status_code == 200, r.text


def login(c, key: SoftAuthenticator, **kw):
    body = c.post("/api/auth/login/options").json()
    return c.post(
        "/api/auth/login/verify",
        json={"ceremony": body["ceremony"], "credential": key.sign(body["options"], **kw)},
    )


# ---- every data route needs a session


@pytest.mark.parametrize(("method", "path"), DATA_ROUTES)
def test_unauthenticated_requests_get_401(anon, method, path) -> None:
    kwargs = {"json": {}} if method in ("put", "post") else {}
    assert getattr(anon, method)(path, **kwargs).status_code == 401


def test_public_routes(anon) -> None:
    assert anon.get("/api/health").status_code == 200
    s = anon.get("/api/auth/status").json()
    assert s == {"authenticated": False, "setup_required": True}


# ---- first run: setup code, then a passkey, then sign in


def test_setup_code_creates_first_passkey_but_no_session(anon) -> None:
    key = SoftAuthenticator()
    enroll_first(anon, key)
    assert anon.get("/api/program").status_code == 401  # enrolling is not logging in
    assert anon.get("/api/auth/status").json()["setup_required"] is False
    r = login(anon, key)
    assert r.status_code == 200
    assert anon.get("/api/program").status_code == 200


def test_setup_code_is_single_use_and_only_while_no_passkey(anon) -> None:
    enroll_first(anon, SoftAuthenticator())
    assert auth.SETUP.code is None
    r = anon.post("/api/auth/register/options", json={"setup_code": "AAAA-BBBB-CCCC"})
    assert r.status_code == 401


def test_wrong_setup_code(anon) -> None:
    anon.get("/api/auth/status")
    r = anon.post("/api/auth/register/options", json={"setup_code": "WRONG-CODE-XX"})
    assert r.status_code == 403


def test_registration_needs_a_reason(anon) -> None:
    assert anon.post("/api/auth/register/options", json={}).status_code == 401


# ---- cookie and session rules


def test_cookie_flags(anon) -> None:
    key = SoftAuthenticator()
    enroll_first(anon, key)
    r = login(anon, key)
    cookie = r.headers["set-cookie"]
    assert cookie.startswith("__Host-hr_session=")
    for flag in ("HttpOnly", "Secure", "SameSite=strict", "Path=/"):
        assert flag.lower() in cookie.lower(), flag
    assert "domain=" not in cookie.lower()


def test_login_rotates_the_session(anon, db) -> None:
    key = SoftAuthenticator()
    enroll_first(anon, key)
    login(anon, key)
    first = anon.cookies.get(auth.cookie_name())
    login(anon, key)
    second = anon.cookies.get(auth.cookie_name())
    assert first != second
    old = db.scalar(select(AuthSession).where(AuthSession.token_hash == auth.sha256(first)))
    db.refresh(old)
    assert old.revoked_at is not None


def test_idle_timeout(client, db) -> None:
    s = db.scalars(select(AuthSession)).one()
    s.last_seen_at = auth.now() - timedelta(hours=169)
    db.commit()
    assert client.get("/api/program").status_code == 401


def test_absolute_lifetime(client, db) -> None:
    s = db.scalars(select(AuthSession)).one()
    s.expires_at = auth.now() - timedelta(seconds=1)
    db.commit()
    assert client.get("/api/program").status_code == 401


def test_logout_revokes(client) -> None:
    assert client.get("/api/program").status_code == 200
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/program").status_code == 401


def test_only_the_hash_is_stored(client, db) -> None:
    token = client.cookies.get(auth.cookie_name())
    rows = db.scalars(select(AuthSession)).all()
    assert all(r.token_hash != token for r in rows)
    assert any(r.token_hash == auth.sha256(token) for r in rows)


# ---- Origin check on writes


def test_writes_need_an_allowed_origin(client) -> None:
    body = {"bodyweight_lb": 190}
    ok = client.put("/api/body-metrics/2026-11-16", json=body)
    assert ok.status_code == 200
    bad = client.put(
        "/api/body-metrics/2026-11-16", json=body, headers={"Origin": "https://evil.example"}
    )
    assert bad.status_code == 403
    client.headers.pop("Origin")
    assert client.put("/api/body-metrics/2026-11-16", json=body).status_code == 403
    assert client.get("/api/program").status_code == 200  # reads need no Origin


def test_login_needs_an_allowed_origin(anon) -> None:
    r = anon.post("/api/auth/login/options", headers={"Origin": "https://evil.example"})
    assert r.status_code == 403


# ---- WebAuthn verification


def test_wrong_origin_in_client_data_fails(anon) -> None:
    key = SoftAuthenticator()
    enroll_first(anon, key)
    assert login(anon, key, origin="https://evil.example").status_code == 401


def test_user_verification_required(anon) -> None:
    key = SoftAuthenticator()
    enroll_first(anon, key)
    assert login(anon, key, verified=False).status_code == 401


def test_unknown_passkey_fails(anon) -> None:
    enroll_first(anon, SoftAuthenticator())
    assert login(anon, SoftAuthenticator()).status_code == 401


def test_ceremony_is_single_use(anon) -> None:
    key = SoftAuthenticator()
    enroll_first(anon, key)
    body = anon.post("/api/auth/login/options").json()
    cred = key.sign(body["options"])
    payload = {"ceremony": body["ceremony"], "credential": cred}
    assert anon.post("/api/auth/login/verify", json=payload).status_code == 200
    assert anon.post("/api/auth/login/verify", json=payload).status_code == 400


# ---- lockout


def test_lockout_after_five_failures(anon, db) -> None:
    key = SoftAuthenticator()
    enroll_first(anon, key)
    for _ in range(5):
        assert login(anon, key, verified=False).status_code == 401
    r = anon.post("/api/auth/login/options")
    assert r.status_code == 429 and r.headers["Retry-After"] == "900"
    # After the window, the lock lifts.
    for e in db.scalars(select(AuthEvent).where(AuthEvent.kind == "login")):
        e.at = auth.now() - timedelta(minutes=16)
    db.commit()
    assert login(anon, key).status_code == 200


def test_setup_code_lockout(anon) -> None:
    anon.get("/api/auth/status")
    for _ in range(5):
        anon.post("/api/auth/register/options", json={"setup_code": "NOPE-NOPE-NOPE"})
    r = anon.post("/api/auth/register/options", json={"setup_code": auth.SETUP.code})
    assert r.status_code == 429


# ---- adding a passkey while signed in


def test_signed_in_can_add_a_passkey(client, db) -> None:
    body = client.post("/api/auth/register/options", json={}).json()
    cred = SoftAuthenticator().register(body["options"])
    r = client.post(
        "/api/auth/register/verify",
        json={"ceremony": body["ceremony"], "credential": cred, "name": "Tablet"},
    )
    assert r.status_code == 200
    assert [p.name for p in db.scalars(select(Passkey))] == ["Tablet"]


def test_auth_events_are_logged_without_data(anon, db) -> None:
    key = SoftAuthenticator()
    enroll_first(anon, key)
    login(anon, key)
    kinds = [e.kind for e in db.scalars(select(AuthEvent).order_by(AuthEvent.id))]
    assert kinds == ["passkey_added", "login"]
