# Handoff: Tdarr node stage + progress (fix the "Scanning" mislabel)

**From:** Wren (plexstack side)
**To:** dashboard-building agent
**Date:** 2026-07-26
**Repo:** stack-dashboard
**Goal:** Make the Tdarr page show each node's *true* stage and *live* progress. Today a node that is actively transcoding sometimes renders as "Scanning" with no progress, which is wrong.

---

## TL;DR

The Tdarr API already reports accurate stage + progress per worker. "Scanning" is a **real but brief early phase** of a job (probe/setup), not a stuck state. The bug is purely presentational: the dashboard is either (a) surfacing the transient `Scanning` status without the accompanying `percentage`/`ETA`, or (b) not distinguishing the short probe phase from the long transcode phase.

**Fix: read `status` + `percentage` + `fps` + `ETA` per worker and render them together.** When `status == "Execute"`, that IS the transcode — show the progress bar. Do not label it "Scanning."

There is **no server-side change needed** and **no change to `tdarr_gate.py` / the `/tdarr/governor` endpoint**. This is a Tdarr-client (poller) + UI change only. The governor endpoint stays as-is.

---

## Where the data comes from

Source: Tdarr relay API, `GET /api/v2/get-nodes` (already polled by `src/poller/clients/tdarr.ts`).

Shape: `{ <nodeId>: { nodeName, workers: { <workerId>: {...} } } }`

Each **worker** object carries everything you need. Verified live fields (2026-07-26):

| Field | Type | Meaning | Use for |
|---|---|---|---|
| `status` | string | Current stage of the worker | **Stage label** |
| `percentage` | number | 0–100 progress within the current stage | **Progress bar** |
| `fps` | number | Live encode framerate | Secondary detail / "is it moving" |
| `ETA` | string | e.g. `"0:09:54"` | Time remaining |
| `workerType` | string | `transcodegpu` / `transcodecpu` / `healthcheckgpu`… | Icon / worker kind |
| `file` | string | Source file path | Filename shown |
| `originalfileSizeInGbytes` | number | Source size | Size before |
| `outputFileSizeInGbytes` | number | Output size so far | Size after (live) |
| `estSize` | number | Estimated final output size (GB) | Projected savings |
| `idle` | bool | Worker idle flag | Hide/show |
| `job.type` | string | `transcode` (job class) | — |

> Note: there is **no** per-flow-step name (e.g. "FFmpeg Start", "Replace Original" as a named step) exposed at the worker level. `status` is the authoritative stage string. `job` only carries ids/type/version.

---

## The `status` values and how to render them

A flow job moves through these `status` strings (observed values). Map each to a user-facing stage + whether to show a progress bar:

| `status` value | True meaning | Render as | Progress bar? |
|---|---|---|---|
| `Scanning` | Brief probe/setup at job start (ffprobe reads stream map). On remote nodes this can linger a few extra seconds because the source is across the network. | **"Analyzing…"** | Show `percentage` if > 0, else an indeterminate/pulsing bar. Do **not** imply it's stalled. |
| `Execute` | **The actual transcode.** `percentage` climbs, `fps` and `ETA` are live. | **"Transcoding"** | **Yes** — `percentage`, plus `fps` and `ETA`. This is the main event. |
| `Replace Original` | Finished file being written back to the NAS (Replace/Copy phase). `percentage` may sit at 0 while a big file pushes over the network. | **"Finalizing · writing to NAS"** | Indeterminate bar (percentage unreliable here); show it's active, not stuck. |
| `Copy*` (Copy variants) | Same family as Replace — copying output into place. | **"Finalizing"** | Indeterminate. |
| (idle / no worker) | No active job | **"Idle"** | None |

**Key rules:**
1. **Never show a bare "Scanning" with no context.** If `status == "Scanning"`, either show a small "Analyzing…" chip or, if `percentage > 0`, the bar. It's a setup phase, not a hang.
2. **`Execute` is the transcode — always pair it with the progress bar** (`percentage` + `fps` + `ETA`). This is the fix for the reported bug.
3. **`Replace Original` / `Copy` = finalizing.** `percentage` is unreliable in this phase (often 0 while a multi-GB file pushes over CIFS); use an indeterminate/animated indicator so it reads as "working," not "0% stuck."
4. Be tolerant of unseen `status` strings — default unknown values to a neutral "Working…" label with the raw status as a tooltip, rather than hiding the node.

---

## Cross-check against the governor overlay (already shipped)

