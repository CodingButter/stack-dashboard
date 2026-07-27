# StackDash Migration Apparatus — Improvements Log

Durable, cross-run record of every weakness found in the **reusable apparatus**
(schemas, validators, skills, agents, commands, constitution) and how it was fixed.
Per plan §non-negotiable: when a review exposes an apparatus weakness, the apparatus is
fixed and affected stages rerun — the weakness is never patched around only inside a
single page's implementation.

Scope note: this file records apparatus-level fixes only. Page-specific contract edits
live in that page's run directory and contract artifacts.

---

## 2026-07-27 — Phase 4, Tdarr, contract adversarial review (round 1)

Independent reviewer: `adversarial_review` tool, model `anthropic/claude-opus-4-8`
(independent of the implementation agent; tool succeeded). Three must-fix findings; one
was a genuine **apparatus** weakness, two were Tdarr contract-data errors surfaced by an
apparatus gap.

### AW-1 (apparatus) — acceptance-status enum could not honestly describe a contract-only stage
- **Weakness:** the `acceptanceStatus` enum had no value for "contracts drafted by static
  analysis, nothing executed against live infra or fixtures." The Tdarr report therefore
  claimed `fixture-verified-with-live-follow-up` while every artifact declared
  `provenance: static-analysis` — no fixtures were ever exercised. The schema permitted
  this contradiction (the fixture status only required a non-empty checklist, not matching
  provenance), so an overstated-honesty claim could pass the gate.
- **Fix (apparatus):**
  - Added a `contract-only` status to `acceptanceStatusSchema`
    (`scripts/workflow/schemas/artifacts.ts`).
  - Added two refines: `fixture-verified-with-live-follow-up` now requires
    `provenance ∈ {fixture, mixed}`; `contract-only` requires
    `provenance: static-analysis` **and** a non-empty live follow-up checklist. This makes
    acceptance status and provenance impossible to drift.
  - Documented the new status + honesty rule in `CONSTITUTION.md §8`.
  - Added regression tests in `scripts/workflow/tests/schemas.test.ts` (fixture-status on
    static-analysis provenance is rejected; contract-only happy path + both failure modes).
- **Rerun:** Tdarr `acceptance-report.json` corrected to `contract-only`; schemas + Tdarr
  contract gates re-run green.

### AW-2 (contract data, surfaced by review) — governor/write-back transport misclassified
- **Finding:** governor fields (running, streams, sab-limit, lane, age-secs, paused-nodes)
  and the write-back family (`writeback-pct`, `writeback-mbps`) were classified
  `server-derived` (HTTP snapshot). Real primary transport is a **2Hz WebSocket live push**
  (`useGovernorTelemetry` → `mergeGovernor`, `tdarr-panel.tsx`), with the HTTP snapshot as
  **fallback** — i.e. the udp-push axis of the 3-axis rule, not server-derived.
- **Fix (Tdarr contract):** reclassified all 10 fields to `udp-push` in `data-contract.json`
  and updated `producerRef`/`updateMechanism` + `traceability-matrix.json` to name the WS
  push as primary and `buildGovernor` as fallback. Documented the worker↔governor
  cross-source join (`govNodes.get(nodeName).replaceProgress`) in the write-back notes.
- **Apparatus note:** this was a data error, not an apparatus bug — the transport-kind enum
  already supported `udp-push`. No apparatus change required, but see AW-4 for a guardrail
  idea.

### AW-3 (contract data, surfaced by review) — `scan-library` mislabeled read-only, escaping confirmation
- **Finding:** action mapped to `safety: "read-only"`, `requiresConfirmation: false`, but the
  executor relays a `scan-files` (`scanFindNew`) mutation with a `libraryId` param — a
  side-effecting enqueue, not a read. The schema refine exempts only `read-only` from
  confirmation, so the mislabel skipped the gate.
- **Fix (Tdarr contract):** reclassified to `reversible-write`, `requiresConfirmation: true`,
  documented the registry-`safe`-vs-actual-mutation discrepancy, the rollback path, and the
  missing `libraryId` reachability risk in `action-contract.json`.

