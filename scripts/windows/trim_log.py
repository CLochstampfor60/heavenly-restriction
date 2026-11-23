"""Drops access lines with full /api/ paths from server.log and server.log.1.

    python scripts/windows/trim_log.py

Run by `server.ps1 trim-log`, which stops the server first: the server writes through a held
handle at its own position, so shortening the file under it would leave a gap. Every other line
is kept byte for byte. Only counts are printed, never log content.

Lines written since the access-log filter (backend/app/accesslog.py) already have the short form
(/api/sessions/..., /api/today?...); this removes older ones.
"""

import os
import re
import sys
from pathlib import Path

LOGS = Path(os.environ["LOCALAPPDATA"]) / "HeavenlyRestriction" / "logs"
ACCESS = re.compile(rb'"(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) (\S+) HTTP/')
SAFE = re.compile(rb"/api/[^/?]+(/\.\.\.)?(\?\.\.\.)?")


def unsafe(line: bytes) -> bool:
    m = ACCESS.search(line)
    if not m:
        return False
    path = m.group(1)
    return path.startswith(b"/api/") and not SAFE.fullmatch(path)


for name in ("server.log", "server.log.1"):
    path = LOGS / name
    if not path.exists():
        print(f"{name}: absent")
        continue
    data = path.read_bytes()
    lines = data.split(b"\n")
    kept = [line for line in lines if not unsafe(line)]
    dropped = len(lines) - len(kept)
    if any(unsafe(line) for line in kept):
        sys.exit("internal error: an unsafe line survived")
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(b"\n".join(kept))
    os.replace(tmp, path)
    print(f"{name}: {len(lines)} lines, dropped {dropped}, kept {len(kept)}")
