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
