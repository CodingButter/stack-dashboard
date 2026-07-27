# Tdarr — Gap Analysis & Prior-Art Reconciliation (contract v1.0.0)

Apparatus `164e0f0`. Workflow-generated contracts are **authoritative**; the
existing `dashboard-data-classification.md` is prior art and non-authoritative.
Drift is recorded here, never silently merged.

## 1. Write-back producer trap (resolved)

The redesign shows per-worker write-back progress + throughput on finalizing
node cards. The naive producer would be the worker's `percentage` — **wrong**:
Tdarr's `percentage` is per-stage and sits at `0` throughout a Replace/Copy
network write (`src/lib/panels/tdarr-stage.ts` header comment).

**Resolution:** `tdarr.nodes.grid.worker.writeback-pct` and `…writeback-mbps`
are mapped to `governor.nodes[].replaceProgress.{pct,mbps}` (`udp-push` — the
authoritative transport per the data-contract; the source is the NAS agent's 2 Hz
governor telemetry blaster, with the HTTP governor snapshot as fallback — round-2
reclassified these from `server-derived`; consumed when `workerStage().isFinalizing`).
The apparatus enforces this with a
config-driven forbidden-producer blocker: any write-back field produced by
`worker.percentage` is a critical finding. Verified green in
`scripts/workflow/tests/tdarr-contracts.test.ts`.

The distinct field `tdarr.nodes.grid.worker.transcode-pct` correctly *does* use
`worker.percentage`, but only during the `Execute` stage (`stage.isTranscoding`)
— the one phase where that value is trustworthy.

## 2. Governor states (resolved)

Two first-class states carried through, matching `buildGovernor`:
- `governor === null` → **unavailable** ("Governor unavailable"; never received /
  endpoint not deployed).
- `governor.running === false` → **stale** (gate dead/stale, or snapshot row
  older than `AGENT_STALE_MS`).

Both are covered in `state-contract.json` and gate green.

## 3. Prior-art drift (recorded)

`dashboard-data-classification.md` is a page-level census. For Tdarr it asserts
only coarse facts:
- Governor telemetry rides the `nas-telemetry` UDP union (governor, streams
  active+kbps). This **agrees** with the generated contract at the governor's
  transport level (server-derived from the agent/governor snapshot; the agent's
  own uplink is the UDP telemetry path).
- `buildTdarrPanel` is the assembler; `tdarr` is one of the HTTP pollers. Agrees
  with the generated data-contract (`http-poll`, medium cadence).

**Drift kind — `missing` (expected, not a defect):** every fine-grained Tdarr
redesign field in the generated inventory (26 fields) has no per-field entry in
the prior-art census. This is expected: the census never decomposed Tdarr to the
field level. The generated inventory supersedes it for the migrated page. No
`contradictory`, `duplicate`, or `ambiguous-owner` drift was found for Tdarr.

## 3b. Worker Throughput series (gap found in Phase 5, closed)

The redesign's "Worker Throughput" chart plots aggregate write-back MB/s over
"Last hour". Phase 5 implementation exposed a **contract↔code drift the Phase-4
gate missed**: the contract claimed `tdarr.analytics.charts.throughput.series`
was produced by `assemble.ts (SeriesMap)` with `verified: true`, but no such
producer existed — `tdarrPanelSchema.series` carried only `queueDepth` +
`workersActive` (worker *counts*, not MB/s), and per-node write-back MB/s existed
only as an instantaneous scalar (`governor.nodes[].replaceProgress.mbps`), never
persisted.

**Resolution:** built a real producer. `src/poller/clients/agent.ts` now emits
`tdarr.writeback.mbps` (summed per-node `replaceProgress.mbps`) each poll; the
metric persists to the `metrics` table; `buildTdarrPanel` reads it back as
`series.writebackMbps`; the tdarr API route requests it as a `metricSeries` pair.
A global tiered downsampling pass (raw→hourly at 24h, hourly→daily at 7d, averaged
per bucket, transaction-safe, idempotent) keeps the series dependable without
hoarding per-tick rows. The chart still renders an explicit **empty** state until
history accumulates — never a fabricated line. The apparatus weakness (validators
+ review missed the fabricated `verified: true` link) is recorded in
`WORKFLOW_IMPROVEMENTS.md`.

**Deferred (non-blocking):** the redesign mock draws one throughput line *per
node* (BigBeastNode, DevBeastNode, …). This pass ships the **aggregate total**
line only (the single `tdarr.writeback.mbps` sum). Per-node throughput series
(`tdarr.writeback.mbps.<node>`) is deferred as follow-on data-infrastructure work
and tracked on the acceptance-report live/follow-up checklist. The chart is
labeled "Write-back throughput (total)" so the UI never implies four independent
producers exist when only the aggregate does.

## 4. Open gaps (none blocking for contract stage)

No required field, component, state, or action is left without a producer
**identified by static analysis**. The 100% coverage and traceability figures mean
every field has a producer traced to real source code — they are a static-analysis
result, **not** a runtime guarantee that each field renders correctly live. Runtime
correctness is proven in Phase 5. Live-only behaviors (real write-back during a
Replace phase, live governor null/stale transitions over the 2Hz WebSocket push,
disruptive/destructive actions) are tracked in `acceptance-report.json`
`liveFollowUp` and proven in Phase 5, not here. Acceptance status for this stage is
`contract-only` (provenance `static-analysis`).
