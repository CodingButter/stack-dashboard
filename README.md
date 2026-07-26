# stack-dashboard

A real-time command center for a self-hosted NAS media stack — Sonarr/Radarr,
qBittorrent, SABnzbd, Plex/Tautulli, Prowlarr, Overseerr, Tdarr, and the
underlying machines. It polls every service on a schedule, stores the readings
in Postgres, and renders live panels, logs, alerts, and a typed action registry
with role-based access and a full audit trail.

Designed for a single family on a private tailnet — not a public multi-tenant
SaaS. Security posture reflects that (see [Security](#security)).

## Architecture

Three moving parts, three machines:

| Piece | Runs on | What it does |
| --- | --- | --- |
| **Web app** (Next.js) | dev-beast `:3800` | UI, API routes, auth, action execution, audit |
| **Poller** (Node worker) | dev-beast | Polls every service on a tiered schedule, writes to Postgres, runs retention + the alert engine |
| **Node agent** (Python) | NAS + GPU boxes `:9101` | Exposes `/stats`, `/gpu`, `/docker`, `/logs/*`, `/actions/*` from `/proc`, the docker socket, and journald. See [`agent/README.md`](agent/README.md) |

```
 browser ──tailnet──▶ web (:3800) ──▶ Postgres (stackdash)
                          ▲                  ▲
                          │                  │ writes
                       actions            poller ──HTTP──▶ node agents (:9101)
                                                           NAS · bigbeast · zenbeast
```

- **Poll-only.** The agents never push; the poller pulls. An agent that is down
  just shows as degraded — it can never wedge the dashboard.
- **One execution path for mutations.** Every state-changing operation goes
  through the typed action registry (`src/actions/`): RBAC → param validation →
  deny-list → type-to-confirm → execute → audit row. The command palette and the
  contextual panel buttons are both just callers of that single path.
- **Data model.** `snapshots` (latest typed payload per service/kind), `metrics`
  (time series), `service_status` (up/latency/error history), `log_lines`,
  `alerts`, plus `users`/`sessions`/`audit_log`/`settings`.

## Stack

Next.js (App Router) · React · TypeScript · Tailwind · shadcn/ui + Tremor
widgets · Drizzle ORM · Postgres · Vitest. Node agent is dependency-free Python 3
(stdlib only).

## Local development

```bash
pnpm install
cp .env.local.example .env.local   # fill DATABASE_URL, SESSION_SECRET, AGENT_TOKEN
pnpm drizzle-kit migrate
pnpm dev                           # http://localhost:3000
pnpm tsx src/poller/index.ts       # run the poller against the same DB
```

Gates:

```bash
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm build       # next build
```

## Production deploy (runbook)

The dashboard runs as two **systemd user services** on dev-beast (user services
so a crash or memory spike can never take the box down; `MemoryMax=1G` each so
they never fight Tdarr transcodes on that shared machine). Lingering is enabled
so they survive reboot.

**Deploy / update the web + poller** (run from a checkout that can SSH to dev-beast):

```bash
bash deploy/install-devbeast.sh
```

This is idempotent: it rsyncs the repo, `pnpm install`, builds the Next
standalone bundle, runs `drizzle-kit migrate`, installs the two user units,
enables lingering, and restarts them.

**Deploy a GPU-node agent** (bigbeast, zenbeast):

```bash
bash agent/deploy/install-gpu-agent.sh <host>
```

It prints the agent URL and a generated token — paste those into
**Settings → Services** in the dashboard to connect it.

**Operate the services on dev-beast:**

```bash
systemctl --user status  stackdash-web stackdash-poller
systemctl --user restart stackdash-web stackdash-poller
journalctl --user -u stackdash-poller -f
```

Reachable over the tailnet at `http://dev-beast:3800`.

## Configuration

Runtime secrets live in `.env.production.local` on the target (mode `0600`,
untracked): `DATABASE_URL`, `SESSION_SECRET`, `AGENT_TOKEN`. Per-service URLs and
API keys are **not** env vars — they are entered through **Settings → Services**
in the UI and stored in the `settings` table (secrets AES-256-GCM encrypted).
This keeps the dashboard usable by anyone, not just its author.

## Security

- **Tailnet-only.** The app is meant to sit on a private Tailscale network. It is
  not hardened for public exposure; put it behind an authenticating reverse proxy
  if you expose it. The web service binds `0.0.0.0:3800`, so its reachability is
  bounded by the host's network (LAN + tailnet, no public port-forward) rather
  than by the listen address. The session cookie is served without the `Secure`
  flag (`COOKIE_SECURE=false`) because the tailnet carries plain HTTP; restore
  `Secure` by terminating TLS at a reverse proxy.
- **Auth.** Passwordless-username + password login, scrypt-hashed, session
  cookies. Admin-only pages for users, services, and audit.
- **Action safety.** Mutations require the right role; destructive ones require a
  literal `type-to-confirm` string. The node agent independently enforces a
  container/unit **deny-list** and an `X-Confirm` header, so destructive actions
  are double-gated (dashboard *and* agent). Every attempt — success, failure, or
  denial — writes an audit row.
- **Secret vault.** Service API keys are encrypted at rest with a key derived
  from `SESSION_SECRET` via scrypt. This protects DB dumps/backups from casual
  disclosure; it is **not** a full KMS — someone holding both the DB and the
  process env can still decrypt. Accepted posture for a single-family,
  tailnet-only tool.
