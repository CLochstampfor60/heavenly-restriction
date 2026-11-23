"""Keeps the app server running on Windows, with no console window anywhere.

Started by the "HeavenlyRestriction Server" scheduled task as `.venv\\Scripts\\pythonw.exe
scripts\\windows\\supervise.py` (pythonw has no console). It runs `python -m app` (127.0.0.1:8000
only) with CREATE_NO_WINDOW in its own process group, so there is no window to close and no
console to send Ctrl+C to, and it starts the server again after every exit, whatever the
reason. Each start and exit goes to server.log with the reason in plain words; the last exit is
also written to state.json for `server.ps1 status`.

The server needs no network (it listens on loopback), so it starts at once. A second thread
waits for the tailnet: it checks /api/health over https://<WEBAUTHN_RP_ID> (from .env) every
15 s until it answers, then every minute, and logs each change (reachable or not, and why) to
tailnet.log, including how long after the supervisor started it first answered. It never
changes anything. `server.ps1 status` and `doctor` show the result.

Files (outside the repo): %LOCALAPPDATA%\\HeavenlyRestriction\\logs\\server.log (rolled to
server.log.1 at 5 MB), logs\\tailnet.log (same), %LOCALAPPDATA%\\HeavenlyRestriction\\state.json,
and supervisor.lock, which keeps a second supervisor from starting.
"""

import json
import msvcrt
import os
import ssl
import subprocess
import threading
import time
import urllib.request
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PYTHON = REPO / ".venv" / "Scripts" / "python.exe"
HOME = Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "HeavenlyRestriction"
LOG = HOME / "logs" / "server.log"
STATE = HOME / "state.json"
LOCK = HOME / "supervisor.lock"
TAILNET_LOG = HOME / "logs" / "tailnet.log"
ENV_FILE = REPO / ".env"

DELAY = 5  # seconds before starting again
FAST_RUN = 30  # a run shorter than this counts as a fast failure
FAST_LIMIT = 5  # after this many fast failures in a row...
BACKOFF = 60  # ...wait this long instead, so a broken setup does not spin
ROLL_AT = 5 * 1024 * 1024

CREATE_NO_WINDOW = 0x08000000
CREATE_NEW_PROCESS_GROUP = 0x00000200

REASONS = {
    0: "exited normally",
    1: "stopped with an error, or was ended by taskkill /F",
    2: "refused to start (bind address is not loopback)",
    0xC000013A: "closed by Ctrl+C or by its console window closing",
    0x40010004: "ended by sign-out or shutdown",
    0xC0000005: "crashed (access violation)",
    0xFFFFFFFF: "ended by Task Manager or Stop-Process",
}


def describe(code: int) -> str:
    """An exit code in plain words, with the number."""
    code &= 0xFFFFFFFF
    words = REASONS.get(code, "exited unexpectedly")
    return f"{words} (exit code {code}, 0x{code:08X})"


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def log(message: str) -> None:
    with open(LOG, "a", encoding="ascii", errors="replace") as f:
        f.write(f"{now()} [supervisor] {message}\n")


_state_lock = threading.Lock()


def save_state(**fields) -> None:
    with _state_lock:
        _save_state(**fields)


def _save_state(**fields) -> None:
    state = {}
    try:
        state = json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    state.update(fields)
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2), encoding="utf-8")
    os.replace(tmp, STATE)


def tailnet_log(message: str) -> None:
    with open(TAILNET_LOG, "a", encoding="ascii", errors="replace") as f:
        f.write(f"{now()} {message}\n")


def service_host() -> str | None:
    """WEBAUTHN_RP_ID from .env: the service hostname the phone uses."""
    try:
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            key, _, value = line.partition("=")
            if key.strip() == "WEBAUTHN_RP_ID":
                value = value.strip().strip('"')
                return value if value and value != "localhost" else None
    except OSError:
        pass
    return None


def tailscale_state() -> str:
    """Tailscale's backend state ("Running", "Stopped", ...) or why it could not be read."""
    try:
        out = subprocess.run(
            ["tailscale", "status", "--json"],
            capture_output=True,
            timeout=15,
            creationflags=CREATE_NO_WINDOW,
        )
        return json.loads(out.stdout).get("BackendState", "unknown")
    except FileNotFoundError:
        return "tailscale not found"
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        return f"unreadable ({type(error).__name__})"


