# Tailscale setup

How the app is reached from the phone: a Tailscale Service, `svc:hr`, published with
`tailscale serve` (never Funnel). The reasoning is in [SECURITY.md](SECURITY.md).

Everything here uses placeholders: `<tailnet>` for the tailnet name, `100.x.x.x` for device
addresses. Real values live only in the tailnet's admin console and in `.env`.

## Requirements
- Tailscale client 1.86 or later on the host (Services).
- MFA on the identity account behind the tailnet.
- HTTPS certificates (Serve) enabled for the tailnet. Funnel stays off.

## Policy
Merge this into the existing tailnet policy in the admin console's policy editor; do not replace
the whole policy with it. If the policy is still the default "allow everything", replacing it
with only this would cut every other connection between your devices.

```jsonc
{
  "tagOwners": {
    // Only an admin can tag a device as the app's host.
    "tag:hr-host": ["autogroup:admin"]
  },
  "hosts": {
    "phone": "100.x.x.x",       // the phone's Tailscale address
    "workstation": "100.x.x.x"  // the workstation's Tailscale address
  },
  "autoApprovers": {
    "services": {
      // A tagged host advertising svc:hr is approved without a manual step.
      "svc:hr": ["tag:hr-host"]
    }
  },
  "grants": [
    // Only the phone and the workstation may reach the app, and only on HTTPS.
    { "src": ["phone", "workstation"], "dst": ["svc:hr"], "ip": ["tcp:443"] }
    // ...existing grants for everything else stay here.
  ]
}
```

Notes
- Tagging a device makes it a tagged device: it is no longer owned by your user, its key does
  not expire, and rules written for `autogroup:self` no longer match it.
- The policy editor validates on save and previews who can reach what. Check that only the two
  hosts reach `svc:hr` on 443.

## Host
1. In the admin console, under Services, define the service `hr` with port `tcp:443`.
2. On the host, in an elevated PowerShell:

```powershell
tailscale version                                         # 1.86.0 or later
tailscale up --advertise-tags=tag:hr-host                 # the host becomes a tagged device
tailscale serve --service=svc:hr --https=443 127.0.0.1:8000
tailscale serve status
```

3. If `serve` says approval from an admin is required, approve the host under Services > `hr`
   (or check that `autoApprovers` above is in the saved policy).
4. In `.env` (local only):

```
WEBAUTHN_RP_ID=hr.<tailnet>.ts.net
APP_ORIGINS=https://hr.<tailnet>.ts.net
```

5. Start the app (`python -m app`, which binds 127.0.0.1:8000) and check from the host:

```powershell
(Invoke-WebRequest -UseBasicParsing https://hr.<tailnet>.ts.net/api/health).Content
```

Passkeys are bound to the hostname, so do the first-run setup at `https://hr.<tailnet>.ts.net`,
not on localhost.

## Moving to another host (the NAS)
Advertise the same service on the new host (`tailscale up --advertise-tags=tag:hr-host`, then
the same `tailscale serve --service=svc:hr ...` line), confirm it is approved and serving, then
on the old host run `tailscale serve clear svc:hr`. The hostname does not change, so enrolled
passkeys keep working. Copy the database across before switching.

## Tailnet Lock
Turn it on last, once every device is on the tailnet. See
<https://tailscale.com/kb/1226/tailnet-lock>. Keep the disablement secrets in a password
manager, never in this repository.
