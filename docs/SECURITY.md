# Security

Heavenly Restriction is a single-user, self-hosted workout tracker. Its data includes injury and
health history, so the design assumes that data must never be readable by anyone but its owner.
This page is the threat model and the decisions that follow from it. Each item is marked
**Done** (in the code today) or **Planned** (phase 4: remote access and login).

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

### Access
- **Planned.** Tailscale is the only way in: `tailscale serve` on the host, never Tailscale Funnel.
- **Planned.** Tailscale ACLs allow only the owner's phone and workstation to reach the app port.
- **Planned.** MFA on the identity account behind the tailnet.
- **Planned.** Tailnet Lock on, so a new node needs a signature from a trusted device.

### Hostname
- **Planned.** One stable service name, `hr.<tailnet>.ts.net`, that moves from the workstation to
  the NAS unchanged. WebAuthn passkeys are bound to the relying-party ID (the hostname), so
  changing it would strand every enrolled passkey.
- Note: `tailscale serve` uses a public certificate, and certificates are logged in public
  Certificate Transparency logs. The hostname is therefore discoverable; the app is not reachable
  from outside the tailnet.

### Authentication
- **Planned.** A passkey (WebAuthn, unlocked by fingerprint) is the only everyday login.
- **Planned.** TOTP plus one-time recovery codes are used only to enroll a new passkey (new or
  replaced phone), never as a daily login.
- **Planned.** Lockout and rate limiting on failed attempts, for both passkey and TOTP.

### Sessions
- **Planned.** Server-side sessions. The cookie is `HttpOnly`, `Secure` and `SameSite=Strict`;
  the session ID rotates on login; idle timeout plus an absolute lifetime of about 30 days.
- **Planned.** An Origin check on every state-changing request (POST, PUT, PATCH, DELETE).
- **Planned.** No tokens in localStorage or IndexedDB.

### Offline data on the phone
- **Done.** Logged sets live in IndexedDB first and sync later; the app asks the browser for
  persistent storage so it is not cleared under storage pressure.
- **Done (stub).** Logout wipes IndexedDB, but only after a sync confirms nothing is waiting.
  It is not wired up until login exists.
- **Planned.** Queued changes sync only with a valid session; an expired session holds them until
  the next login.
- **Accepted.** Data at rest on the phone relies on the device lock (fingerprint / PIN) and the
  phone's own storage encryption.

### HTTP security headers
- **Done.** On every response, including errors:
  - `Content-Security-Policy`: this origin only; frames limited to
    `https://www.youtube-nocookie.com`; `frame-ancestors 'none'`; `object-src 'none'`;
    `base-uri 'none'`; no `unsafe-inline` or `unsafe-eval`.
  - `Strict-Transport-Security` (effective once served over HTTPS).
  - `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.
  - `Permissions-Policy` turning off camera, microphone, geolocation, payment, USB and sensors.
  - `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy`: same-origin.

### Container
- **Done (not yet run).** Non-root user, read-only root filesystem, `cap_drop: ALL`,
  `no-new-privileges`, its own network, no `docker.sock` mount.
- **Planned.** Base images pinned by digest.
- **Done.** `pip-audit` and `npm audit` run in CI on every push, on pull requests and weekly,
  with read-only workflow permissions. Secret scanning (gitleaks) runs in CI and as a pre-commit
  hook.

### Data at rest and backups
- **Planned.** The NAS volume holding the database is encrypted.
- **Planned.** Off-site backups are encrypted before they leave the NAS.
- **Planned.** At least one restore is actually tested, and the date recorded.

### Media uploads
- **Planned.** EXIF and other metadata stripped from photos and videos.
- **Planned.** Content-type and size checks on upload.
- **Planned.** Files stored outside the web root and served only through the API.

### Logging
- **Planned.** Log authentication events only (sign-in, failure, lockout, passkey enrolled,
  session revoked). Never log health data, notes, sets or request bodies.
- **Planned.** Alert on a sign-in from a new device.

### This repository
- **Done.** Real program files, databases, `.env` and media are gitignored. Demo data is made up.
- **Done.** A local pre-commit hook blocks any staged line containing a string from a private,
  gitignored list (distinctive values from the real program, machine names); the same script
  can audit all tracked files or the full history.

## Reporting a problem
This is a personal project. If you find a security issue, please open a GitHub issue without
details and ask for a private contact, or use GitHub's private vulnerability reporting if it is
enabled on the repository.
