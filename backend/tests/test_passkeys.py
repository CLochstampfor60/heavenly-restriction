"""Managing passkeys from Settings: list, rename, remove, and a device code for adding one on
another device (the workstation). Real WebAuthn verification through the soft authenticator."""

import time

from sqlalchemy import select

from app import auth
from app.models import AuthEvent, AuthSession, Passkey, RecoveryCode
from tests.conftest import make_client
from tests.soft_authenticator import SoftAuthenticator
from tests.test_auth import enroll_first, login
from tests.test_totp import setup_totp


def signed_in_owner(anon) -> SoftAuthenticator:
    """First passkey via the setup code (default name "Passkey"), then signed in with it."""
    key = SoftAuthenticator()
    enroll_first(anon, key)
    assert login(anon, key).status_code == 200
    return key


def add_passkey(c, name: str) -> SoftAuthenticator:
    body = c.post("/api/auth/register/options", json={}).json()
    key = SoftAuthenticator()
    r = c.post(
        "/api/auth/register/verify",
        json={
            "ceremony": body["ceremony"],
            "credential": key.register(body["options"]),
            "name": name,
        },
    )
    assert r.status_code == 200, r.text
    return key


def ids(c) -> dict[str, int]:
    return {p["name"]: p["id"] for p in c.get("/api/auth/passkeys").json()}


# ---- list and rename


def test_management_needs_a_session(anon) -> None:
    assert anon.get("/api/auth/passkeys").status_code == 401
    assert anon.patch("/api/auth/passkeys/1", json={"name": "x"}).status_code == 401
    assert anon.post("/api/auth/passkeys/1/remove", json={}).status_code == 401
    assert anon.post("/api/auth/device-code").status_code == 401


def test_list_shows_name_last_used_and_current(anon) -> None:
    signed_in_owner(anon)
    add_passkey(anon, "Windows (Windows Hello)")
    rows = anon.get("/api/auth/passkeys").json()
    assert [r["name"] for r in rows] == ["Passkey", "Windows (Windows Hello)"]
    phone, pc = rows
    assert phone["current"] is True and pc["current"] is False
    assert phone["last_used_at"] is not None  # signed in with it
    assert pc["last_used_at"] is None  # never used to sign in yet
    assert phone["created_at"] and set(phone) == {
        "id",
        "name",
        "created_at",
        "last_used_at",
        "current",
    }  # no key material


def test_rename(anon) -> None:
    signed_in_owner(anon)
    pid = ids(anon)["Passkey"]
    assert anon.patch(f"/api/auth/passkeys/{pid}", json={"name": "  Galaxy  "}).status_code == 200
    assert list(ids(anon)) == ["Galaxy"]
    assert anon.patch(f"/api/auth/passkeys/{pid}", json={"name": "   "}).status_code == 422
    assert anon.patch("/api/auth/passkeys/999", json={"name": "x"}).status_code == 404


def test_rename_needs_an_allowed_origin(anon) -> None:
    signed_in_owner(anon)
    pid = ids(anon)["Passkey"]
    r = anon.patch(
        f"/api/auth/passkeys/{pid}", json={"name": "x"}, headers={"Origin": "https://evil.example"}
    )
    assert r.status_code == 403


# ---- remove


def test_remove_another_passkey_ends_its_sessions(anon, engine, db) -> None:
    signed_in_owner(anon)
    pc_key = add_passkey(anon, "Workstation")
    pc = make_client(engine, signed_in=False)
    assert login(pc, pc_key).status_code == 200
    assert pc.get("/api/program").status_code == 200

    r = anon.post(f"/api/auth/passkeys/{ids(anon)['Workstation']}/remove", json={})
    assert r.status_code == 200 and r.json()["signed_out"] is False
    assert pc.get("/api/program").status_code == 401  # its session ended
    assert anon.get("/api/program").status_code == 200  # this one did not
    assert login(pc, pc_key).status_code == 401  # and it can no longer sign in
    assert [p.name for p in db.scalars(select(Passkey))] == ["Passkey"]


def test_remove_the_passkey_you_signed_in_with_signs_you_out(anon) -> None:
    signed_in_owner(anon)
    add_passkey(anon, "Workstation")
    r = anon.post(f"/api/auth/passkeys/{ids(anon)['Passkey']}/remove", json={})
    assert r.status_code == 200 and r.json()["signed_out"] is True
    assert anon.get("/api/program").status_code == 401