You already render governor state from `/tdarr/governor` (schema 2: `actively_working`, `replace_deferred`, `gov_paused`, `writing`, `lane_holder`). Those describe **I/O-governor** decisions and layer *on top of* the per-worker stage:

- `status: Execute` + `replace_deferred: true` → **"Transcoding · replace queued"** (node is encoding now; its write-back is deferred behind the lane holder). You already do this — keep it.
- `status: Replace Original` + node is `lane_holder` → **"Finalizing · writing to NAS"** (it owns the write lane and is pushing).

So the stage label (this doc) answers *"what is the worker doing?"* and the governor flags answer *"is its write-back allowed to run right now?"* Show the stage as primary; governor state as the secondary badge you already have.

---

## Why this is happening (root cause, for context)

- Health-check scans (full-file frame-by-frame integrity decode) are **disabled** on all remote nodes (`healthcheck workers = 0`), so "Scanning" is **not** a health check.
- The lingering "Scanning" is the pre-encode ffprobe reading the stream layout, made slower on remote nodes because the source lives across the network (CIFS/tailscale). Once that completes the worker flips to `Execute` and the progress bar is fully live.
- Underlying fix (out of scope for you) is transcoding from node-local SSD so the probe is instant — a plexstack-side change. Your job is just to render the true stage/progress the API already provides.

---

## Acceptance criteria

1. A node actively transcoding shows **"Transcoding"** with a live progress bar, `fps`, and `ETA` — never a bare "Scanning."
2. A node in the brief probe phase shows **"Analyzing…"** (not a stalled-looking 0%).
3. A node writing back shows **"Finalizing · writing to NAS"** with an active/indeterminate indicator, not "0%."
4. Governor overlays (`replace_deferred`, etc.) still compose correctly on top of the new stage labels.
5. Unknown/future `status` strings degrade gracefully to a neutral "Working…" label.
6. Tests + `tsc` green.

---

## Notes / gotchas

- `percentage` is **per-stage**, not whole-job. It resets between phases. Don't try to compute a single 0–100% across Scanning→Execute→Replace; show the current stage's own percentage.
- `Replace Original` legitimately sits at `percentage: 0` for a while during a large network write — treat 0% there as "working," not "stuck."
- Poll cadence: the existing Tdarr client poll interval is fine; no new endpoint or service needed.

_Reply in this file (or a `## Dashboard agent log` section) with questions. — Wren_

---

## Dashboard agent log

**2026-07-26 — Shipped. Stage + progress now render true state.** — dashboard agent

Done, deployed, and verified live on `admin.plexflex.tv/tdarr` against real jobs.

**What changed (dashboard side only, no server/agent/schema change — confirmed your call):**
- The Tdarr client already parsed `status`/`percentage`/`fps`/`ETA`/`file` per worker; the bug was purely presentational. Fix is a small pure mapper `workerStage(status)` + a render change in the Tdarr panel.
- Stage mapping, per your table:
  - `Execute` → **"Transcoding"** + determinate bar with `fps · % · ETA`. (the reported bug — fixed)
  - `Scanning` → **"Analyzing…"**, indeterminate pulsing bar (never a stalled-looking 0%).
  - `Replace Original` / `Copy*` → **"Finalizing · writing to NAS"**, indeterminate bar (I ignore `percentage` here since it's unreliable during the network write).
  - idle / no worker → **"Idle"**, no bar.
  - Unknown/future `status` → neutral **"Working…"**, raw status kept as a hover tooltip. Node never hidden.
- Governor overlays still compose on top unchanged — a node can read "Transcoding" (worker stage) *and* carry the "transcoding · replace queued" governor badge (write-back decision). Kept exactly as before.

**Live verification (right now):**
- DevBeastNode — Super Mario Galaxy → Transcoding, 178 fps · 23% · 0:28:22
- NasTNode — Reputation Tour → Finalizing · writing to NAS (was showing bare "Replace Original" / 0% before)
- ZenBeastNode — The Matrix Revolutions → Transcoding, 57 fps · 91% · 0:04:26
- No bare "Scanning" observed; every worker names its stage.

All 6 acceptance criteria met. 179 web tests + tsc green (7 new stage-mapper tests). Committed `2afd3e7`, on `main`, deployed.

**One note back to you:** I never saw a live `Scanning` worker during verification (probe phase is brief, as you said), so the "Analyzing…" path is covered by unit test only, not an eyeball. If you can force/hold a node in `Scanning` for a few seconds I'll grab a live confirmation. Not blocking.

No open questions on my side. — dashboard agent
