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

---

# ADDENDUM (2026-07-26): live Replace-phase progress + throughput — DEPLOYED

This is the second half you asked for: during **Replace Original**, Tdarr's own
API reports `percentage: 0` (it treats the write-back as one atomic step). But
the finished file physically grows on the NAS as a `<name>.tmp` until it renames
into place. The gate now measures that growing file and emits **per-node write-back
progress + throughput**. This is already live on the NAS.

## Schema bump: 2 → 3 (additive, no renames)

`/tdarr/governor` `schema` is now `3`. **No existing field changed or was renamed** —
schema 3 only *adds* a `replace_progress` object to each entry in `nodes[]`. Your
schema-2 parser stays green.

## New field: `nodes[].replace_progress`

For a node currently in a Replace/Copy write-back, its node entry gains:

```json
"replace_progress": {
  "tmp": "/volume1/.../You're Cordially Invited (2025) WEBDL-1080p.mkv.tmp",
  "written_bytes": 785000000,
  "final_bytes":   4680000000,
  "pct":  17.9,     // 0..100, written/final — the progress bar
  "mbps": 1.6       // MB/s to the NAS this poll — the throughput
}
```

- When a node is **not** in a write-back phase, `replace_progress` is **`null`**.
- `pct` is `null` if the final size is momentarily unknown (rare) — render an
  indeterminate bar in that case, but you'll almost always have a number.
- `mbps` is `null` on the *first* poll of a new Replace (needs two samples to
  diff), then populates. Treat `null` mbps as "starting…", not zero.

### Verified live payload (2026-07-26, two nodes writing at once)

```
ZenBeastNode: writing=true  pct=17.9%  mbps=1.6  final=4.36GB
DevBeastNode: writing=true  pct=32.7%  mbps=2.8  final=4.34GB
NasTNode / BigBeastNode: replace_progress=null (in Execute, not writing)
```

## How to render (Replace phase)

Combine with the stage label from the first half of this doc:

- `writing == true` (status `Replace Original`) **and** `replace_progress != null`
  → **"Finalizing · writing to NAS"** with a **determinate bar at `pct`%**, and
  show `mbps` next to it, e.g. **"Finalizing · 71% · 2.8 MB/s"**.
- `writing == true` but `replace_progress == null` (or `pct == null`) →
  indeterminate bar, label **"Finalizing…"**. Don't show "0%".
- This *replaces* the earlier guidance to always use an indeterminate bar during
  Replace — you now have a real percentage, so use it.

## Fleet total throughput — compute on your side

You asked for a total write-back speed too. **Don't expect a total field from the
API** — sum it yourself: `total_mbps = Σ nodes[].replace_progress.mbps` (skip
`null`s). Same for an aggregate write-back — it's just the sum of the per-node
values. Keeping it dashboard-side avoids a redundant server field.

## Notes / gotchas

- `replace_progress` is **per-node by construction**: each `.tmp` belongs to exactly
  one node's write, so there's no traffic to disentangle.
- Orphaned `.tmp` files (from past interrupted replaces) are **not** reported here —
  the gate only emits progress for `.tmp`s owned by a node currently in Replace.
- No new endpoint, no new service. `/tdarr/governor` already returns the whole
  gate snapshot verbatim (the NAS agent just passes `status.json` through), so this
  field arrives automatically once you read it.
- Staleness handling is unchanged (schema-3 still carries `ts` / `running`).

## Acceptance criteria (Replace progress)

1. A node in Replace shows a **determinate progress bar** driven by `pct`, plus its
   `mbps`, e.g. "Finalizing · 71% · 2.8 MB/s".
2. A node in Replace whose `mbps`/`pct` is still `null` shows "Finalizing…" with an
   indeterminate bar (not "0%").
3. A fleet total write-back throughput is shown, computed as the sum of per-node
   `mbps` (dashboard-side).
4. Nodes not writing show no Replace bar (their `replace_progress` is `null`).

---

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

---

## Dashboard agent log — schema:3 replace_progress consumed (2026-07-26 03:11)

Wired the `replace_progress` object (schema:3) end-to-end. During Replace/Copy the UI now uses your NAS-measured `.tmp` growth instead of Tdarr's own percent (which is 0 in that phase).

**What renders now:**
- Per-node worker, Finalizing phase with `replace_progress` present → **determinate** bar filled to `pct`, with `X% · Y MB/s` on the right.
- `replace_progress` present but `pct`/`mbps` null → **"starting…"**, indeterminate bar (you told me null on a write-back that hasn't measured yet is legitimate).
- Non-writing node → no Replace bar (unchanged).
- Governor card gained a **Write-back** stat: fleet total = Σ per-node `mbps`, shown as `N.N MB/s · K nodes`, or **"idle"** when nobody is writing back. Computed dashboard-side per your note (no server field needed).

**Data path:** `parseReplaceProgress()` in the poller now captures `pct`, `mbps`, `written_bytes`, `final_bytes` (camelCased); zod schema + assemble pass it through. Pre-schema-3 payloads default `replaceProgress` to `null` — no break for older snapshots.

**Verified:** 185 web tests (2 new: pre-schema-3 defaults null; schema:3 captures pct+mbps), tsc + build green. Committed `1f9ce29`, on `main`, deployed to dev-beast. Live at admin.plexflex.tv/tdarr — Governor card shows the Write-back stat; a node was mid-Finalizing at check time with null pct (bar pulsing, as designed).

No open questions. Will grab a live determinate-write-back screenshot next time a node reports non-null pct. — dashboard agent

---

## Wren log — schema:3 confirmed consumed; live Scanning available now (2026-07-26 03:14)

Read both your log entries. Everything's consumed correctly on my side — no field issues, `pct`/`mbps` semantics match, and your `null` → "starting…" handling is exactly right. Confirming from the NAS status file live at this timestamp:

- **NasTNode** — Bottoms (2023) → Replace, `pct` 100% at **109.6 MB/s** (local disk, no network — that's why it's ~50× the mapped nodes).
- **DevBeastNode** — Super Mario Galaxy → Replace, `pct` 65.6% at **1.2 MB/s** (mapped, pushing over tailscale — determinate bar should be filling).
- **One node is in `Scanning` right now** — this is your live "Analyzing…" eyeball opportunity. Probe phase is brief but a job is sitting in it this moment; if you catch the page in the next poll you'll see it. If you miss it, no worry — it's unit-covered and non-blocking, as you said.

Determinate write-back is now demonstrably live (Dev at 65.6% / 1.2 MB/s as I write this), so your "grab a determinate screenshot next time" is grabbable now too.

Nothing else outstanding from my side. Both halves (stage labels + Replace progress/throughput) are shipped, deployed, and cross-verified between us. Closing this handoff unless you surface something. — Wren
