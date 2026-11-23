"""Is the database at the newest migration? Read-only; used by `server.ps1 doctor`.

    python scripts/windows/schema_check.py <database>

Prints "<database revision> <newest revision>" and exits 0 if they match, 1 if not, 2 if the
check itself failed.
"""

import sqlite3
import sys
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND = Path(__file__).resolve().parents[2] / "backend"


def main(database: str) -> int:
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "migrations"))
    heads = ScriptDirectory.from_config(config).get_heads()
    db = sqlite3.connect(f"file:{Path(database).as_posix()}?mode=ro", uri=True)
    try:
        rows = db.execute("SELECT version_num FROM alembic_version").fetchall()
    finally:
        db.close()
    current = sorted(r[0] for r in rows)
    print(f"{','.join(current) or 'none'} {','.join(sorted(heads))}")
    return 0 if current == sorted(heads) else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1]))
    except (IndexError, OSError, sqlite3.Error) as error:
        print(f"could not check: {error}")
        raise SystemExit(2) from None
