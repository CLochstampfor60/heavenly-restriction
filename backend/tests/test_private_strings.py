"""The leak-guard hook blocks a staged line containing a listed string (fake values only)."""

import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "check_private_strings.py"


def run(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args], cwd=repo, capture_output=True, text=True
    )


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)


def make_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init", "-q")
    (repo / "internal_docs").mkdir()
    (repo / "internal_docs" / "private-strings.txt").write_text(
        "# fake entries for the test\nzebra-quartz-7731\nCAP 999 LB\n", encoding="utf-8"
    )
    return repo


def test_blocks_staged_private_string(tmp_path: Path) -> None:
    repo = make_repo(tmp_path)
    (repo / "notes.md").write_text("fine line\nsee Zebra-Quartz-7731 here\n", encoding="utf-8")
    git(repo, "add", "notes.md")
    result = run(repo)
    assert result.returncode == 1
    assert "notes.md:2" in result.stdout
    assert "zebra-quartz-7731" not in result.stdout.lower()  # masked in the output


def test_passes_clean_change(tmp_path: Path) -> None:
    repo = make_repo(tmp_path)
    (repo / "notes.md").write_text("nothing private here\n", encoding="utf-8")
    git(repo, "add", "notes.md")
    assert run(repo).returncode == 0


def test_only_added_lines_count(tmp_path: Path) -> None:
    repo = make_repo(tmp_path)
    (repo / "notes.md").write_text("cap 999 lb\n", encoding="utf-8")
    git(repo, "add", "notes.md")
    git(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "x")
    (repo / "notes.md").write_text("cap 999 lb\nnew clean line\n", encoding="utf-8")
    git(repo, "add", "notes.md")
    assert run(repo).returncode == 0  # the old line is not part of this change
    assert run(repo, "--all").returncode == 1  # but an audit finds it


def test_skips_without_list(tmp_path: Path) -> None:
    repo = tmp_path / "bare"
    repo.mkdir()
    git(repo, "init", "-q")
    result = run(repo)
    assert result.returncode == 0 and "skipped" in result.stdout
