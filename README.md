# heavenly-restriction
A self-hosted workout tracker for training hard within injury limits. FastAPI + PWA, offline logging, passkey login, private by design.

## Status
Early build. Today's workout and set logging run on made-up demo data held in memory (a reload resets it). No API data, offline storage, login or Settings screen yet.

## Run it locally (PowerShell)
Requires Python 3.12 (the version the container will run; the venv must be built with it) and Node.js 20 or later.

One-time setup, from the repo root:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\pip install -r backend\requirements-dev.txt
.\.venv\Scripts\pre-commit install
npm --prefix frontend install
```

Frontend with live reload, at http://localhost:5173:

```powershell
npm --prefix frontend run dev
```

Production-style, one origin (FastAPI serves the built app and `/api`), at http://127.0.0.1:8000:

```powershell
npm --prefix frontend run build
.\.venv\Scripts\python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Checks before committing:

```powershell
.\.venv\Scripts\pre-commit run --all-files
.\.venv\Scripts\python -m pytest
```

Theme and accent follow `localStorage` keys `hr-theme` (`system`, `dark`, `light`) and `hr-accent` (`green`, `plum`, `blue`) until the Settings screen exists.

## Credits
Made by Carl Lochstampfor ([CLochstampfor60](https://github.com/CLochstampfor60)).

Copyright (c) 2026 Carl Lochstampfor (CLochstampfor60). Released under the MIT License; see [LICENSE](LICENSE).
