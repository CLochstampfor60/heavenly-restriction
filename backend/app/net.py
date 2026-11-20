"""Network exposure guards: the app serves loopback only.

Real data must never be reachable on the LAN. Two layers:
- `python -m app` binds 127.0.0.1 and refuses any other address outside the container.
- Every request whose socket peer is not loopback gets 403. `tailscale serve` proxies from
  127.0.0.1, so tailnet access still works. In Docker, requests arrive from the bridge network,
  so compose sets HR_ALLOW_REMOTE_CLIENTS=1 and publishes the port on 127.0.0.1 only.
Forwarded headers are ignored on purpose: only the real socket peer counts.
"""

import ipaddress
import os

from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Receive, Scope, Send


def is_loopback(host: str | None) -> bool:
    if not host:
        return False
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return host == "localhost"


def remote_clients_allowed() -> bool:
    return os.environ.get("HR_ALLOW_REMOTE_CLIENTS") == "1"


class LoopbackOnly:
    """ASGI middleware: 403 for any HTTP request not from a loopback address."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and not remote_clients_allowed():
            client = scope.get("client")
            if not is_loopback(client[0] if client else None):
                response = PlainTextResponse("Forbidden: this app only answers on loopback.", 403)
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)
