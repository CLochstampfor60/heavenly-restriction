"""Login: passkeys (WebAuthn) and server-side sessions. See docs/SECURITY.md.

Rules
- A passkey is the only way to get a session.
- Creating a passkey needs one of: the one-time setup code printed in the server console (only
  while no passkey exists), an active session (adding another passkey), or an enroll grant from
  a TOTP code, a one-time recovery code (lost phone) or a device code shown in Settings on a
  signed-in device (adding the workstation). None of those log you in.
- Removing a passkey ends the sessions it signed in. The last passkey can be removed only with a
  recovery code.
- Session cookie: random token, HttpOnly, Secure, SameSite=Strict, `__Host-` prefix when Secure.
  The server stores only its SHA-256. New session on every login (the old cookie's session is
  revoked); idle timeout plus an absolute lifetime.
- Every state-changing /api request must carry an allowed Origin (403 otherwise).
- 5 failures of the same kind within 15 minutes lock that action for 15 minutes (429).
"""

import base64
import hashlib
import hmac
import json
import secrets
import struct
import sys
import time
from datetime import UTC, datetime, timedelta
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app import config
from app.db import get_db
from app.models import AuthConfig, AuthEvent, AuthSession, Passkey, RecoveryCode

router = APIRouter(prefix="/api/auth")
DB = Annotated[Session, Depends(get_db)]

LOCK_AFTER = 5
LOCK_WINDOW = timedelta(minutes=15)
CEREMONY_TTL = 300  # seconds
TOUCH_EVERY = timedelta(minutes=1)  # how often last_seen_at is written


def now() -> datetime:
    return datetime.now(UTC)


