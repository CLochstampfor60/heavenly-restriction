# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Before 1.0.0, a minor version can
change how things work.

## [Unreleased]

### Added
- Set logging is a pager: one page per exercise of today (warm-up, main lifts, core, forearm,
  cardio, cool-down) in Today's order. Swipe the page sideways, or use the small arrows, to move
  between exercises in any order; moving changes nothing. The "4 of 10" label opens a list of all
  of today's exercises to jump to. Home (top left) and the phone's back gesture return to Today
  from any page, even with a sheet open or the rest timer running. Each page has a small picture
  area (the exercise's initials for now), the last time's values filled in, so an unchanged set is
  one tap on Log set, and RIR folded away until wanted.
- Every row on Today opens the pager at that exercise and shows its progress ("2 of 4 sets").
  Start workout and Continue open it at the first exercise not yet done.
- An exercise marks itself Done when its last planned set is logged, and takes extra sets after
  that.
- An app icon, with versions for Android's round and shaped launcher masks, an iPhone home-screen
  icon and browser tab favicons. `npm run icons` makes them all from one source file.
- The app can be installed from the browser ("Install app" or "Add to Home screen") and opens full
  screen with its own icon.
- The installed app opens with no signal: a service worker keeps a copy of the app itself (never
  your data, which stays in the phone's database and syncs as before). When a new version is
  deployed, a small "Update available · Reload" bar appears instead of switching on its own.
  Signing out also deletes the cached copy.
- The design system documents the app icon (a new App icon section and a Brand asset group holding
  the icon's source file) and the compact bottom-bar buttons on Today.

### Removed
- Only one exercise could be open at a time, and only through Start or Next. Exercises no longer
  need to be started; the Start this exercise, Next and Continue buttons on the set screen are gone.
- The planned Escanor theme is dropped from the parking lot: its colors overlap the Gold accent
  and the Stop amber.

## [0.4.1] - 2026-11-20

### Added
- The server can run as a Windows Task Scheduler task: it starts at logon, has no console window,
  starts the server again after any exit, and logs each start and exit with the reason in plain
  words. `scripts\windows\server.ps1` installs it, shows its status, and stops or starts it.
- CI runs the backend tests (pytest) and the frontend tests and build on every push and pull
  request. Dependency update pull requests must pass them before they are merged.
- New README screenshots taken on a phone in demo mode, shown in a three-column table with
  captions.

### Changed
- The main bottom button on Today and the Finish workout button under it are compact, so the
  bottom bar takes less room.
- The screenshot script renders at three times the screen size, so regenerated images stay sharp.
- GitHub Actions updated to their latest major versions (checkout, setup-node, setup-python and
  the secret scanner), plus patch and minor updates to backend and frontend dependencies.

### Fixed
- Done and Skipped chips no longer spill past the edge of a row with a long name; the name wraps
  instead.
- The background server task could be ended by its hidden console window closing; it now has no
  console at all.

## [0.4.0] - 2026-11-20

### Added
- Passkey sign-in (fingerprint or face, user verification required) with server-side sessions.
  The first passkey is created with a one-time setup code printed in the server console. Every
  data route needs a session.
- An authenticator app (TOTP) and ten one-time recovery codes, which can only authorize adding a
  passkey on a new phone, never a sign-in.
- Settings lists your passkeys with their name and when each was last used. Each can be renamed
  or removed. The last passkey can only be removed with a recovery code.
- A one-time device code in Settings lets another device, such as a computer with Windows Hello,
  create its own passkey.
- Finish workout is available as soon as a workout has begun. If exercises are still open, it
  asks first, then marks untouched ones Skipped and keeps any logged sets.
- A fourth accent preset, Gold ("Super Saiyan"). It switches grade badges and goal lines to
  platinum so they stay distinct from the accent.
- Remote access through a Tailscale Service with HTTPS from `tailscale serve`; a setup guide with
  a placeholder copy of the access policy is in `docs/TAILSCALE.md`.
- A security page (`docs/SECURITY.md`) with the threat model and each decision marked done or
  planned.

### Security
- The server answers on the loopback address only and ignores forwarded headers. The development
  server refuses to listen on the network unless it runs with demo data only.
- Security headers on every response: a strict Content Security Policy, HSTS, frame, referrer,
  content-type, permissions and cross-origin policies.
- Session cookies are `__Host-` prefixed, HttpOnly, Secure and SameSite=Strict, stored on the
  server only as a hash, rotated at every sign-in, with an idle timeout and an absolute lifetime.
- Every request that changes data must come from an allowed origin. Repeated failed sign-ins and
  codes lock that action for 15 minutes.
- Signing out sends any unsaved changes first, then clears the app's data from the phone.
- Removing a passkey ends every session it signed in.
- Dependency audits for Python and npm run in CI on every push and weekly. GitHub Actions are
  pinned to commit hashes and kept current by Dependabot.

## [0.3.0] - 2026-11-19

### Added
- Log bodyweight and waist measurements from the Progress screen.
- A save status on Today and Set logging that shows how many changes are waiting for the server.
- Finish workout sends everything to the server at once and reports what was saved.
- The app asks the browser for persistent storage, so logged sets are not cleared when the phone
  runs low on space.

### Changed
- Changes made offline wait in a queue on the phone and are sent in order when the connection
  returns.

## [0.2.0] - 2026-11-19

### Added
- A database (SQLAlchemy and Alembic on SQLite) for programs, sessions, sets, notes and
  measurements. Program edits create a new program version, and old logs stay tied to the version
  they used.
- A program importer that reads a workout spreadsheet kept outside the repository and lists
  anything it cannot map instead of guessing.
- An API for today's session, set logging, notes, the exercise library, exercise cards and
  progress.
- Today, Set logging, the library and exercise cards read the imported program from the API;
  made-up demo data stays available from Settings.
- Progress charts and the calendar are built from logged sessions.
- A Docker Compose setup (not yet tested).
- A pre-commit check that blocks any staged line containing a string from a private, local-only
  list, with a mode that audits the full git history.
- README screenshots and a "How it's built" section.

### Changed
- Assisted exercises are marked per exercise, with a manual override.
- The first time an exercise is logged, a weight must be entered; there is no earlier value to
  offer.

## [0.1.0] - 2026-10-24

### Added
- A design system: color, type, spacing and size tokens, component styles and icons, with Dark
  and Light themes.
- Today's workout: exercises in program order, Later, Swap and Done, Skipped and Stop states.
- Set logging with last time's values as one-tap placeholders, optional RIR and a rest timer.
- Exercise cards with a history chart, pinned notes, recent sessions and substitutions.
- Progress: a weekly summary, measurement charts, sets per muscle group, a calendar and recent
  records.
- An exercise library grouped by body region and muscle, with search and filters.
- Settings: theme (System, Dark, Light), accent presets, an About page and a demo reset.
- Today's session is kept on the phone (IndexedDB), so a reload resumes where you left off.
- A FastAPI server that serves the app and its API from one origin, with secret scanning, linting
  and tests set up from the start.

[Unreleased]: https://github.com/CLochstampfor60/heavenly-restriction/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/CLochstampfor60/heavenly-restriction/releases/tag/v0.4.1
[0.4.0]: https://github.com/CLochstampfor60/heavenly-restriction/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/CLochstampfor60/heavenly-restriction/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/CLochstampfor60/heavenly-restriction/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CLochstampfor60/heavenly-restriction/releases/tag/v0.1.0
