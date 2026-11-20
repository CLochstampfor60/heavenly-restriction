"""Settings read from the environment, with the repo-root .env loaded first if present.

Real values live only in .env (gitignored); .env.example holds placeholders.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]

# Variables already set in the environment (Docker Compose, tests) win over .env.
load_dotenv(REPO_ROOT / ".env", override=False)


def database_url() -> str:
    """SQLite URL. Defaults to data/hr.db in the repo, which is gitignored."""
    return (
        os.environ.get("DATABASE_URL") or f"sqlite:///{(REPO_ROOT / 'data' / 'hr.db').as_posix()}"
    )


def program_xlsx_path() -> Path | None:
    """The owner's program spreadsheet. It lives outside the repo and is never committed."""
    value = os.environ.get("PROGRAM_XLSX_PATH")
    return Path(value) if value else None


def obstacles_path() -> Path:
    """Where the importer writes what it could not map. internal_docs/ is gitignored."""
    value = os.environ.get("IMPORT_OBSTACLES_PATH")
    return Path(value) if value else REPO_ROOT / "internal_docs" / "import-obstacles.md"


# ---- Login (WebAuthn passkeys and sessions)


def rp_id() -> str:
    """WebAuthn relying-party ID: the hostname the phone uses. localhost in development."""
    return os.environ.get("WEBAUTHN_RP_ID") or "localhost"


def rp_name() -> str:
    return os.environ.get("WEBAUTHN_RP_NAME") or "Heavenly Restriction"


def allowed_origins() -> list[str]:
    """Origins allowed for WebAuthn and for state-changing requests (Origin check).

    APP_ORIGINS (comma-separated) wins. Otherwise: https://<rp id> in production; the local
    server and the Vite dev server for localhost.
    """
    value = os.environ.get("APP_ORIGINS")
    if value:
        return [o.strip().rstrip("/") for o in value.split(",") if o.strip()]
    rid = rp_id()
    if rid == "localhost":
        return ["http://localhost:8000", "http://localhost:5173"]
    return [f"https://{rid}"]


def cookie_secure() -> bool:
    """Secure cookies. Browsers accept them on http://localhost, so this stays on in dev."""
    return os.environ.get("COOKIE_SECURE", "1") != "0"


def session_days() -> float:
    return float(os.environ.get("SESSION_DAYS") or 30)


def session_idle_hours() -> float:
    return float(os.environ.get("SESSION_IDLE_HOURS") or 168)
