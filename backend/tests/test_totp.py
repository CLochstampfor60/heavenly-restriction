"""TOTP and recovery codes: they only ever authorize enrolling a new passkey, never a session."""

import base64
import time

from sqlalchemy import select

from app import auth
from app.models import AuthConfig, RecoveryCode
from tests.soft_authenticator import SoftAuthenticator
from tests.test_auth import enroll_first, login

# RFC 6238 appendix B, SHA-1 secret "12345678901234567890" (8-digit values, last 6 used here).
RFC_SECRET = base64.b32encode(b"12345678901234567890").decode().rstrip("=")


def test_rfc6238_vectors() -> None:
    for t, expected in [(59, "94287082"), (1111111109, "07081804"), (2000000000, "69279037")]:
        assert auth.totp_at(RFC_SECRET, t // 30, digits=8) == expected
        assert auth.totp_at(RFC_SECRET, t // 30) == expected[-6:]


def test_totp_window_and_replay() -> None:
    now = 1111111109
    code = auth.totp_at(RFC_SECRET, now // 30)
    step = auth.totp_verify(RFC_SECRET, code, None, at=now + 30)  # one step of drift
    assert step == now // 30
    assert auth.totp_verify(RFC_SECRET, code, step, at=now) is None  # used once only
    assert auth.totp_verify(RFC_SECRET, code, None, at=now + 120) is None  # too old


def setup_totp(client) -> tuple[str, list[str]]:
    secret = client.post("/api/auth/totp/setup").json()["secret"]
    code = auth.totp_at(secret, int(time.time() // 30))
    r = client.post("/api/auth/totp/confirm", json={"code": code})
    assert r.status_code == 200, r.text
    return secret, r.json()["recovery_codes"]


def test_setup_needs_a_session(anon) -> None:
    assert anon.post("/api/auth/totp/setup").status_code == 401
    assert anon.post("/api/auth/recovery/regenerate").status_code == 401


def test_confirm_shows_ten_codes_once_and_stores_hashes(client, db) -> None:
    secret, codes = setup_totp(client)
    assert len(codes) == 10 and len(set(codes)) == 10
    stored = [r.code_hash for r in db.scalars(select(RecoveryCode))]
    assert len(stored) == 10 and not set(codes) & set(stored)
    assert db.get(AuthConfig, 1).totp_secret == secret
    status = client.get("/api/auth/status").json()
    assert status["totp"] is True and status["recovery_codes_left"] == 10
    assert "recovery_codes" not in status  # never shown again


def test_wrong_confirm_code(client) -> None:
    client.post("/api/auth/totp/setup")
    assert client.post("/api/auth/totp/confirm", json={"code": "000000"}).status_code in (400,)


def test_recovery_code_enrolls_a_passkey_but_never_logs_in(anon, engine) -> None:
    from tests.conftest import make_client

    key = SoftAuthenticator()
    enroll_first(anon, key)
    login(anon, key)
    _, codes = setup_totp(anon)
    stranger = make_client(engine, signed_in=False)  # the new phone
    r = stranger.post("/api/auth/enroll/start", json={"code": codes[0]})
    assert r.status_code == 200
    assert stranger.get("/api/program").status_code == 401  # a code is not a login
    token = r.json()["enroll_token"]
    body = stranger.post("/api/auth/register/options", json={"enroll_token": token}).json()
    new_key = SoftAuthenticator()
    r = stranger.post(
        "/api/auth/register/verify",
        json={"ceremony": body["ceremony"], "credential": new_key.register(body["options"])},
    )
    assert r.status_code == 200
    assert stranger.get("/api/program").status_code == 401  # still not signed in
    assert login(stranger, new_key).status_code == 200  # the new passkey is the login
    # Single use: the code and the grant are spent.
    assert stranger.post("/api/auth/enroll/start", json={"code": codes[0]}).status_code == 403
    again = stranger.post("/api/auth/register/options", json={"enroll_token": token})
    assert again.status_code == 200  # signed in now, so allowed as "add a passkey" instead


def test_totp_code_enrolls_once(anon, engine) -> None:
    from tests.conftest import make_client

    key = SoftAuthenticator()
    enroll_first(anon, key)
    login(anon, key)
    secret, _ = setup_totp(anon)
    stranger = make_client(engine, signed_in=False)
    step = int(time.time() // 30) + 1  # the confirm used the current step
    code = auth.totp_at(secret, step)
    assert stranger.post("/api/auth/enroll/start", json={"code": code}).status_code == 200
    assert stranger.post("/api/auth/enroll/start", json={"code": code}).status_code == 403


def test_enroll_lockout(anon) -> None:
    for _ in range(5):
        assert anon.post("/api/auth/enroll/start", json={"code": "123456"}).status_code == 403
    assert anon.post("/api/auth/enroll/start", json={"code": "123456"}).status_code == 429


def test_regenerate_replaces_codes(client) -> None:
    _, old = setup_totp(client)
    new = client.post("/api/auth/recovery/regenerate").json()["recovery_codes"]
    assert len(new) == 10 and not set(old) & set(new)
