# heavenly-restriction
A self-hosted workout tracker for training hard within injury limits. FastAPI + PWA, offline logging, passkey login, private by design.

## Status
Early build. Today's workout, set logging, the exercise library and exercise cards read the program from the API (imported from your spreadsheet; see below). Sessions are kept in the browser's IndexedDB first and synced to the server when online, so logging works on a weak signal. Progress still shows made-up sample data. Settings › Demo data switches to a made-up program for screenshots, kept apart from real sessions. No login, program editing or media upload yet.

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

Database and program import (required once, and again whenever the spreadsheet changes). Copy `.env.example` to `.env` first and set `DATABASE_URL` and `PROGRAM_XLSX_PATH`; the spreadsheet stays outside the repo:

```powershell
.\.venv\Scripts\alembic -c backend\alembic.ini upgrade head
.\.venv\Scripts\python -m app.importer
```

Run the importer from `backend\` (or set `$env:PYTHONPATH = "backend"`). Re-running updates the same program version. Anything it cannot map cleanly is listed in `internal_docs\import-obstacles.md` (local only) instead of being guessed.

Checks before committing:

```powershell
.\.venv\Scripts\pre-commit run --all-files
.\.venv\Scripts\python -m pytest
```

## Credits
Design and development by Carl Lochstampfor ([CLochstampfor60](https://github.com/CLochstampfor60)).

Built with help from Claude by Anthropic.

Copyright (c) 2026 Carl Lochstampfor (CLochstampfor60). Released under the MIT License; see [LICENSE](LICENSE).