def test_last_passkey_cannot_be_removed_without_a_recovery_code(anon, db) -> None:
    signed_in_owner(anon)
    pid = ids(anon)["Passkey"]
    r = anon.post(f"/api/auth/passkeys/{pid}/remove", json={})
    assert r.status_code == 409
    assert (
        anon.post(
            f"/api/auth/passkeys/{pid}/remove", json={"recovery_code": "AAAA-BBBB-CCCC"}
        ).status_code
        == 403
    )
    assert db.scalar(select(Passkey)) is not None
    assert anon.get("/api/program").status_code == 200


def test_last_passkey_with_a_recovery_code(anon, db) -> None:
    signed_in_owner(anon)
    _, codes = setup_totp(anon)
    pid = ids(anon)["Passkey"]
    r = anon.post(f"/api/auth/passkeys/{pid}/remove", json={"recovery_code": codes[0].lower()})
    assert r.status_code == 200 and r.json()["signed_out"] is True
    assert db.scalar(select(Passkey)) is None
    assert db.scalar(select(AuthSession).where(AuthSession.revoked_at.is_(None))) is None
    used = db.scalars(select(RecoveryCode).where(RecoveryCode.used_at.is_not(None))).all()
    assert len(used) == 1  # the code is used up
    # With no passkey left, the console setup code is the way back in.
    status = anon.get("/api/auth/status").json()
    assert status["setup_required"] is True and auth.SETUP.code is not None


def test_remove_lockout(anon) -> None:
    signed_in_owner(anon)
    pid = ids(anon)["Passkey"]
    for _ in range(auth.LOCK_AFTER):
        r = anon.post(f"/api/auth/passkeys/{pid}/remove", json={"recovery_code": "AAAA-BBBB-CCCC"})
        assert r.status_code == 403
    r = anon.post(f"/api/auth/passkeys/{pid}/remove", json={"recovery_code": "AAAA-BBBB-CCCC"})
    assert r.status_code == 429


def test_remove_is_logged_without_data(anon, db) -> None:
    signed_in_owner(anon)
    add_passkey(anon, "Workstation")
    anon.post(f"/api/auth/passkeys/{ids(anon)['Workstation']}/remove", json={})
    event = db.scalar(select(AuthEvent).where(AuthEvent.kind == "passkey_removed"))
    assert event is not None and event.ok and "Workstation" not in (event.detail or "")


# ---- device code: a passkey on the workstation


def test_device_code_enrolls_another_device_but_never_logs_in(anon, engine) -> None:
    signed_in_owner(anon)
    code = anon.post("/api/auth/device-code").json()["code"]
    pc = make_client(engine, signed_in=False)
    r = pc.post("/api/auth/enroll/start", json={"code": code})
    assert r.status_code == 200
    assert pc.get("/api/program").status_code == 401  # a code is not a login
    body = pc.post(
        "/api/auth/register/options", json={"enroll_token": r.json()["enroll_token"]}
    ).json()
    pc_key = SoftAuthenticator()
    r = pc.post(
        "/api/auth/register/verify",
        json={
            "ceremony": body["ceremony"],
            "credential": pc_key.register(body["options"]),
            "name": "Workstation",
        },
    )
    assert r.status_code == 200
    assert pc.get("/api/program").status_code == 401
    assert login(pc, pc_key).status_code == 200  # the new passkey signs in
    assert sorted(ids(pc)) == ["Passkey", "Workstation"]


def test_device_code_is_single_use_and_replaced_by_a_new_one(anon, engine) -> None:
    signed_in_owner(anon)
    pc = make_client(engine, signed_in=False)
    first = anon.post("/api/auth/device-code").json()["code"]
    second = anon.post("/api/auth/device-code").json()["code"]
    assert pc.post("/api/auth/enroll/start", json={"code": first}).status_code == 403
    assert pc.post("/api/auth/enroll/start", json={"code": second}).status_code == 200
    assert pc.post("/api/auth/enroll/start", json={"code": second}).status_code == 403


def test_device_code_expires(anon, engine, monkeypatch) -> None:
    signed_in_owner(anon)
    code = anon.post("/api/auth/device-code").json()["code"]
    later = time.monotonic() + auth.CEREMONY_TTL + 1
    monkeypatch.setattr(auth.time, "monotonic", lambda: later)
    pc = make_client(engine, signed_in=False)
    assert pc.post("/api/auth/enroll/start", json={"code": code}).status_code == 403
