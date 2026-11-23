# Security

Heavenly Restriction is a single-user, self-hosted workout tracker. Its data includes injury and
health history, so the design assumes that data must never be readable by anyone but its owner.
This page is the threat model and the decisions that follow from it. Each item is marked
**Done** (in the code or the tailnet today) or **Planned**. Setup steps for the tailnet are in
[TAILSCALE.md](TAILSCALE.md).

Names here are placeholders: `hr.<tailnet>.ts.net` stands for the app's hostname, `192.168.x.x`
for the home network.

## Threat model

**Protecting:** workout logs, injury history in pinned notes, stop events (symptoms), body
measurements, and the imported program.

**Against:**
- Anyone on the home LAN or another network the phone joins.
- The public internet: scanners, and anyone who learns the hostname.
- A lost, stolen or borrowed phone.
- Theft of the server disk or of a backup.
- A malicious or compromised dependency.
- Accidental publication: real data or personal details committed to this public repository.

**Out of scope:** an attacker with an admin session on the owner's unlocked workstation, and
compromise of the Tailscale coordination service itself (Tailnet Lock limits what that can do).

## Decisions

### Network exposure
- **Done.** The server answers on loopback only. `python -m app` binds 127.0.0.1 and refuses any
  other address outside the container, and a middleware answers 403 to any request whose socket
  peer is not loopback. Forwarded headers are ignored. Nothing serves real data on the LAN.
- **Done.** The Vite dev server refuses `--host` unless it runs with `--mode demo`, which drops the
  API proxy and forces made-up demo data (`npm run dev:lan-demo`).
- **Done.** In Docker, the port is published on 127.0.0.1 only.
- **Done.** No public API map: `/docs`, `/redoc` and `/openapi.json` are turned off.
- **Done.** Test and screenshot previews run in demo mode with no `/api` proxy, so they cannot
  reach the live server.

### Access
- **Done.** Tailscale is the only way in: `tailscale serve` on the host, never Tailscale Funnel
  (Funnel is off for the tailnet).
- **Done.** The tailnet policy grants only the owner's phone and workstation access to the app,
  and only on `tcp:443` to `svc:hr`. A placeholder copy of the policy is in
  [TAILSCALE.md](TAILSCALE.md).
- **Done.** MFA on the identity account behind the tailnet.
- **Done.** `server.ps1 doctor` checks that the server listens on 127.0.0.1 only, that the
  `svc:hr` serve config points at it from the approved host, and that Funnel is off.
- **Planned.** Tailnet Lock on, so a new node needs a signature from a trusted device. The owner
  turns it on last.

### Hostname
- **Done.** One stable service name, `hr.<tailnet>.ts.net`, that moves from the workstation to
  the NAS unchanged. It is a Tailscale Service (`svc:hr`, client 1.86 or later): the name
  belongs to the service, not to a machine, and the host is a tagged device approved for it, so
  moving to the NAS means advertising `svc:hr` there and retiring the old host. WebAuthn
  passkeys are bound to the relying-party ID (the hostname), so changing it would strand every
  enrolled passkey. Today the workstation is the tagged host (`tag:hr-host`) serving `svc:hr`.
- Note: `tailscale serve` uses a public certificate, and certificates are logged in public
  Certificate Transparency logs. The hostname is therefore discoverable; the app is not reachable
  from outside the tailnet.

### Authentication
- **Done.** A passkey (WebAuthn, unlocked by fingerprint; user verification required) is the
  only way to get a session. The relying-party ID comes from `WEBAUTHN_RP_ID` (localhost in
  development, the stable hostname in production).
- **Done.** The first passkey is created with a one-time setup code printed in the server
  console. It works only while no passkey exists and only once. Creating a passkey never signs
  you in; you then sign in with it.
- **Done.** Every API route except health and the sign-in endpoints requires a session (401).
- **Done.** An authenticator app (TOTP, RFC 6238) and 10 one-time recovery codes can only
  authorize enrolling a new passkey (new or replaced phone), never a session. Codes are shown
  once and stored as hashes; a TOTP code works once (replay guard). Set up from Settings while
  signed in.
