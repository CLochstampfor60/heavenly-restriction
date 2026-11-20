"""Heavenly Restriction API. Serves the built PWA from the same origin."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api import router
from app.net import LoopbackOnly
from app.progress import router as progress_router

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

app = FastAPI(title="Heavenly Restriction")
app.add_middleware(LoopbackOnly)
app.include_router(router)
app.include_router(progress_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Mounted last so /api routes win. Absent until `npm run build` has run.
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
