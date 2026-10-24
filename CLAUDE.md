# Heavenly Restriction — project rules for Claude Code

Single-user, self-hosted workout tracker. Replaces the owner's Excel program (v6.0).
Full scope: "Heavenly Restriction — Scope v0.1" (Claude doc). This file is the short version.

## What it is
- Python FastAPI backend + small PWA frontend, served from ONE origin (no Netlify, no CORS).
- Runs in Docker Compose on Moria (Windows 11 workstation) now; moves unchanged to Gondor (NAS, Linux) later.
- Phone: Galaxy S23, Brave browser, installed as a PWA. Remote access only through Tailscale; HTTPS via `tailscale serve`.
- One user. No accounts system, no social features, no third-party services or paid APIs.

## Stack
- Backend: Python 3.12, FastAPI, SQLAlchemy 2 + Alembic, SQLite. Must run on Windows 11 and Linux.
- Frontend: small PWA (Preact or Svelte), IndexedDB via Dexie for offline set logging. Keep logic in the backend.
- Auth: passkey (WebAuthn, py_webauthn) unlocked by fingerprint; session lasts ~30 days. TOTP as backup.
- Lint/format: ruff. Tests: pytest.

## MVP features (build in this order)
1. Today's workout: program order, "Later" (move to bottom), "Swap" (same muscle category; log under the exercise actually done), Done/Skipped/Swapped.
2. Set logging with faded prior values (placeholder = last time's weight x reps for the same exercise AND set number; one tap accepts). Optional RIR. Rest timer on set check-off.
3. Exercise library grouped by body region > muscle. Cards: equipment, pinned notes, media, video links, history.
4. Notes: pinned (follow the exercise) and session (one workout).
5. Stop button: ends the exercise, records symptom, load, set.
6. Video links: YouTube via privacy-enhanced embed; other sites open in a new tab.
7. "What I brought today" toggles (Bands, Hip Halo, Straps).
8. Progress: Week / Month / Year tabs, area chart with labeled points, dashed goal line; body metrics (waist, bodyweight).
Program edits create a new program_version; old logs stay tied to the version they used.

## Parking lot — do NOT build unless asked
Warmup Routine module, injury guardrails as enforced rules (they are pinned notes for now), scale/Fitbit import, Escanor theme.

## UI rules
- Before any UI work, read `docs/DESIGN.md` and `design-system/README.md`. Build only from `design-system/` tokens and `hr-` classes; Dark and Light themes both ship.
- Plain labels first on every screen; Jujutsu Kaisen theme names are secondary flavor only.
- Logging a set must take one or two taps. Usable one-handed, mid-workout, on weak signal.
- Icons and art are original designs. Never use Toji's likeness or official anime art.

## Security rules (public repo)
- NEVER commit: .env, secrets, keys, the database, data/, media/, real program or logs (they contain injury history), internal IPs, VLANs, machine names, tailnet name.
- Use placeholders in code and docs: app.example.ts.net, 192.168.x.x.
- New config values go in .env.example with a placeholder, never a real value.
- Strip EXIF from uploaded photos and videos.
- Demo/seed data is made up. Real data lives only on the server.
- Containers run unprivileged on their own Docker network. GitHub Actions use read-only permissions; never pull_request_target.
- If a secret is ever committed: stop, tell the owner, rotate it first, then scrub history.

## Working style
- `C:\Users\Carl\Desktop\repos\dev_workflow\CONVENTIONS.md` governs git and repo hygiene: explicit `git add <file>`, no AI co-author trailers, `internal_docs/` and `purgatory/` stay local.
- American English everywhere (color, behavior, center, license).
- Commands and code must work the first time; test before saying something works.
- Mark clearly what is required vs optional. No padded caveats.
- Small, focused commits. Run `pre-commit run --all-files` and `pytest` before committing.