- **Done.** Settings lists every passkey (name, last used, which one this device signed in
  with); each can be renamed or removed. Removing a passkey ends every session it signed in.
  The last passkey can be removed only with a recovery code (used up); with none left, only
  the console setup code can create a passkey again.
- **Done.** A second device (the workstation, with Windows Hello) gets its own passkey through a
  one-time device code shown in Settings on a signed-in device: five minutes, single use, a new
  code replaces the old, only its hash is kept (in memory). Like the other codes, it authorizes
  one enrollment and never a session.
- **Done.** Five failures of the same kind (sign-in, setup code, enrollment code, removing the
  last passkey) within 15 minutes lock that action for 15 minutes (429). Pending sign-in challenges are single use,
  expire after five minutes and are capped in number. The lockout is per action, not per
  device, so any device the tailnet policy lets in could lock sign-in for 15 minutes; with only
  the owner's two devices allowed, that is accepted.
- **Planned.** A fresh fingerprint (a recent user-verified passkey check) before the actions that
  change how you sign in: adding a passkey, new recovery codes, replacing the authenticator app,
  and issuing a device code. Today a valid session alone can do them, so a borrowed unlocked phone
  could add its own way in.

### Sessions
- **Done.** Server-side sessions; the server stores only a SHA-256 of the token. The cookie is
  `__Host-` prefixed, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, no `Domain`.
- **Done.** Every sign-in issues a new session and revokes the one the browser had.
- **Done.** Idle timeout (7 days by default, `SESSION_IDLE_HOURS`) and an absolute lifetime
  (30 days, `SESSION_DAYS`).
- **Done.** An Origin check on every state-changing API request (POST, PUT, PATCH, DELETE),
  sign-in included: missing or unknown Origin gets 403.
- **Done.** No tokens in localStorage or IndexedDB; the session cookie is not readable by
  scripts.

### Offline data on the phone
- **Done.** Logged sets live in IndexedDB first and sync later; the app asks the browser for
  persistent storage so it is not cleared under storage pressure.
- **Done.** Sign-out sends everything first and refuses while changes are waiting (unless you
  explicitly choose to discard them), then ends the server session and deletes IndexedDB.
- **Done.** Queued changes sync only with a valid session: a 401 pauses the queue, keeps every
  change, and shows "Sign in to save"; signing in resumes it.
- **Done.** A service worker caches the app shell only (the page, scripts, styles, fonts, icons
  and manifest), so the installed app opens with no signal. API responses are never cached:
  `/api/*` always goes to the network, and offline data stays in IndexedDB. Same-origin GET
  requests only; no new origins, and the CSP is unchanged (`worker-src 'self'`). It registers only
  in a secure context (HTTPS or localhost), so the demo-only LAN dev server never gets one.
- **Done.** Each build gets its own cache; a new version waits and the app shows "Update
  available · Reload" instead of switching on its own. Old caches are deleted when the new
  version takes over. Sign-out deletes every cache and unregisters the service worker, along
  with IndexedDB.
- **Accepted.** Data at rest on the phone relies on the device lock (fingerprint / PIN) and the
  phone's own storage encryption.

