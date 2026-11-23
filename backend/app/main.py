"""Heavenly Restriction API. Serves the built PWA from the same origin."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles

from app.api import router
from app.auth import SETUP, OriginCheck, require_session
from app.auth import router as auth_router
from app.headers import SecurityHeaders
from app.net import LoopbackOnly
from app.progress import router as progress_router

# HR_FRONTEND_DIST lets a test server serve a different build (e.g. to check the update prompt).
FRONTEND_DIST = Path(
    os.environ.get("HR_FRONTEND_DIST") or Path(__file__).resolve().parents[2] / "frontend" / "dist"
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Prints the first-run setup code in the console while no passkey exists.
    from app.db import SessionLocal

    try:
        with SessionLocal() as db:
            SETUP.ensure(db)
    except Exception as error:  # e.g. migrations not run yet; status/login will report it
        print(f"Could not check for passkeys at startup: {error}")
    yield


class App(FastAPI):
    """FastAPI with SecurityHeaders outside Starlette's own error handler, so an unhandled 500
    carries the headers too (as middleware it would sit inside that handler and miss it)."""

    def build_middleware_stack(self):
        return SecurityHeaders(super().build_middleware_stack())


# No /docs, /redoc or /openapi.json: they would publish the whole API map without a session.
app = App(
    title="Heavenly Restriction", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None
)
# Middleware added later runs first: loopback, then Origin. SecurityHeaders wraps all (App above).
app.add_middleware(OriginCheck)
app.add_middleware(LoopbackOnly)

# Public: health and the sign-in endpoints. Everything else needs a session.
app.include_router(auth_router)
signed_in = [Depends(require_session)]
app.include_router(router, dependencies=signed_in)
app.include_router(progress_router, dependencies=signed_in)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Mounted last so /api routes win. Absent until `npm run build` has run. The PWA shell holds
# no data; everything it shows comes from the session-protected API.
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
