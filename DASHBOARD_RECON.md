# DASHBOARD_RECON — Stack Management Dashboard

Recon document for a single web dashboard that surfaces every important statistic
across the media stack + fleet hardware, and exposes every important action.
This file is the seed context for the project: full service inventory, the stats
worth showing, and the master action list. **How** we collect each stat is a
later phase — this is the "what."

Authored 2026-07-23 from a live audit of the running stack.

---

## 1. Topology — what we're managing

| Box | Role | Notes |
|---|---|---|
| **NAS** (`nas`, UGREEN UGOS Pro) | Runs the entire container stack, storage tiers | 32 GB RAM, Intel iGPU (QSV), Docker. SSH local-network + tailnet only |
| **bigbeast** | Tdarr node (RTX 4090, nvenc + CUDA tonemap) | Tdarr_Node via systemd `tdarr-node.service` |
| **zenbeast** | Tdarr node (RTX 3070 Ti laptop) | Tdarr_Node via systemd |
| **dev-beast** | Tdarr node | Tdarr_Node via systemd |
| **minibeast / butterpi / codingbutter-dev** | Fleet boxes (not media-stack roles) | Optional: hardware stats only |

All boxes are on the Tailscale mesh (MagicDNS names: `nas`, `bigbeast`, `zenbeast`, etc.),
full passwordless SSH mesh as user `codingbutter`. Remote Tdarr nodes mount NAS media
over CIFS (`/movies`, `/tv`, `/movies-hot`, `/tv-hot`, …).

### Storage tiers (important — the dashboard should visualize this)
- **/volume1** — 22 TB HDD RAID5 behind bcache (NVMe cache, writearound). Cold tier + all sequential I/O.
- **/volume2** — 1.8 TB NVMe. Hot tier: `media/{movies,tv,anime-movies,anime-tv}` + `scratch/{usenet,torrent}-incomplete`, seedboost.
- Nightly **tier-mover** (systemd timer 05:30) demotes hot→cold when: ≥14 days old, transcoded to spec, not streaming. Space valve at 80 %/90 %.

---

## 2. Service inventory + stats each should contribute

All services run as Docker containers on the NAS (compose project `mediastack`,
`/volume1/docker/mediastack/compose/docker-compose.yml`) unless noted. API keys
live in each app's config file / compose env on the NAS — never hardcode them
into the dashboard repo; read from env/config at deploy time.

### Plex (`:32400`)
Stats: active sessions (user, title, device, direct-play vs transcode, bandwidth,
progress), transcoder load, library counts per section (Movies, TV, Anime Movies,
Anime TV, +1 private section), recently added, server version/health, hot-vs-cold
location per item (sections have dual locations: `/movies` + `/movies-hot` etc.).

### Tautulli (`:8181`, tautulli.plexflex.tv)
Stats: watch history, plays per user/day, concurrent-stream peaks, most-watched,
stream-quality breakdown. Tautulli is the easiest source for most Plex analytics —
prefer its API over scraping Plex directly for history.

### Sonarr (`:8989`) / Radarr (`:7878`)
Stats: queue (downloads in flight, stalled, import-pending, errors), wanted/missing
counts, cutoff-unmet counts, health warnings, disk-space per root folder,
recent grabs/imports history, upcoming calendar. Root folders span both tiers
(`/data/media/...` cold, `/data2/media/...` hot) — show per-tier counts.

### Prowlarr
Stats: indexer health/status per indexer, grab counts, failure rates,
rate-limit/daily-cap state (IPTorrents cap has bitten us before).

### Seerr (`:5055`)
Stats: pending requests, processing, failed, recently approved, request counts
per user.

