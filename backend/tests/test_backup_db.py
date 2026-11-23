"""Off-machine backups: snapshot, check, copy, retention (made-up databases in tmp folders)."""

import importlib.util
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "windows" / "backup_db.py"
spec = importlib.util.spec_from_file_location("backup_db", SCRIPT)
backup_db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup_db)


def make_db(path: Path, sessions: int = 3, sets: int = 7) -> Path:
    db = sqlite3.connect(path)
    for table in ("workout_session", "set_log", "stop_event", "body_metric"):
        db.execute(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY)")
    db.executemany("INSERT INTO workout_session DEFAULT VALUES", [()] * sessions)
    db.executemany("INSERT INTO set_log DEFAULT VALUES", [()] * sets)
    db.commit()
    db.close()
    return path


@pytest.fixture
def setup(tmp_path, monkeypatch):
    live = make_db(tmp_path / "live.db")
    folder = tmp_path / "off machine" / "backups"  # a space, like the real synced path
    monkeypatch.setattr(backup_db, "database_path", lambda: live)
    monkeypatch.setattr(backup_db, "backup_dir", lambda: folder)
    monkeypatch.setattr(backup_db, "scratch_dir", lambda: tmp_path)
    return live, folder


def touch(folder: Path, when: datetime, reason: str = "daily") -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"hr-{when:%Y%m%d-%H%M%S}-{reason}.db"
    path.write_bytes(b"")
    return path


def test_backup_makes_a_checked_copy_and_leaves_no_partial_or_snapshot(setup, tmp_path) -> None:
    live, folder = setup
    out = backup_db.make_backup("deploy")
    assert out["file"].endswith("-deploy.db")
    files = list(folder.iterdir())
    assert [f.name for f in files] == [out["file"]]
    assert backup_db.integrity(files[0]) == "ok"
    assert not list(tmp_path.glob("snapshot-*.db"))
    assert backup_db.verify()["ok"] is True


def test_verify_fails_when_missing_old_or_corrupt(setup) -> None:
    _, folder = setup
    assert backup_db.verify()["ok"] is False  # none yet
    old = touch(folder, datetime.now() - timedelta(hours=40))
    old.write_bytes(b"not a database" * 100)
    result = backup_db.verify()
    assert result["ok"] is False and result["age_hours"] >= 40


def test_restore_test_matches_live_counts_and_deletes_scratch(setup) -> None:
    backup_db.make_backup("manual")
    out = backup_db.restore_test()
    assert out["integrity"] == "ok"
    assert (
        out["restored"]
        == out["live"]
        == {
            "workout_session": 3,
            "set_log": 7,
            "stop_event": 0,
            "body_metric": 0,
        }
    )
    assert out["scratch_deleted"] is True


def test_retention_keeps_14_days_and_8_weeks_and_never_the_newest() -> None:
    start = datetime(2026, 1, 1, 3, 0, 0)
    found = []
    for day in range(120):  # two backups a day for 120 days
        for hour in (3, 15):
            when = start + timedelta(days=day, hours=hour - 3)
            found.append((when, Path(f"hr-{when:%Y%m%d-%H%M%S}-daily.db")))
    found.sort(reverse=True)
    keep = backup_db.keep_set(found)
    newest = found[0][1]
    assert newest in keep
    kept_days = {w.date() for w, p in found if p in keep}
    last_14 = sorted({w.date() for w, _ in found}, reverse=True)[:14]
    assert set(last_14) <= kept_days
    kept_weeks = {tuple(w.isocalendar()[:2]) for w, p in found if p in keep}
    assert len(kept_weeks) == 8
    # one file per kept day: the newest of that day
    assert len(keep) <= 14 + 8


def test_prune_deletes_only_backup_names(setup) -> None:
    _, folder = setup
    now = datetime.now()
    for d in range(40):
        touch(folder, now - timedelta(days=d))
    other = folder / "notes.txt"
    other.write_text("keep me")
    removed = backup_db.prune(folder)
    assert removed and other.exists()
    left = backup_db.backups(folder)
    assert left[0][0].date() == now.date()
    assert len(left) <= 14 + 8


def test_a_single_backup_is_never_pruned(setup) -> None:
    _, folder = setup
    only = touch(folder, datetime(2020, 1, 1))
    assert backup_db.prune(folder) == []
    assert only.exists()
