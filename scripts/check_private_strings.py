"""Leak guard: fail when a staged change adds a private string.

The strings live in internal_docs/private-strings.txt, which is gitignored and never committed:
one per line, matched case-insensitively as substrings, # starts a comment. Without the file
(a fresh clone, CI) the check is skipped with a note.

    python scripts/check_private_strings.py          # staged added lines (the pre-commit hook)
    python scripts/check_private_strings.py --all    # every tracked file, for an audit

Matches are reported by file and line with the string masked, so the output is safe to share.
Binary files (images, .xlsx) are not text-scanned; check those by eye.
"""

import argparse
import subprocess
import sys
from pathlib import Path

DEFAULT_LIST = Path("internal_docs/private-strings.txt")


def load(path: Path) -> list[str]:
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            out.append(line.lower())
    return out


def mask(s: str) -> str:
    return s[:2] + "*" * max(3, len(s) - 2)


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], check=True, capture_output=True, text=True, encoding="utf-8",
        errors="replace",
    ).stdout  # fmt: skip


def staged_lines() -> list[tuple[str, int, str]]:
    """(file, new line number, text) for every line a staged change adds."""
    diff = git("diff", "--cached", "-U0", "--no-color", "--no-ext-diff")
    out, path, line_no = [], None, 0
    for raw in diff.splitlines():
        if raw.startswith("+++ "):
            path = raw[6:] if raw.startswith("+++ b/") else None
        elif raw.startswith("@@"):
            # @@ -a,b +c,d @@
            plus = raw.split("+", 1)[1].split(" ", 1)[0]
            line_no = int(plus.split(",")[0])
        elif raw.startswith("+") and path:
            out.append((path, line_no, raw[1:]))
            line_no += 1
    return out


def tracked_lines() -> list[tuple[str, int, str]]:
    out = []
    for path in git("ls-files", "-z").split("\0"):
        if not path:
            continue
        try:
            text = Path(path).read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue  # binary or unreadable
        out.extend((path, k, line) for k, line in enumerate(text.splitlines(), start=1))
    return out


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--list", type=Path, default=DEFAULT_LIST)
    parser.add_argument("--all", action="store_true", help="scan every tracked file")
    args = parser.parse_args(argv)
    if not args.list.is_file():
        print(f"private-strings: no {args.list}; skipped.")
        return 0
    needles = load(args.list)
    lines = tracked_lines() if args.all else staged_lines()
    hits = [
        (path, n, needle) for path, n, text in lines for needle in needles if needle in text.lower()
    ]
    for path, n, needle in hits:
        print(f"{path}:{n}: contains a private string ({mask(needle)})")
    if hits:
        print(
            f"private-strings: {len(hits)} match(es). Remove them, or if a line is a false "
            f"positive, narrow the entry in {args.list}."
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