def aware(dt: datetime) -> datetime:
    """SQLite returns naive datetimes; they are stored as UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def cookie_name() -> str:
    return "__Host-hr_session" if config.cookie_secure() else "hr_session"


# ---------------------------------------------------------------- events and lockout


def record(db: Session, kind: str, ok: bool, detail: str | None = None) -> None:
    db.add(AuthEvent(kind=kind, ok=ok, detail=detail))
    db.commit()


def check_lock(db: Session, kind: str) -> None:
    since = now() - LOCK_WINDOW
    failures = db.scalar(
        select(func.count(AuthEvent.id)).where(
            AuthEvent.kind == kind, AuthEvent.ok.is_(False), AuthEvent.at >= since
        )
    )
    if failures >= LOCK_AFTER:
        raise HTTPException(
            429,
            "Too many failed attempts. Try again in 15 minutes.",
            headers={"Retry-After": str(int(LOCK_WINDOW.total_seconds()))},
        )


# ---------------------------------------------------------------- one-time values in memory


class Ceremonies:
    """Pending WebAuthn challenges and enroll grants, single use, short-lived."""

    def __init__(self) -> None:
        self.items: dict[str, tuple[float, dict]] = {}

    def put(self, value: dict) -> str:
        self.prune()
        if len(self.items) > 100:
            raise HTTPException(429, "Too many pending sign-in attempts.")
        key = secrets.token_urlsafe(16)
        self.items[key] = (time.monotonic() + CEREMONY_TTL, value)
        return key

    def take(self, key: str) -> dict | None:
        self.prune()
        item = self.items.pop(key, None)
        return item[1] if item else None

    def prune(self) -> None:
        t = time.monotonic()
        for key in [k for k, (exp, _) in self.items.items() if exp < t]:
            del self.items[key]


CEREMONIES = Ceremonies()
ENROLL_GRANTS = Ceremonies()


class SetupCode:
    """The first passkey's one-time code, printed in the server console. Valid only while no
    passkey exists; a new one is made at each start until the first passkey is enrolled."""

    ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

    def __init__(self) -> None:
        self.code: str | None = None

    def ensure(self, db: Session) -> None:
        if self.code is None and not db.scalar(select(func.count(Passkey.id))):
            raw = "".join(secrets.choice(self.ALPHABET) for _ in range(12))
            self.code = f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"
            print(
                f"\n  Heavenly Restriction first-run setup code: {self.code}\n"
                "  Enter it on the sign-in screen to create your first passkey.\n",
                file=sys.stderr,
                flush=True,
            )

    def check(self, value: str) -> bool:
        if self.code is None:
            return False
        return hmac.compare_digest(normalize_code(value), normalize_code(self.code))

    def burn(self) -> None:
        self.code = None


SETUP = SetupCode()


class DeviceCode:
    """A one-time code shown in Settings on a signed-in device, so another device (the
    workstation) can create its own passkey. Five minutes, single use; a new code replaces the
    old one. Only its hash is kept, in memory."""

    def __init__(self) -> None:
        self.item: tuple[float, str] | None = None

    def new(self) -> str:
        raw = "".join(secrets.choice(SetupCode.ALPHABET) for _ in range(12))
        self.item = (time.monotonic() + CEREMONY_TTL, sha256(raw))
        return f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"

    def take(self, value: str) -> bool:
        if self.item is None or time.monotonic() > self.item[0]:
            self.item = None
            return False
        if not hmac.compare_digest(sha256(normalize_code(value)), self.item[1]):
            return False
        self.item = None
        return True


DEVICE_CODE = DeviceCode()


def normalize_code(value: str) -> str:
    return "".join(ch for ch in value.upper() if ch.isalnum())


# ---------------------------------------------------------------- TOTP (RFC 6238) and recovery


def totp_at(secret_b32: str, step: int, digits: int = 6) -> str:
    key = base64.b32decode(secret_b32 + "=" * (-len(secret_b32) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**digits).zfill(digits)


def totp_verify(secret_b32: str, code: str, last_step: int | None, at: float | None = None):
    """Returns the matched time step (±1 step of drift), or None. Steps at or before
    `last_step` are refused, so a code works once."""
    code = "".join(ch for ch in code if ch.isdigit())
    if len(code) != 6:
        return None
    step = int((at if at is not None else time.time()) // 30)
    for s in (step - 1, step, step + 1):
        if (last_step is None or s > last_step) and hmac.compare_digest(
            totp_at(secret_b32, s), code
        ):
            return s
    return None


def take_recovery_code(db: Session, code: str) -> bool:
    """Marks an unused recovery code used. The caller commits."""
    row = db.scalar(
        select(RecoveryCode).where(
            RecoveryCode.code_hash == sha256(normalize_code(code)),
            RecoveryCode.used_at.is_(None),
        )
    )
    if row is None:
        return False
    row.used_at = now()
    return True


def new_recovery_codes(db: Session) -> list[str]:
    """Replaces all recovery codes with 10 new ones. Returns them; they are never shown again."""
    db.execute(delete(RecoveryCode))
    codes = []
    for _ in range(10):
        raw = "".join(secrets.choice(SetupCode.ALPHABET) for _ in range(12))
        code = f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"
        codes.append(code)
        db.add(RecoveryCode(code_hash=sha256(normalize_code(code))))
    db.commit()
    return codes


# ---------------------------------------------------------------- sessions


def auth_config(db: Session) -> AuthConfig:
    cfg = db.get(AuthConfig, 1)
    if cfg is None:
        cfg = AuthConfig(id=1, user_handle=secrets.token_bytes(32))
        db.add(cfg)
        db.commit()
    return cfg


def create_session(db: Session, passkey_id: int | None, user_agent: str | None = None) -> str:
    token = secrets.token_urlsafe(32)
    db.add(
        AuthSession(
            token_hash=sha256(token),
            passkey_id=passkey_id,
            expires_at=now() + timedelta(days=config.session_days()),
            user_agent=(user_agent or "")[:160] or None,
        )
    )
    db.commit()
    return token


def session_for(db: Session, token: str | None) -> AuthSession | None:
    if not token:
        return None
    s = db.scalar(select(AuthSession).where(AuthSession.token_hash == sha256(token)))
    if s is None or s.revoked_at is not None:
        return None
    t = now()
    if t >= aware(s.expires_at):
        return None
    if t - aware(s.last_seen_at) > timedelta(hours=config.session_idle_hours()):
        return None
    if t - aware(s.last_seen_at) > TOUCH_EVERY:
        s.last_seen_at = t
        db.commit()
    return s


def set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        cookie_name(),
        token,
        max_age=int(config.session_days() * 86400),
        path="/",
        secure=config.cookie_secure(),
        httponly=True,
        samesite="strict",
    )


def clear_cookie(response: Response) -> None:
    response.delete_cookie(
        cookie_name(), path="/", secure=config.cookie_secure(), httponly=True, samesite="strict"
    )


def require_session(request: Request, db: DB) -> AuthSession:
    """Dependency for every data route: 401 without a valid session."""
    s = session_for(db, request.cookies.get(cookie_name()))
    if s is None:
        raise HTTPException(401, "Sign in required.")
    return s


SessionDep = Annotated[AuthSession, Depends(require_session)]


class OriginCheck:
    """ASGI middleware: state-changing /api requests need an allowed Origin header."""

    WRITES = {"POST", "PUT", "PATCH", "DELETE"}

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] == "http"
            and scope["method"] in self.WRITES
            and scope["path"].startswith("/api/")
        ):
            headers = dict(scope.get("headers") or [])
            origin = headers.get(b"origin", b"").decode("latin-1").rstrip("/")
            if origin not in config.allowed_origins():
                response = JSONResponse({"detail": "Origin not allowed."}, status_code=403)
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


# ---------------------------------------------------------------- status


@router.get("/status")
def status(request: Request, db: DB) -> dict:
    SETUP.ensure(db)
    s = session_for(db, request.cookies.get(cookie_name()))
    passkeys = db.scalar(select(func.count(Passkey.id)))
    out = {"authenticated": s is not None, "setup_required": passkeys == 0}
    if s is not None:
        cfg = auth_config(db)
        out.update(
            passkeys=passkeys,
            totp=cfg.totp_secret is not None,
            recovery_codes_left=db.scalar(
                select(func.count(RecoveryCode.id)).where(RecoveryCode.used_at.is_(None))
            ),
        )
    return out


# ---------------------------------------------------------------- registration (new passkey)


class RegisterOptionsIn(BaseModel):
    setup_code: str | None = None
    enroll_token: str | None = None


class RegisterVerifyIn(BaseModel):
    ceremony: str
    credential: dict
    name: str = Field(default="Passkey", max_length=80)


@router.post("/register/options")
def register_options(body: RegisterOptionsIn, request: Request, db: DB) -> dict:
    SETUP.ensure(db)
    has_passkey = bool(db.scalar(select(func.count(Passkey.id))))
    how = None
    if session_for(db, request.cookies.get(cookie_name())) is not None:
        how = "session"
    elif body.enroll_token and ENROLL_GRANTS.take(body.enroll_token):
        how = "enroll"
    elif body.setup_code is not None and not has_passkey:
        check_lock(db, "setup")
        if not SETUP.check(body.setup_code):
            record(db, "setup", False)
            raise HTTPException(403, "That setup code is not right.")
        how = "setup"
    if how is None:
        raise HTTPException(401, "Sign in, or use a setup, authenticator or recovery code.")
    cfg = auth_config(db)
    existing = db.scalars(select(Passkey)).all()
    options = generate_registration_options(
        rp_id=config.rp_id(),
        rp_name=config.rp_name(),
        user_id=cfg.user_handle,
        user_name="owner",
        user_display_name="Heavenly Restriction",
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=[PublicKeyCredentialDescriptor(id=p.credential_id) for p in existing],
    )
    ceremony = CEREMONIES.put({"purpose": "register", "challenge": options.challenge, "how": how})
    return {"ceremony": ceremony, "options": json.loads(options_to_json(options))}


@router.post("/register/verify")
def register_verify(body: RegisterVerifyIn, db: DB) -> dict:
    state = CEREMONIES.take(body.ceremony)
    if not state or state["purpose"] != "register":
        raise HTTPException(400, "This passkey request expired. Start again.")
    try:
        verified = verify_registration_response(
            credential=body.credential,
            expected_challenge=state["challenge"],
            expected_rp_id=config.rp_id(),
            expected_origin=config.allowed_origins(),
            require_user_verification=True,
        )
    except Exception as error:  # py_webauthn raises several exception types
        record(db, "register", False, type(error).__name__)
        raise HTTPException(400, "The passkey could not be verified.") from None
    passkey = Passkey(
        credential_id=verified.credential_id,
        public_key=verified.credential_public_key,
        sign_count=verified.sign_count,
        transports=body.credential.get("response", {}).get("transports") or [],
        name=body.name or "Passkey",
    )
    db.add(passkey)
    db.commit()
    if state["how"] == "setup":
        SETUP.burn()
    record(db, "passkey_added", True, f"via {state['how']}")
    # No session here: sign in with the new passkey next.
    return {"ok": True, "passkey_id": passkey.id}


# ---------------------------------------------------------------- login


class LoginVerifyIn(BaseModel):
    ceremony: str
    credential: dict


@router.post("/login/options")
def login_options(db: DB) -> dict:
    check_lock(db, "login")
    passkeys = db.scalars(select(Passkey)).all()
    if not passkeys:
        raise HTTPException(409, "No passkey yet: set one up first.")
    options = generate_authentication_options(
        rp_id=config.rp_id(),
        allow_credentials=[PublicKeyCredentialDescriptor(id=p.credential_id) for p in passkeys],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    ceremony = CEREMONIES.put({"purpose": "login", "challenge": options.challenge})
    return {"ceremony": ceremony, "options": json.loads(options_to_json(options))}


@router.post("/login/verify")
def login_verify(body: LoginVerifyIn, request: Request, response: Response, db: DB) -> dict:
    check_lock(db, "login")
    state = CEREMONIES.take(body.ceremony)
    if not state or state["purpose"] != "login":
        raise HTTPException(400, "This sign-in request expired. Start again.")
    raw_id = body.credential.get("rawId") or body.credential.get("id") or ""
    try:
        cred_id = base64.urlsafe_b64decode(raw_id + "=" * (-len(raw_id) % 4))
    except ValueError:
        cred_id = b""
    passkey = db.scalar(select(Passkey).where(Passkey.credential_id == cred_id))
    if passkey is None:
        record(db, "login", False, "unknown passkey")
        raise HTTPException(401, "That passkey is not registered here.")
    try:
        verified = verify_authentication_response(
            credential=body.credential,
            expected_challenge=state["challenge"],
            expected_rp_id=config.rp_id(),
            expected_origin=config.allowed_origins(),
            credential_public_key=passkey.public_key,
            credential_current_sign_count=passkey.sign_count,
            require_user_verification=True,
        )
    except Exception as error:
        record(db, "login", False, type(error).__name__)
        raise HTTPException(401, "Sign-in failed.") from None
    passkey.sign_count = verified.new_sign_count
    passkey.last_used_at = now()
    # Rotate: whatever session this browser had is revoked; a fresh one is issued.
    old = request.cookies.get(cookie_name())
    if old:
        prev = db.scalar(select(AuthSession).where(AuthSession.token_hash == sha256(old)))
        if prev is not None and prev.revoked_at is None:
            prev.revoked_at = now()
    db.commit()
    token = create_session(db, passkey.id, request.headers.get("user-agent"))
    set_cookie(response, token)
    record(db, "login", True, f"passkey {passkey.id}")
    return {"ok": True}


@router.post("/logout")
def logout(request: Request, response: Response, db: DB) -> dict:
    token = request.cookies.get(cookie_name())
    if token:
        s = db.scalar(select(AuthSession).where(AuthSession.token_hash == sha256(token)))
        if s is not None and s.revoked_at is None:
            s.revoked_at = now()
            db.commit()
            record(db, "logout", True)
    clear_cookie(response)
    return {"ok": True}


# ---------------------------------------------------------------- TOTP and recovery codes


class CodeIn(BaseModel):
    code: str = Field(min_length=1, max_length=40)


@router.post("/enroll/start")
def enroll_start(body: CodeIn, db: DB) -> dict:
    """A TOTP, recovery or device code buys one passkey enrollment (5 minutes). Never a
    session."""
    check_lock(db, "enroll")
    cfg = auth_config(db)
    via = "device code" if DEVICE_CODE.take(body.code) else None
    if via is None and cfg.totp_secret:
        step = totp_verify(cfg.totp_secret, body.code, cfg.totp_last_step)
        if step is not None:
            cfg.totp_last_step = step
            via = "totp"
    if via is None and take_recovery_code(db, body.code):
        via = "recovery code"
    db.commit()
    if via is None:
        record(db, "enroll", False)
        raise HTTPException(403, "That code is not right, or it was already used.")
    record(db, "enroll", True, via)
    return {"enroll_token": ENROLL_GRANTS.put({"via": via})}


@router.post("/totp/setup")
def totp_setup(_: SessionDep, db: DB) -> dict:
    """Starts (or replaces) the authenticator app. Active after /totp/confirm."""
    cfg = auth_config(db)
    secret = base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")
    cfg.totp_pending = secret
    db.commit()
    label = quote(f"{config.rp_name()}:owner")
    issuer = quote(config.rp_name())
    uri = f"otpauth://totp/{label}?secret={secret}&issuer={issuer}&digits=6&period=30"
    return {"secret": secret, "otpauth_uri": uri}


@router.post("/totp/confirm")
def totp_confirm(body: CodeIn, _: SessionDep, db: DB) -> dict:
    """Activates the pending secret and issues 10 recovery codes, shown this once."""
    cfg = auth_config(db)
    if not cfg.totp_pending:
        raise HTTPException(409, "Start authenticator setup first.")
    step = totp_verify(cfg.totp_pending, body.code, None)
    if step is None:
        raise HTTPException(400, "That code does not match. Check the phone's clock and retry.")
    cfg.totp_secret, cfg.totp_pending, cfg.totp_last_step = cfg.totp_pending, None, step
    db.commit()
    codes = new_recovery_codes(db)
    record(db, "totp_enabled", True)
    return {"recovery_codes": codes}


@router.post("/recovery/regenerate")
def recovery_regenerate(_: SessionDep, db: DB) -> dict:
    codes = new_recovery_codes(db)
    record(db, "recovery_regenerated", True)
    return {"recovery_codes": codes}


# ---------------------------------------------------------------- managing passkeys


def iso(dt: datetime | None) -> str | None:
    return aware(dt).isoformat() if dt else None


@router.get("/passkeys")
def list_passkeys(s: SessionDep, db: DB) -> list[dict]:
    """Every passkey, oldest first. `current` marks the one this session signed in with."""
    return [
        {
            "id": p.id,
            "name": p.name,
            "created_at": iso(p.created_at),
            "last_used_at": iso(p.last_used_at),
            "current": p.id == s.passkey_id,
        }
        for p in db.scalars(select(Passkey).order_by(Passkey.id))
    ]


def passkey_or_404(db: Session, passkey_id: int) -> Passkey:
    p = db.get(Passkey, passkey_id)
    if p is None:
        raise HTTPException(404, "No such passkey.")
    return p


class RenameIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)


@router.patch("/passkeys/{passkey_id}")
def rename_passkey(passkey_id: int, body: RenameIn, _: SessionDep, db: DB) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Give the passkey a name.")
    passkey_or_404(db, passkey_id).name = name
    db.commit()
    return {"ok": True}


class RemoveIn(BaseModel):
    recovery_code: str | None = Field(default=None, max_length=40)


@router.post("/passkeys/{passkey_id}/remove")
def remove_passkey(passkey_id: int, body: RemoveIn, s: SessionDep, db: DB) -> dict:
    """Removes a passkey and ends every session it signed in. The last passkey needs a
    recovery code (used up here); without any passkey, only the console setup code can create
    one again."""
    passkey = passkey_or_404(db, passkey_id)
    last = db.scalar(select(func.count(Passkey.id))) == 1
    if last:
        check_lock(db, "remove")
        if not body.recovery_code:
            raise HTTPException(
                409, "This is the only passkey. Enter a recovery code to remove it."
            )
        if not take_recovery_code(db, body.recovery_code):
            record(db, "remove", False, "recovery code")
            raise HTTPException(403, "That recovery code is not right, or it was already used.")
    t = now()
    for session in db.scalars(
        select(AuthSession).where(
            AuthSession.passkey_id == passkey.id, AuthSession.revoked_at.is_(None)
        )
    ):
        session.revoked_at = t
    signed_out = s.passkey_id == passkey.id or last
    if last:  # nothing can sign in any more: end every session
        for session in db.scalars(select(AuthSession).where(AuthSession.revoked_at.is_(None))):
            session.revoked_at = t
    db.delete(passkey)
    db.commit()
    record(db, "passkey_removed", True, "last, with recovery code" if last else None)
    return {"ok": True, "signed_out": signed_out}


@router.post("/device-code")
def device_code(_: SessionDep, db: DB) -> dict:
    """A one-time code for adding a passkey on another device. Five minutes, single use."""
    record(db, "device_code", True)
    return {"code": DEVICE_CODE.new(), "expires_in": CEREMONY_TTL}