### SABnzbd (`:8080`)
Stats: current speed, queue size/ETA, remaining GB, per-job progress, paused
state, daily/weekly/monthly totals, warnings. Also the **bandwidth governor**
state (see §4 — gate scales SAB's speed limit by active Plex streams).

### qBittorrent
Stats: active torrents, DL/UL speeds, ratios, seeding states (esp. `seedboost`
category vs arr categories), stalled/errored, free space on scratch.
Gotcha: WebUI auth has a subnet-whitelist quirk — API access may need to go
through `docker exec` or fixed whitelist.

### Unpackerr / Bazarr / Channels DVR / Streamtorrent / NPM (nginx proxy manager)
Stats: Unpackerr — extraction queue/errors. Bazarr — missing subtitles count.
NPM — proxy host health, cert expiry days. Channels DVR — recording state,
upcoming recordings, disk use.

### Tdarr (server `:8265` web / `:8266` API)
The heavy hitter. Stats: per-node status (NasTNode, BigBeastNode, ZenBeastNode,
DevBeastNode — online/paused, active workers, worker limits, current file +
progress + fps + ETA), queue depth per library (TV-HOT, MOVIES-HOT, TV, MOVIES),
error count + recent errored files, space saved (total + per-day), transcode
throughput history, staged/processing files.
Auth: `x-api-key` header (key in compose env `apiKey`). Note server has
`auth=true`; only the header form works.

### tdarr-gate (systemd on NAS — custom, `/volume1/home/codingbutter/tdarr_gate.py`)
Stats: frozen/thawed state, which nodes are paused, active Plex stream count it
sees, current SAB bandwidth limit it has applied, idle-timer countdown (15 min),
last transition timestamps.

### tier-mover (systemd timer, nightly 05:30 — `/volume1/docker/mediastack/scripts/tier_mover.py`)
Stats: last run result (moved / skipped-streaming / skipped-not-transcoded /
skipped-too-young / UNCONFIRMED), hot-tier fill %, valve state (normal / 80 % /
90 % emergency), next run time, per-run history.

### Other custom systemd units on the NAS (each should surface health + last-run)
`anime-sort`, `binge-prefetch`, `cifs-watchdog`, `recent-warm`, `stack-alerts`,
`stack-digest`, `tdarr-sweep`, `tier-mover`, `tdarr-gate`.

### Non-media containers on the NAS (health tile only)
Mailu stack (antispam/admin/front/imap/smtp/resolver), `wren-brain-pg`
(pgvector — **memorease store, must never be stopped**), raffleforge-postgres,
verifiedrandom-postgres, om-agents, reaparr, tailscaled (container).

---

## 3. Hardware / system stats (per box; NAS is priority 1)

**CPU & load:** load averages, per-core %, us/sy/iowait split (iowait was the
canary in every incident this month), top processes. UGOS `search_serv` watch —
it has pinned the box before.

**Memory:** used/available, swap in/out rate (not just usage), buff/cache.

**Disks — the most valuable panel on the whole dashboard:**
- Per-device util % + read/write MB/s + await latency (sda–sdd array, nvme0/1, md*, bcache0, dm-*)
- bcache hit ratio (hour/day)
- Filesystem fill: /volume1, /volume2 (with hot-tier valve thresholds 80/90 % drawn on the gauge)
- SMART: temps, media errors, spare %, power-on hours (nvme1n1 had a kernel-writeback scare; watch it)
- D-state process count (>0 sustained = wedge alarm; this exact signal predicted two incidents)

**Network:** eth0 rx/tx MB/s (1 Gbps NIC is the real ceiling), tailscale status
per peer (direct vs DERP relay — "relay + rx 0" is the classic data-plane-wedge
signature worth alerting on), NPM external request rates, SSH failed-auth count
(bot storms have gotten SSH auto-disabled before).

**GPU (transcode nodes):** utilization, encoder/decoder %, VRAM, temp, power
(nvidia-smi on bigbeast/zenbeast/dev-beast; intel_gpu_top for NAS QSV).

**Docker:** container states (up/exited/restarting), restart counts, per-container
CPU/mem, image/volume disk usage, reclaimable space.

**System:** uptime, UGOS version, kernel, last reboot reason if derivable,
systemd failed-units count.

---

## 4. Master action list (what the dashboard must be able to DO)

Grouped by blast radius. ⚠ = destructive/disruptive → require confirmation
(type-to-confirm or two-step) in the UI.

### Streaming / Plex
- View live sessions with full detail
- ⚠ Terminate a stream (with message to user)
- Trigger library scan (per section)
- Refresh metadata for an item
- ⚠ Empty trash per section
- ⚠ Restart Plex container

### Downloads — SABnzbd
- Pause / resume queue (global)
- Pause / resume / delete individual job
- Reorder queue, set per-job priority
- Set speed limit (and view/override what the governor set)
- Retry failed job

### Downloads — qBittorrent
- Pause/resume all or per-torrent
- ⚠ Delete torrent (with/without data)
- Set per-torrent share limits, change category
- Force reannounce/recheck
- Adjust global up/down speed caps and active-torrent limits

### Library management — Sonarr/Radarr/Prowlarr/Seerr
- Search missing (per movie / per series / season / bulk)
- Interactive search + manual grab of a specific release
- ⚠ Remove item from queue (with/without blocklist)
- Manual import of a stuck download
- Toggle monitored, change quality profile
- ⚠ Move item between root folders (hot ↔ cold — this is the manual tier override)
- ⚠ Delete media file (+ optional re-search)
- Approve / decline Seerr requests
- Test / toggle indexers in Prowlarr
- Add movie/series directly

### Transcoding — Tdarr
- Pause / resume individual nodes (and "pause all")
- Set worker limits per node (the "NasTNode = 1 GPU worker" rule lives here)
- ⚠ Cancel a running transcode
- Requeue errored files (per file / bulk)
- Bump a file to front of queue
- Re-scan library (hot/cold, per library)
- View/tail a node's current ffmpeg command + log

### Automation services (gate, mover, etc.)
- tdarr-gate: force-freeze / force-thaw override, adjust idle timer, view decision log
- tier-mover: **run now** (dry-run and real), per-item demote/promote, adjust age window, view last-run report
- Restart any of the custom systemd services; view their journals

### Infrastructure
- Start / stop / restart any Docker container (⚠ with a hard **deny-list**: `wren-brain-pg` and `tailscaled` must be protected from casual clicks)
- View container logs (tail, follow)
- ⚠ docker prune (containers / images / build cache; volumes behind extra confirm)
- Restart Tailscale on a box; show per-peer connectivity matrix
- ⚠ Reboot NAS / reboot a node box (type-to-confirm)
- Kill a runaway process (e.g. `search_serv`) on the NAS
- Toggle UGOS `search_serv` off after reboots (known CPU hog)

### Alerts the dashboard should raise on its own
- Any container not Up / restart-looping
- D-state processes > 0 for > 60 s
- Array util > 90 % sustained, /volume2 > 80 % (valve), /volume1 > 90 %
- Tailscale peer in relay mode with rx 0 (data-plane wedge signature)
- SSH failed-auth burst
- Tdarr node offline or worker-limit violated (e.g. NasTNode running > 1)
- SMART warning on any drive
- Plex unreachable / identity mismatch (use proper XML parse — a naive version-regex false-positived before)
- tier-mover run failed / UNCONFIRMED results
- Cert expiry < 14 days (NPM)

---

## 5. Log aggregation (DECIDED: build it in)

The dashboard must collect and store logs **off-box**, so that when a machine is
wedged/unreachable (it has happened repeatedly), we can still query what it was
saying right up to the moment it went dark. This is a first-class feature, not
an afterthought.

**Sources to ship:**
- Docker container logs for every stack container (Plex, arrs, SAB, qbit, Tdarr, NPM, …)
- systemd journals for the custom units (tdarr-gate, tier-mover, cifs-watchdog, stack-alerts, anime-sort, …) and for tdarr-node on each transcode box
- Kernel/dmesg (the writeback oops and CPU-starvation incidents only showed up here)
- SSH auth log (bot-storm detection)
- Tdarr node/server logs, SAB/qbit internal logs where the API doesn't expose enough
- The dashboard's own agent + API logs (so we can debug the debugger)

**Requirements:**
- Shipped continuously off the NAS to the dashboard host — near-real-time, so the tail survives a crash
- Filterable in the UI: by box, service, severity, time range, free-text/regex
- Retention window (e.g. 14–30 days) with size cap; logs are big, the store must not become its own disk-pressure incident
- Timestamps normalized to one timezone across boxes

**Implementation candidates (decide in-project):** Loki + promtail/alloy
(purpose-built, Grafana-queryable), Vector → SQLite/ClickHouse, or a minimal
custom shipper over the tailnet. Bias toward the lightest thing that supports
filtering + retention; the NAS-side component must be a container or single binary.

---

## 6. Deployment architecture (DECIDED)

- **Dashboard (web UI + backend + log/metrics store) runs on `dev-beast`** — off-NAS on purpose: watching the NAS die is half its job. Reachable over the tailnet.
- **A thin agent/API service runs on the NAS** (container or systemd unit): exposes hardware stats, docker control, systemd control, log shipping, and the allowlisted action commands. The dashboard talks to stack apps directly where they have good APIs, and to the NAS agent for everything that is inherently box-level.
- Same agent (or a slimmer variant) on bigbeast/zenbeast for GPU stats + tdarr-node control; dev-beast monitors itself locally.
- Agent security: tailnet-only bind, shared-token auth, **strict per-action allowlist — no generic shell passthrough**. Destructive endpoints (reboot, kill, prune) double-confirmed at both UI and agent level.

**Design rule for any automated remediation the dashboard grows (hard-learned):**
alerts may fire on a single sample, but *destructive* remediation (restart,
kill, reboot) must be load-aware — require a positive liveness check first
(is the workload actually making I/O progress?), a two-strike rule across
polls, and generous probe timeouts. A latency-based probe under load is not
evidence of death; a v1 watchdog that ignored this became the outage itself.

---

## 7. Collection-strategy candidates (decide in the project, not here)

1. **Direct API polling** from the dashboard backend (Plex/Tautulli/arr/SAB/qbit/Tdarr all have HTTP APIs; Tautulli covers most Plex analytics).
2. **A small metrics agent per box** for hardware stats — either something existing (node_exporter + nvidia exporter + smartctl exporter, scraped by the backend or a tiny TSDB) or a ~100-line Python/Go agent shipping JSON over the tailnet. NAS constraint: UGOS is appliance-Linux; agents should run as a container or a plain binary + systemd unit.
3. **SSH command runners** for the actions that are inherently shell (systemd restarts, worker-limit scripts, process kills) — the fleet already has a full passwordless SSH mesh, so the backend can execute over SSH with per-action allowlisted commands (never a generic shell passthrough).
4. History/graphs need a store: options range from SQLite (simplest) → VictoriaMetrics/Prometheus (if we go exporter-route).

## 8. Open questions for the build
- Stack: likely a Node/TS backend + React front (Jamie's home turf) vs. adopting Homepage/Dashy/Grafana and extending — recommend **custom**, because the action surface (gate, mover, worker limits) is bespoke and the existing dashboards are read-mostly.
- AuthN for the dashboard itself (it can reboot the NAS — must not be an open NPM host; at minimum tailnet-only + login).
- Log store choice (see §5) and retention numbers.
- NAS agent packaging: container vs. bare binary + systemd on UGOS (container is easier to ship; bare binary survives Docker-daemon incidents — which we have also had).
- Mobile-first layout — Jamie frequently checks from his phone.
