# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Before 1.0.0, a minor version can
change how things work.

## [Unreleased]

### Added
- Skip on every exercise page: one tap marks the exercise Skipped for today, with no dialog. It
  is not a Stop: it records no stop event and nothing in the exercise's history, and sets already
  logged stay. Undo skip, or logging a set, opens it again. Today's row says "Skipped".
- The swap sheet has an "All exercises" section below your substitutions and same-muscle options:
  the whole library by body region (tap a region to open it), with a search field. Picking one
  swaps it in for today like any other swap. It works with no signal once the app has loaded
  the library.
- Workout time, worked out automatically with nothing to tap: from Start workout or the first
  logged set to Finish workout (or the last logged set). Today shows it once the workout is
  finished, Progress lists it for each day this week, and each exercise's recent sessions on its
  card show the time from its first to its last set. Each set keeps the time it was logged on
  the phone, even if it reaches the server later. **Needs a database migration:**
  `server.ps1 migrate`.
- Cardio is logged as done: each cardio page has a type switch (bike, air bike, incline walk,
  stair climber) and steppers for minutes, incline and speed, or level on the bikes and stair
  climber, all prefilled from the program, so one tap on Done logs it. Today shows what was
  logged, and Progress counts the logged minutes. Skip works as on exercises. **Needs a
  database migration:** `server.ps1 migrate`.

### Fixed
- The swap sheet listed an exercise twice when it was both a substitution and a same-muscle
  option. Each exercise now appears once, in the highest section it belongs to; excluded
  exercises stay hidden.

## [0.5.1] - 2026-11-23

### Added
- Add or remove sets on an exercise page, for today only. "+ Add set" under the last set adds a
  planned set, already filled in like the others, so it is one tap to add and one to log. Each
  set with nothing logged on it has a remove button ("Remove set N"); at least one set always
  stays, and a logged set is taken back with undo as before. Today's progress ("2 of 4 sets"),
  Done, Finish workout and the exercise list follow the new count, which is saved with today's
  session on the phone and the server (it works offline and survives a reload). The program
  itself is unchanged. **Needs a database migration:** `server.ps1 migrate`.

### Changed
- A set number last time did not reach (an added or extra set) is now filled in from the set
  just before it today, instead of from last time's final set.

## [0.5.0] - 2026-11-23

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
- Settings › Workout › Rest timer is a choice: Off, After every set (the default for a new
  account) or After each exercise (once its last planned set is logged). Off means no automatic
  start and no timer pill, ring or countdown anywhere. Below it, Default rest (15 s steps, 90 s to
  start) sets the rest for exercises the program gives none. Both are saved to your account on the
  server and kept on the phone, so every device matches and they work with no signal. An account
  whose rest timer was off stays Off. **Needs a database migration:** `server.ps1 migrate`.
- A timer button near the top of each exercise page ("Timer on" / "Timer off") turns the rest
  timer on or off for the rest of today, on every page, without changing Settings. It is saved
  with today's session, so it survives a reload and reaches the other devices. Choosing in
  Settings again replaces it.
- `scripts\windows\server.ps1 deploy` builds the app from the current commit and restarts the
  server, and refuses unless that commit is clean and already pushed. Building into the folder the
  live server serves also refuses a tree with uncommitted changes.
- `scripts\windows\server.ps1 doctor` checks everything the phone depends on and prints PASS or
  FAIL for each, with the command that fixes it: the server task, supervisor and address, health
  on this PC and over the tailnet, Tailscale and the service's serve config, that the live build
  is a clean commit with nothing newer to deploy, the database and its latest backup, disk space,
  and leftover test browsers. It also warns when ProtonVPN is connected, which blocks this PC from
  the tailnet.
  It also fails if the Desktop, the repository, `.env` or the database can be opened by other
  accounts on the PC (Users, Everyone or Authenticated Users).
  It reports the system drive's encryption state as information only: not encrypting this home
  desktop is an accepted risk (see docs/SECURITY.md).
- After a restart, the server supervisor waits for the tailnet and keeps checking that the app
  answers over its HTTPS address, logging when it becomes reachable (and how long that took after
  sign-in) and every change after that, with the reason. `server.ps1 status` shows the latest.
- Database backups leave this machine: once a day from the server supervisor, and before every
  deploy and migration, into a cloud-synced folder set in `.env`. Each is checked before it is
  copied in. The last 14 days and 8 weeks are kept. `server.ps1 backup` makes one on demand,
  `server.ps1 migrate` backs up and then migrates, and `doctor` fails if the newest backup is
  more than 36 hours old or damaged, and warns if the Proton Drive app is not running (backups
  would then stay on this PC). A restore test (into a scratch copy) is one command.
- Settings › About shows the app version and the build's commit ("0.4.1 · build 1a2b3c4"), so you
  can see which version the phone is running.
- Undo stop, on a stopped exercise's page and on its row on Today: deletes that stop from the
  history, the calendar and the records, and reopens the exercise.
- An app icon, with versions for Android's round and shaped launcher masks, an iPhone home-screen
  icon and browser tab favicons. `npm run icons` makes them all from one source file.
- The app can be installed from the browser ("Install app" or "Add to Home screen") and opens full
  screen with its own icon.