### HTTP security headers
- **Done.** On every response, including errors (an unhandled 500 too: the headers wrap the
  framework's own error handler), static files and `sw.js`:
  - `Content-Security-Policy`: this origin only; frames limited to
    `https://www.youtube-nocookie.com`; `frame-ancestors 'none'`; `object-src 'none'`;
    `base-uri 'none'`; no `unsafe-inline` or `unsafe-eval`.
  - `Strict-Transport-Security` (effective once served over HTTPS).
  - `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.
  - `Permissions-Policy` turning off camera, microphone, geolocation, payment, USB and sensors.
  - `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy`: same-origin.
  - `Cache-Control: no-store` on every `/api/` response, so health data is never kept in a
    browser or proxy cache.

### Container
- **Done (not yet run).** Non-root user, read-only root filesystem, `cap_drop: ALL`,
  `no-new-privileges`, its own network, no `docker.sock` mount.
- **Planned.** Base images pinned by digest.
- **Done.** `pip-audit` and `npm audit` run in CI on every push, on pull requests and weekly,
  with read-only workflow permissions. Actions are pinned to commit SHAs; Dependabot updates
  actions, pip and npm weekly. The README's checks also audit the packages installed on the
  server (`.venv\Scripts\pip-audit`), since CI audits a fresh install. A dependency of a
  dependency with a known fix is pinned in `requirements.txt` until its parent requires the fix.
- **Planned.** A full lock file with hashes for every Python package, not only the direct ones.
- **Done.** Secret scanning (gitleaks) runs in CI on new commits, weekly over the whole history of
  main (which holds every release tag), and as a pre-commit hook.

### Data at rest and backups
- **Done.** On the workstation, the repository (with `.env`, the database and `data\backups\`)
  is readable only by the owner's account, SYSTEM and Administrators; the Users group was
  removed. The server's log and state folder under `%LOCALAPPDATA%` is the owner's only.
- **Done.** Backups leave the workstation: daily (from the server supervisor) and before every
  deploy and migration, into a cloud-synced folder named only in the local `.env`. Each is a
  consistent SQLite snapshot, integrity-checked before it is copied in and renamed into place.
  Kept: the newest of each of the last 14 days and of each of the last 8 weeks, never fewer than
  the newest one. `doctor` fails if the newest is more than 36 hours old or fails
  `PRAGMA integrity_check` (run on a local copy), and checks the schema is at the newest
  migration. `deploy` and `migrate` refuse to run if the backup fails.
- **Accepted.** The workstation's system drive is not encrypted (no BitLocker). It is a home
  desktop with a low theft risk, and the owner has had an unrecoverable BitLocker lockout
  before; losing the data to a lockout is the larger risk here. `doctor` reports the drive's
  encryption state as INFO, not as a failure.
- **Planned (December).** The database moves to the NAS onto an encrypted volume.
- **Planned.** Backups encrypted before they leave the machine. Today they rely on the sync
  provider's encryption.
- **Done.** Restore tested on 2026-11-23: the newest off-machine backup restored into a scratch
  copy (never over the live database) passed its integrity check and matched the live row
  counts (sessions, sets, stops, body metrics); the scratch copy was then deleted.
  `backup_db.py restore-test` repeats it.

### Media uploads
- **Planned.** EXIF and other metadata stripped from photos and videos.
- **Planned.** Content-type and size checks on upload.
- **Planned.** Files stored outside the web root and served only through the API.

### Logging
- **Done.** The server's access log keeps no personal details: API paths are cut to their first
  two parts with no query string (`POST /api/sessions/...`), so dates, ids and stop events are
  not written. Older lines with full paths were removed on 2026-11-23 (`server.ps1 trim-log`).
  The log rolls at 5 MB into one older copy, `server.log.1`, which replaces the previous one;
  `doctor` fails if either file holds a full API path.
- **Done.** Authentication events only (sign-in, failure, passkey added or removed, device code
  issued, sign-out) go to an
  `auth_event` table: kind, success, and a short non-sensitive detail. Never health data,
  notes, sets or request bodies.
- **Planned.** Alert on a sign-in from a new device.

### This repository
- **Done.** Real program files, databases, `.env` and media are gitignored. Demo data is made up.
- **Done.** A local pre-commit hook blocks any staged line containing a string from a private,
  gitignored list (distinctive values from the real program, machine names); the same script
  can audit all tracked files or the full history (every ref and tag, merge commits included).
- **Done.** Images in the repository carry no metadata (no EXIF, XMP or text chunks); checked
  over every image in the history on 2026-11-23.

### Deploy path
- **Done.** `server.ps1 deploy` refuses uncommitted, untracked or hidden (assume-unchanged)
  files, and any commit that is not on origin/main. Building into the served folder refuses the
  same, and tests and screenshots build into their own folder.
- **Done.** Every browser the tests and scripts start is headless and is closed even when a run
  fails; leftovers fail the run and show in `doctor`.

## Reporting a problem
This is a personal project. If you find a security issue, please open a GitHub issue without
details and ask for a private contact, or use GitHub's private vulnerability reporting if it is
enabled on the repository.
