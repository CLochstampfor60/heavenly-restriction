"""Database backups to a folder that leaves this machine (a synced cloud folder, later the NAS).

    python scripts/windows/backup_db.py backup [--reason daily|deploy|migrate|manual]
    python scripts/windows/backup_db.py verify         newest backup: age and integrity (doctor)
    python scripts/windows/backup_db.py restore-test   restore the newest into a scratch copy
    python scripts/windows/backup_db.py prune          apply the retention rule only

The folder is HR_BACKUP_DIR in .env (local only; never in the repository). The database is
DATABASE_URL in .env, else data/hr.db.

How a backup is made: SQLite's online backup API copies the live database into a local
temporary file (a consistent snapshot even while the server writes), PRAGMA integrity_check runs
on it, and only then is it copied into the backup folder under a temporary name and renamed.
The sync client therefore never sees a half-written file.

Retention: the newest backup of each of the 14 most recent days that have one, plus the newest
of each of the 8 most recent ISO weeks that have one. The newest backup is never deleted. Only
files named hr-YYYYMMDD-HHMMSS[-reason].db in the backup folder are ever deleted.

Prints no database content: only file names, sizes, ages and row counts.
"""

import argparse
import json
import os
import re
import shutil
import sqlite3
import tempfile
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
NAME = re.compile(r"^hr-(\d{8})-(\d{6})(?:-([a-z]+))?\.db$")
KEEP_DAYS = 14
KEEP_WEEKS = 8
REASONS = ("daily", "deploy", "migrate", "manual")


def env_value(name: str) -> str | None:
    try:
        for line in (REPO / ".env").read_text(encoding="utf-8").splitlines():
            key, _, value = line.partition("=")
            if key.strip() == name:
                return value.strip().strip('"') or None
    except OSError:
        pass
    return None


def database_path() -> Path:
    url = env_value("DATABASE_URL") or ""
    if url.startswith("sqlite:///"):
        path = Path(url.removeprefix("sqlite:///"))
        return path if path.is_absolute() else (REPO / "backend" / path).resolve()
    return REPO / "data" / "hr.db"


def backup_dir() -> Path | None:
    value = env_value("HR_BACKUP_DIR")
    return Path(value) if value else None


def scratch_dir() -> Path:
    base = Path(os.environ.get("LOCALAPPDATA") or tempfile.gettempdir()) / "HeavenlyRestriction"
    path = base / "tmp"
    path.mkdir(parents=True, exist_ok=True)
    return path


def backups(folder: Path) -> list[tuple[datetime, Path]]:
    """(time from the file name, path), newest first. Names, not file times: a sync client may
    change those."""
    found = []
    if folder.is_dir():
        for path in folder.iterdir():
            m = NAME.match(path.name)
            if m and path.is_file():
                found.append((datetime.strptime(m[1] + m[2], "%Y%m%d%H%M%S"), path))
    return sorted(found, reverse=True)


def integrity(path: Path) -> str:
    db = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    try:
        return db.execute("PRAGMA integrity_check").fetchone()[0]
    finally:
        db.close()


def snapshot(source: Path, target: Path) -> None:
    src = sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True)
    dst = sqlite3.connect(target)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()


def keep_set(found: list[tuple[datetime, Path]]) -> set[Path]:
    keep: set[Path] = set()
    if not found:
        return keep
    keep.add(found[0][1])  # never delete the newest
    days, weeks = [], []
    for when, path in found:  # newest first, so the first of each day/week is its newest
        day = when.date()
        week = tuple(when.isocalendar()[:2])
        if day not in days and len(days) < KEEP_DAYS:
            days.append(day)
            keep.add(path)
        if week not in weeks and len(weeks) < KEEP_WEEKS:
            weeks.append(week)
            keep.add(path)
    return keep


def prune(folder: Path) -> list[str]:
    found = backups(folder)
    keep = keep_set(found)
    removed = []
    for _, path in found:
        if path not in keep:
            path.unlink()
            removed.append(path.name)
    return removed


def make_backup(reason: str = "manual") -> dict:
    """Snapshot, check, copy into the backup folder, prune. Raises on any failure."""
    folder = backup_dir()
    if not folder:
        raise RuntimeError("HR_BACKUP_DIR is not set in .env")
    source = database_path()
    if not source.is_file():
        raise RuntimeError(f"no database at {source}")
    folder.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    name = f"hr-{stamp}-{reason}.db"
    local = scratch_dir() / f"snapshot-{stamp}.db"
    try:
        snapshot(source, local)
        result = integrity(local)
        if result != "ok":
            raise RuntimeError(f"the snapshot failed its integrity check: {result}")
        partial = folder / (name + ".partial")
        shutil.copyfile(local, partial)
        os.replace(partial, folder / name)
    finally:
        local.unlink(missing_ok=True)
    removed = prune(folder)
    return {"file": name, "bytes": (folder / name).stat().st_size, "pruned": removed}


def verify() -> dict:
    """The newest backup: name, age in hours, integrity (checked on a local copy)."""
    folder = backup_dir()
    if not folder:
        return {"ok": False, "problem": "HR_BACKUP_DIR is not set in .env"}
    found = backups(folder)
    if not found:
        return {"ok": False, "problem": "no backups in the backup folder"}
    when, path = found[0]
    age = (datetime.now() - when).total_seconds() / 3600
    copy = scratch_dir() / f"verify-{os.getpid()}.db"
    try:
        shutil.copyfile(path, copy)
        result = integrity(copy)
    except (OSError, sqlite3.Error) as error:
        result = f"could not read it ({type(error).__name__})"
    finally:
        copy.unlink(missing_ok=True)
    return {
        "ok": result == "ok",
        "file": path.name,
        "age_hours": round(age, 1),
        "count": len(found),
        "integrity": result,
    }


def counts(path: Path) -> dict:
    db = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    try:
        return {
            t: db.execute(f"SELECT count(*) FROM {t}").fetchone()[0]  # noqa: S608 (fixed names)
            for t in ("workout_session", "set_log", "stop_event", "body_metric")
        }
    finally:
        db.close()


def restore_test() -> dict:
    """Restores the newest backup into a scratch copy (never over the live database), opens
    it, compares row counts with the live database, then deletes the scratch copy."""
    folder = backup_dir()
    found = backups(folder) if folder else []
    if not found:
        raise RuntimeError("no backup to restore")
    _, path = found[0]
    scratch = Path(tempfile.mkdtemp(prefix="hr-restore-", dir=scratch_dir()))
    restored = scratch / "restored.db"
    try:
        shutil.copyfile(path, restored)
        result = integrity(restored)
        restored_counts = counts(restored)
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    return {
        "backup": path.name,
        "integrity": result,
        "restored": restored_counts,
        "live": counts(database_path()),
        "scratch_deleted": not scratch.exists(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("command", choices=("backup", "verify", "restore-test", "prune"))
    parser.add_argument("--reason", choices=REASONS, default="manual")
    args = parser.parse_args()
    try:
        if args.command == "backup":
            out = make_backup(args.reason)
        elif args.command == "verify":
            out = verify()
        elif args.command == "restore-test":
            out = restore_test()
        else:
            folder = backup_dir()
            if not folder:
                raise RuntimeError("HR_BACKUP_DIR is not set in .env")
            out = {"pruned": prune(folder)}
    except (RuntimeError, OSError, sqlite3.Error) as error:
        print(json.dumps({"ok": False, "problem": str(error)}))
        return 1
    print(json.dumps(out))
    if args.command == "verify":
        return 0 if out["ok"] else 1
    if args.command == "restore-test":
        return 0 if out["integrity"] == "ok" else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