- The installed app opens with no signal: a service worker keeps a copy of the app itself (never
  your data, which stays in the phone's database and syncs as before). When a new version is
  deployed, a small "Update available · Reload" bar appears instead of switching on its own.
  Signing out also deletes the cached copy.
- The design notes (docs/DESIGN.md) describe the exercise pager, the new Today rows and buttons,
  and the Settings screen, and add the gym rule: fewest taps, least typing, least thinking. The
  Exercise row, Set row and Button notes in the design system match.
- The design system documents the app icon (a new App icon section and a Brand asset group holding
  the icon's source file) and the compact bottom-bar buttons on Today.

### Changed
- The rest length is the exercise's rest from the program when it has one, otherwise Default rest.
  Before, it was a fixed 90 s for main lifts and 60 s for core and forearm, whatever the program
  said; the imported program gives no rest times, so every exercise now rests for Default rest.
- After every set now also counts down after an exercise's last set (the rest before the next
  exercise); before, that one was skipped.
- FastAPI updated to 0.165.0.
- The design system's color notes give each contrast figure for both themes ("5.4:1 Dark, 4.7:1
  Light"), rounded down, instead of one theme's figure. No color changed.
- The README screenshots are made in the browser from the demo data by `npm run screenshots`
  (same nine scenes, file names and captions, 720 px wide WebP) and show the current app: Today
  rows open the pager, and the swap sheet opens from an exercise's page in the pager.
- Cards stand out from the page in both themes: a slightly deeper card color in Light (#e6e9f1,
  raised #dde2eb) and a lighter one in Dark (#1e222d), with a much stronger card outline
  (#a7b0c0 Light, #4a5368 Dark). The raised Dark card stays as it was, because a lighter one would
  push the personal-record red too close to the contrast floor. The Gold accent in Light is a
  little deeper (#745900), now 5.0:1 or better on every surface and card. Every text, accent and
  signal color still passes 4.5:1 on the page, every surface and both card colors, in both themes
  and all four accents.

### Fixed
- When `doctor` cannot reach the app over the tailnet, it now says which layer fails (route,
  DNS, TCP or HTTPS) with the fix for that layer. It no longer suggests ProtonVPN split
  tunneling, which did not help in testing; disconnecting ProtonVPN does.
- `server.ps1 migrate` stopped with the server down: Windows PowerShell treated alembic's normal
  progress lines as errors. It now runs alembic through cmd and decides by the exit code.
- The phone could be served a half-finished build: the end-to-end tests and screenshots built into
  the folder the live server serves. They now build into their own folder.
- A new version found on an earlier run, but never applied with Reload, now takes over the next
  time the app is opened (before anything is on screen). While the app is open it still only shows
  "Update available · Reload".
- The last logged set can be undone on a stopped exercise too.
- No exercise state locks logging any more. A Stopped, Skipped or Done exercise can always be
  logged; logging reopens a Stopped or Skipped one (and a finished workout). Before, Stop was the
  only way to move past an exercise, it left a false stop on record, and the exercise stayed locked
  as Stopped.
- Test runs no longer leave browser windows behind. The end-to-end tests, screenshots and icons
  all start their browser through one helper that is headless only, closes it even when a test
  fails or the run crashes, ends any of its processes that outlive the close, and fails the run if
  one survives. A browser left by a run that was killed outright is ended at the next launch.
  `npm run browsers:check` lists leftovers and `npm run browsers:clean` ends them.
- `server.ps1 deploy` refuses untracked or hidden files and any commit that is not on the main
  branch on GitHub; before, a commit on any pushed branch (a Dependabot branch, say) could go
  live, and new untracked files could slip into the build. A build into the served folder now
  counts untracked app files as uncommitted changes too.
- `server.ps1 doctor` also checks that the database is at the newest migration (`deploy` does not
  migrate).

- `server.ps1 status` no longer reports "exited unexpectedly" when the server is fine: that code
  only means the task's 5-minute repeat start was skipped because it was already running.

### Removed
- Only one exercise could be open at a time, and only through Start or Next. Exercises no longer
  need to be started; the Start this exercise, Next and Continue buttons on the set screen are gone.
- The planned Escanor theme is dropped from the parking lot: its colors overlap the Gold accent
  and the Stop amber.

### Security
- Every API response says `Cache-Control: no-store`, so nothing from the API is kept in a browser
  or proxy cache.
- An unexpected server error (500) now carries the security headers too.
- The automatic API documentation pages (`/docs`, `/redoc`, `/openapi.json`) are turned off.
- The server's access log no longer records dates, ids or query strings from API paths, so it
  does not show which days you trained or stopped. `server.ps1 trim-log` removes older lines that
  still do, and `doctor` fails if any are left in the log or its rolled copy.
- The test and screenshot previews no longer forward `/api` to the live server.
- A known vulnerability in a package FastAPI uses (opentelemetry-api) is fixed by pinning its
  patched version.
- Secret scanning also runs weekly over the whole history, and the private-strings history check
  covers merge commits.

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

[Unreleased]: https://github.com/CLochstampfor60/heavenly-restriction/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/CLochstampfor60/heavenly-restriction/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/CLochstampfor60/heavenly-restriction/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/CLochstampfor60/heavenly-restriction/releases/tag/v0.4.1
[0.4.0]: https://github.com/CLochstampfor60/heavenly-restriction/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/CLochstampfor60/heavenly-restriction/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/CLochstampfor60/heavenly-restriction/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CLochstampfor60/heavenly-restriction/releases/tag/v0.1.0
