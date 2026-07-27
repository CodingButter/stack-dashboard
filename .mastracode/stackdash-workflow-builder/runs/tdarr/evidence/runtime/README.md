# Phase 5 — Runtime Verification Evidence (Tdarr)

Acceptance status for this run: **fixture-verified-with-live-follow-up** (per
CONSTITUTION §acceptance-status). The redesigned page is proven to render every
required state and to parse real production data through the branch code path;
items that can only be exercised by live infrastructure are listed as follow-up.

## Method

No Playwright/browser harness is installed in this repo; the established render
harness is `@testing-library/react` + jsdom (vitest). Runtime verification uses
two complementary probes:

1. **Per-state component render** — `src/components/panels/__tests__/tdarr-panel.states.test.tsx`
   drives the real `<TdarrPanel/>` through every state in `state-contract.json`
   by mocking `fetch` (feeds `usePanelData`) and `useGovernorTelemetry`. Asserts
   each state renders a concrete, non-empty presentation — no contracted
   component silently disappears.
2. **Live read-only parse** — a real read of the production DB through the
   branch's `buildTdarrPanel` + `tdarrPanelSchema.parse`, confirming real data
   flows through the new code path and validates against the new schema
   (including the added `series.writebackMbps` field). See `live-parse.txt`.

## What the render probe proves (state-contract coverage)

| State | Component(s) | Assertion |
|---|---|---|
| loading | panel root | "Loading Tdarr…" placeholder before data resolves |
| error | panel root | "Failed to load" surfaced on non-ok fetch |
| ready | KPI strip (6 cards) | Library files / transcodes / active-workers render with live-shaped numbers |
| ready | throughput chart | aggregate value rendered when history exists |
| empty | throughput chart | "No throughput history yet" when series empty |
| empty | queue-depth chart | "No data yet" when queue series empty |
| empty | node grid | "No nodes connected" (not a blank grid) |
| unavailable | governor (null) | "Governor status unavailable" (not a blank card) |
| stale | governor (running:false) | distinct dead/stale branch, not the live "Governing" headline |
| unavailable | service health | "Health unknown" (not silent collapse) |
| partial | node card | node card still renders when paused with no workers |

11/11 render assertions pass.

## Live read-only parse (production DB, read-only)

Confirmed against the production DB via Tailscale through the branch code path:
4 nodes, `stats.totalFiles` and `stats.totalTranscodes` populated, governor
running, `queueDepth`/`workersActive` series populated, `writebackMbps` empty
(**expected** — see poller-staleness note). Real payload parses cleanly through
`tdarrPanelSchema.parse` with the new `writebackMbps` field. See `live-parse.txt`.

## Poller-staleness check (critical, honest)

The `tdarr.writeback.mbps` metric emission was added to the poller
(`src/poller/clients/agent.ts`) **on this branch**. The production poller runs
as a **separate systemd user unit** (`stackdash-poller.service`) from the web
unit and is **not** restarted by a web deploy. Until that unit is restarted on
the target host, the metric will not accumulate and the throughput chart will
correctly render its empty state ("No throughput history yet") in production.

Per the safe runtime-action policy, restarting a production service requires
explicit human approval — **not** performed automatically here. This is recorded
as a live follow-up, not a failure: the empty-state rendering is itself the
correct, contracted behavior while history is absent.

## Live follow-up checklist (blocks a `live-verified` claim, not this gate)

- [ ] Restart `stackdash-poller.service` on the target host (explicit approval) so
      `tdarr.writeback.mbps` begins accumulating; confirm the throughput chart
      transitions from empty state to a real aggregate line.
- [ ] Verify tiered downsampling collapses raw→hour after 24h and hour→day after
      7d against real accumulated rows (cannot be exercised without >24h of live data).
- [ ] Exercise the RBAC-gated actions (pause/resume/set-worker-limit/cancel/scan)
      against a live node in a safe/approved environment.
- [ ] `scan-library` viewer-role side-effect + `libraryId` reachability (carried
      from the Phase-4 review risk list).

## What is NOT claimed

Fixture/live-parse verification proves rendering, schema compatibility, state
behavior, and that real data flows through the branch code path. It does **not**
claim: live UDP/WebSocket governor push delivery, poller-restart propagation,
downsampling behavior over real time windows, or real operational action effects.
Those remain on the live follow-up checklist above.