### Deferred / follow-up (risks & suggestions, not must-fix)
- Registry action ids live only in prose `handlerRef` — no machine-verifiable link to the
  real registry. Candidate future validator: assert each `handlerRef` id exists in
  `src/actions/registry`. Tracked, not yet built.
- `gap-analysis.md §4` reworded to state coverage as "producer identified by static
  analysis," not a runtime guarantee.
- Naming drift `worker.percentage` → real symbol `percent` corrected in contract notes.

### AW-4 (candidate future guardrail — not yet built)
A transport-classification cross-check that flags any field whose consumer imports a live
telemetry hook (`useGovernorTelemetry` / `mergeGovernor`) but is classified non-`udp-push`.
Would have caught AW-2 automatically. Logged for a later apparatus iteration.

---

## 2026-07-27 — Phase 5, Tdarr, implementation (contract↔code drift the gate missed)

### AW-5 (apparatus) — a fabricated `verified: true` traceability link passed every gate
- **Weakness:** the Phase-4 contracts declared `tdarr.analytics.charts.throughput.series`
  as produced by `assemble.ts (SeriesMap)` with `verified: true`, and both the coverage /
  traceability validators **and** two rounds of independent adversarial review accepted it.
  No such producer existed: `tdarrPanelSchema.series` carried only `queueDepth` +
  `workersActive`, and per-node write-back MB/s was an instantaneous scalar
  (`governor.nodes[].replaceProgress.mbps`), never persisted as a series. The traceability
  validator only checks that a matrix row exists with `verified: true` and a matching
  `producerRef` string — it never confirms the named producer **exists in source**. A
  plausible-sounding but fabricated `producerRef` therefore sails through.
- **Immediate resolution (this page):** rather than defer, the real producer was built —
  `tdarr.writeback.mbps` metric emitted in `agent.ts`, persisted, read back as
  `series.writebackMbps`, requested by the tdarr route; tiered downsampling added to
  retention. Contracts flipped back to `transportKind: database-query`, `required: true`,
  `verified: true` against the now-real producer. The chart still renders an explicit empty
  state until history accumulates. See `gap-analysis.md §3b`.
- **Fix (apparatus — candidate, not yet built):** a producer-existence check that resolves
  each `producerRef`'s named file/symbol against the repo and fails the traceability gate
  when the referenced producer cannot be located. This closes the class of bug where a
  `verified: true` link names a producer that does not exist. Logged for the next apparatus
  iteration; tracked alongside AW-4 (both are "the string is plausible but reality
  disagrees" guardrails).

### AW-6 (apparatus) — no durable, machine-checkable record of the ship-gate outcome
- **Weakness:** the acceptance report captured coverage, reviewer identity, and the live
  follow-up checklist, but the **outcome of the Phase-6 independent adversarial ship review**
  (pass/blocked, count of unresolved critical/high, which prior fixes were re-verified, which
  risks were accepted non-blocking) lived only in prose (PROGRESS.md) — not in a strict,
  machine-checkable artifact. A future run could claim "ship gate passed" without any schema
  forcing that claim to be honest.
- **Fix (apparatus — built):** added an optional `shipGate` block to `acceptanceReportSchema`
  (`scripts/workflow/schemas/artifacts.ts`): `{ verdict: pass|blocked, criticalHighFindings,
  priorFixesReVerified[], nonBlockingRisks[] }`, with a `.refine` that a `pass` verdict **cannot**
  carry `criticalHighFindings > 0`. It is optional so pre-ship-gate contracts (e.g. the Phase-4
  decision-gate state) validly omit it. Covered by a schema test asserting a dishonest
  `pass`-with-findings is rejected. The Tdarr acceptance report now records its ship-gate outcome
  in `acceptance-report.json.shipGate`.
- **Why this matters beyond Tdarr:** every future page's ship verdict is now durable contract
  metadata with the same anti-overstatement refine, so "we shipped it clean" is a claim the
  schema can enforce, not just prose.
