"""Copies the SQLite database to a backup file, safely while the server is running.

    python scripts/windows/backup_db.py <database> <backup file>

Uses SQLite's online backup API (a consistent snapshot even mid-write), then checks the copy
with PRAGMA integrity_check. Run through `server.ps1 backup`, which picks the paths.
"""

import sqlite3
import sys
from pathlib import Path


def main(source: str, target: str) -> int:
    src_path, dst_path = Path(source), Path(target)
    if not src_path.is_file():
        print(f"No database at {src_path}", file=sys.stderr)
        return 1
    if dst_path.exists():
        print(f"Refusing to overwrite {dst_path}", file=sys.stderr)
        return 1
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    src = sqlite3.connect(f"file:{src_path.as_posix()}?mode=ro", uri=True)
    dst = sqlite3.connect(dst_path)
    try:
        src.backup(dst)
        result = dst.execute("PRAGMA integrity_check").fetchone()[0]
    finally:
        dst.close()
        src.close()
    if result != "ok":
        print(f"The backup failed its integrity check: {result}", file=sys.stderr)
        return 1
    print(f"Backed up to {dst_path} ({dst_path.stat().st_size} bytes, integrity ok)")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1], sys.argv[2]))
