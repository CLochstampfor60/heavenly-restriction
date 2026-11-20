"""Run the server: `python -m app` (from backend\, or with PYTHONPATH=backend).

Binds 127.0.0.1:8000 by default. HR_BIND_HOST / HR_PORT override, but a non-loopback host is
refused unless HR_IN_CONTAINER=1 (the Dockerfile sets it; compose publishes on 127.0.0.1 only).
"""

import os
import sys

import uvicorn

from app.net import is_loopback


def main() -> int:
    host = os.environ.get("HR_BIND_HOST", "127.0.0.1")
    port = int(os.environ.get("HR_PORT", "8000"))
    if not is_loopback(host) and os.environ.get("HR_IN_CONTAINER") != "1":
        print(
            f"Refusing to bind {host}: outside the container the app serves loopback only "
            "(use tailscale serve for the phone).",
            file=sys.stderr,
        )
        return 2
    uvicorn.run("app.main:app", host=host, port=port, proxy_headers=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