def check_tailnet(host: str) -> tuple[bool, str]:
    """Is /api/health answering over the tailnet? (ok, reason in words)."""
    try:
        with urllib.request.urlopen(
            f"https://{host}/api/health", timeout=10, context=ssl.create_default_context()
        ) as r:
            if json.loads(r.read()).get("status") == "ok":
                return True, "health ok over HTTPS"
            return False, "health answered but not ok"
    except Exception as error:  # any failure is "not reachable"; the reason is logged
        reason = getattr(error, "reason", error)
        state = tailscale_state()
        return False, f"no answer ({type(error).__name__}: {reason}); Tailscale state: {state}"


def watch_tailnet(started: float) -> None:
    """Logs when the app becomes reachable over the tailnet, and every change after that."""
    host = service_host()
    if not host:
        tailnet_log("not checked: WEBAUTHN_RP_ID in .env is not the service hostname")
        return
    tailnet_log("waiting for the tailnet (checks /api/health at the service hostname)")
    time.sleep(5)  # let the server finish starting, so the first result is about the tailnet
    last = None
    first_ok = True
    while True:
        try:
            ok, reason = check_tailnet(host)
        except Exception as error:  # never let the watcher die
            ok, reason = False, f"check failed: {error!r}"
        if ok != last:
            if ok and first_ok:
                after = time.monotonic() - started
                tailnet_log(f"reachable: {reason}, {after:.0f} s after the supervisor started")
                first_ok = False
            else:
                tailnet_log(("reachable: " if ok else "NOT reachable: ") + reason)
            last = ok
        try:
            save_state(tailnet_ok=ok, tailnet_reason=reason, tailnet_checked_at=now())
        except OSError:
            pass
        time.sleep(60 if ok else 15)


def roll_log() -> None:
    try:
        for path in (LOG, TAILNET_LOG):
            if path.exists() and path.stat().st_size > ROLL_AT:
                os.replace(path, path.with_suffix(".log.1"))
    except OSError:
        pass


def run_once() -> tuple[int, float]:
    """Starts the server, waits for it to exit, returns (exit code, seconds it ran)."""
    env = dict(os.environ, HR_BIND_HOST="127.0.0.1", PYTHONUNBUFFERED="1")
    # Log before the server opens the file: it writes through an inherited handle at that
    # handle's own position, so a line appended while it runs would be written over. Its own
    # "Started server process [pid]" line records the pid.
    log("starting the server on 127.0.0.1:8000")
    started = time.monotonic()
    with open(LOG, "ab") as out:
        server = subprocess.Popen(
            [str(PYTHON), "-m", "app"],
            cwd=REPO / "backend",
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=out,
            stderr=subprocess.STDOUT,
            creationflags=CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP,
        )
        save_state(server_pid=server.pid, server_started_at=now())
        code = server.wait()
    return code, time.monotonic() - started


def main() -> int:
    HOME.mkdir(parents=True, exist_ok=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    lock = open(LOCK, "a+b")  # held for the life of this process
    try:
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        log("another supervisor is already running; this one exits")
        return 0
    log(f"supervisor started (pid {os.getpid()})")
    # The last exit stays (it may explain why the previous supervisor stopped); the count resets.
    save_state(supervisor_pid=os.getpid(), supervisor_started_at=now(), restarts=0)
    started = time.monotonic()
    threading.Thread(target=watch_tailnet, args=(started,), daemon=True).start()
    restarts = 0
    fast = 0
    while True:
        roll_log()
        try:
            code, ran = run_once()
        except Exception as error:  # keep supervising whatever went wrong
            try:
                log(f"could not run the server: {error!r}; trying again in {BACKOFF} s")
            except OSError:
                pass
            time.sleep(BACKOFF)
            continue
        reason = describe(code)
        fast = fast + 1 if ran < FAST_RUN else 0
        wait = BACKOFF if fast >= FAST_LIMIT else DELAY
        restarts += 1
        log(f"server {reason} after {ran:.0f} s; restart {restarts} in {wait} s")
        save_state(
            server_pid=None,
            last_exit_code=code & 0xFFFFFFFF,
            last_exit_reason=reason,
            last_exit_at=now(),
            restarts=restarts,
        )
        time.sleep(wait)


if __name__ == "__main__":
    raise SystemExit(main())
