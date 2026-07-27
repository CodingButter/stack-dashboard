# Tdarr migration run — PROGRESS

**Run:** `tdarr` &nbsp;|&nbsp; **Branch:** `feat/stackdash-migration-apparatus` &nbsp;|&nbsp; **Base revision:** `f8c137f` (`main`)
**Acceptance status (Phase 4 contract stage):** `contract-only` (provenance `static-analysis`; nothing executed against live infra or fixtures yet) — full enum: `live-verified | fixture-verified-with-live-follow-up | contract-only | blocked | failed`

Phase status enum: `pending | running | blocked | passed | invalidated`

| Phase | Status | Gate | Notes |
|---|---|---|---|
| 0 — Baseline + red/green capture | passed | 3 Tdarr test files / 31 tests green; branch from `main`; base rev + baseline input recorded | worktree-pinned baseline; input-manifest written |
| 1 — Canonical schemas + meta-versioning + CONSTITUTION | passed | `pnpm exec vitest run scripts/workflow/tests/schemas.test.ts` → 17 passed | 8 canonical zod schemas + meta block + CONSTITUTION written |
| 2 — Validators + reconciler + stale-input guard | passed | `pnpm exec vitest run scripts/workflow/tests/validators.test.ts` → 25 passed | coverage/traceability/3 blockers + reconciler + stale guard, each red+green |
| 3 — Skills + subagents + namespaced commands | passed | `pnpm exec vitest run scripts/workflow/tests/commands.test.ts` → 29 passed | 12 skills + 4 read-only agents + 4 namespaced commands + page-id guard |
| 4 — Run apparatus on Tdarr → contracts → decision gate | passed | `pnpm exec vitest run scripts/workflow/tests/` → 85 passed (coverage/traceability/blocker gates 100%); independent review round 1 = 3 must-fix, all fixed; round 2 re-review = **0 must-fix, passes** | mid-run DECISION GATE PASSED — round-1 fixes verified against source by independent reviewer; 2 non-blocking risks carried to Phase 5 follow-up |
| 5 — Implement + runtime-verify migrated page | running | full suite + runtime validator + reproducible red/green | data layer done (`959f20e`): throughput series producer + tiered downsampling; contracts flipped to real verified producer. UI reorg + states + runtime verify next |
| 5.5 — Apparatus portability regression | pending | `pnpm exec vitest run scripts/workflow/tests/portability.test.ts` | synthetic non-Tdarr fixtures only |
| 6 — Ship checks | pending | full suite + all validators + independent adversarial review | human approval gate |

## Reviewer log
_(records: adversarial_review tool attempt + outcome; fallback reviewer identity/type if the tool fails; per plan §2 independent-review principle)_

- **Phase 4 contract review — round 1** (`adversarial_review` tool, model `anthropic/claude-opus-4-8`, independent of the implementation agent). Tool succeeded. Outcome: **3 must-fix (critical/high)** — (1) acceptance status `fixture-verified-with-live-follow-up` contradicts `provenance: static-analysis` (nothing fixture-verified); (2) governor fields incl. write-back family misclassified `server-derived` — real primary transport is a **2Hz WebSocket live push** (`useGovernorTelemetry` → `mergeGovernor`, HTTP snapshot is fallback) = udp-push axis; (3) `scan-library` mislabeled `read-only` (it enqueues a `scan-files` mutation) letting it escape the confirmation refine. Plus risks (scan-library libraryId/reachability, registry-id only in handlerRef prose, cross-source join undocumented) and naming drift (`percentage` vs `percent`). All 3 must-fix verified against real code and accepted. **Fixes applied (this commit):** AW-1 → added `contract-only` acceptance status + provenance-pairing refines in `scripts/workflow/schemas/artifacts.ts` (apparatus-level fix, regression tests added), report corrected to `contract-only`; AW-2 → 10 governor/write-back fields reclassified `udp-push` (2Hz WS push primary, HTTP fallback) in data-contract + traceability-matrix; AW-3 → `scan-library` → `reversible-write` + `requiresConfirmation: true`. Suggestions applied: gap-analysis §4 reworded (static-analysis not runtime guarantee), `percentage`→`percent` naming, cross-source join documented. Apparatus weakness AW-1 recorded in `WORKFLOW_IMPROVEMENTS.md`. Full suite green (50 files / 427 tests).
- **Phase 4 contract review — round 2** (same `adversarial_review` tool + model, continued memory on the plan_path; re-verified fixes against real source, not the summary). Outcome: **0 must-fix — stage passes.** Reviewer independently confirmed: (1) enum hardening closes the honesty gap; (2) `udp-push` is the constitutionally-correct axis for governor fields (source axis = Wren's blaster per CONSTITUTION §2; WebSocket is the delivery hop), write-back producer remains `replaceProgress` (trap held); (3) `scan-library` → `reversible-write` matches real code and now hits the confirmation refine. Two non-blocking risks (scan-library viewer-role side-effect; libraryId reachability) added to `acceptance-report.json` liveFollowUp for Phase 5. Version discipline: `contractVersion` stays `1.0.0` (v1.0.0 never approved — rejected at round 1 — so no supersession bump required; reviewer concurred).

**DECISION GATE — all criteria met:** field/component/state/action coverage 100%; every required field has a known producer + update mechanism; producer→consumer traceability valid; prior-art drift reviewed + recorded (gap-analysis.md); all critical/high contract-review findings resolved by an INDEPENDENT reviewer (implementation agent did not self-clear); acceptance status honestly `contract-only`. Proceeding to Phase 5.

## Invalidation log
_(records: which manifest input changed, which phases were marked `invalidated`, and when; per plan §5b)_

- _none yet_

## Phase 0 detail — Baseline (passed)

- **Branch:** `feat/stackdash-migration-apparatus` created from `main` @ `f8c137f961fcfee6214845eef53b068d03138860`.
- **Baseline tests (pinned runner):** `pnpm exec vitest run` on
  `src/lib/panels/__tests__/tdarr-stage.test.ts` (7),
  `src/app/api/panels/__tests__/panels.test.ts` (12),
  `src/components/panels/__tests__/pipeline.test.ts` (12) → **31 passed / 0 failed**. No pre-existing failures; nothing classified out-of-scope.
- **Red/green baseline:** base revision recorded; red input = worktree pinned to `f8c137f` (see `evidence/baseline/README.md`). `tdarrSlice` git-blob hashes pin the exact pre-migration bytes.
- **Input manifest:** `input-manifest.json` written (tdarr slice, design evidence, fixtures, prior-art) with per-input hashes + hashKind.
## Phase 4 detail — Tdarr contracts + decision gate (running)

- **Generated artifacts** under `docs/stackdash/contracts/tdarr/` (contract v1.0.0,
  apparatus `164e0f0`, provenance `static-analysis`): `page-spec.{json,md}`,
  `component-inventory.json`, `field-inventory.json` (26 fields), `data-contract.json`,
  `state-contract.json`, `action-contract.json` (6 real RBAC actions),
  `traceability-matrix.json`, `acceptance-report.json`, `gap-analysis.md`.
- **Producers verified against real code:** KPI + node fields `http-poll` medium
  (`src/poller/clients/tdarr.ts`); governor `server-derived` from `buildGovernor`
  (`src/lib/panels/assemble.ts`) with `null`=unavailable / `running:false`=stale;
  worker stage `local-derived` via `workerStage` (`src/lib/panels/tdarr-stage.ts`).
- **Write-back trap resolved:** `writeback-pct`/`writeback-mbps` → `replaceProgress.{pct,mbps}`
  from the governor node, NOT `worker.percentage`. Enforced by config-driven
  `no-forbidden-producer` blocker + an explicit producer assertion.
- **Gate:** `pnpm exec vitest run scripts/workflow/tests/tdarr-contracts.test.ts` → **12 passed**.
  Schema validity (8 artifacts) + field/component/state/action coverage all 100% +
  producer→consumer traceability fully verified + all 3 hard blockers clean + prior-art
  reconciliation (no contradictory/duplicate/ambiguous drift; 26 fields recorded as
  expected `missing` supersession). Full suite green (50 files / 425 tests).
- **Decision gate — remaining:** independent contract adversarial review (tool-first;
  fallback per §2). Row stays `running` until that clears.

## Phase 5 detail — Implement + runtime-verify (running)

### 5a–5a5 — Data layer: write-back throughput series + tiered downsampling (`959f20e`)
- **Drift found (AW-5):** implementation exposed a contract↔code drift the Phase-4 gate and
  two review rounds missed — `tdarr.analytics.charts.throughput.series` was `verified: true`
  against `assemble.ts (SeriesMap)`, but no MB/s series producer existed (`series` carried
  only `queueDepth` + `workersActive`; per-node write-back MB/s was an instantaneous scalar).
  The traceability validator matches producerRef strings but never confirms the producer
  exists in source. Recorded in `WORKFLOW_IMPROVEMENTS.md` with a proposed producer-existence
  guardrail.
- **Resolution — built the real producer** (per user direction, in-scope): `src/poller/clients/agent.ts`
  emits `tdarr.writeback.mbps` (sum of governor per-node `replaceProgress.mbps`) each poll,
  box `tdarr`; only the `nas` agent serves the governor endpoint so no double-count.
- **Tiered downsampling** (`src/poller/retention.ts`): global collapse of every metric — raw→hour
  at 24h, hour→day at 7d, averaged per (box, metric, bucket) via `date_trunc`, each tier a single
  transaction (insert coarse row + delete sources), idempotent. New `metric_resolution` enum +
  `resolution` column (default `raw`) + index (migration `0005_nervous_the_spike.sql`). 60-min
  panel reads are unaffected (rows younger than 24h are all `raw`).
- **Read path:** `series.writebackMbps` added to `tdarrPanelSchema`, read in `buildTdarrPanel`,
  requested by the Tdarr API route `metricSeries` pairs.
- **Contracts flipped back:** throughput.series → `transportKind: database-query`, `required: true`,
  `verified: true` against the now-real producer; chart still renders an explicit empty state
  until history accumulates. `gap-analysis.md §3b` documents the found-and-closed gap.
- **Gate:** retention collapse + idempotency tests added (5 retention tests); `tdarr-contracts.test.ts`
  12 passed; workflow + poller + panels + app suites **259 passed**. Typecheck clean (app).

## Phase 3 detail — Skills + subagents + commands (passed)

- **12 skills** under `.mastracode/skills/stackdash-*/SKILL.md`: design-inventory,
  current-page-audit, field-extraction, data-source-classification (3-axis rule + MTU budget),
  data-gap-analysis, contract-generation, traceability, reuse-audit, implementation-planning,
  runtime-verification (poller-restart staleness check + safe-action policy), adversarial-review
  (independent-review principle), workflow-regression.
- **4 read-only analyst subagents** under `.mastracode/agents/stackdash-*/AGENT.md`:
  page-intent-analyst, current-system-auditor, data-contract-analyst, benchmark-analyst. Each
  declares `tools: read-only` and references only real skills.
- **4 namespaced slash commands** under `.mastracode/commands/`: `stackdash-migrate.md`
  (`goal: true`) + `stackdash-migrate/{resume,restart,dry-run}.md`. Command names auto-derive
  from the directory (`stackdash-migrate:resume` etc.) per the SDK loader. Each validates
  `$ARGUMENTS` as exactly one `[a-z0-9-]+` slug, never defaults to a page, and invokes the
  shared apparatus (no duplicated workflow logic). dry-run is read-only.
- **Command format verified against the SDK loader** (`@mastra/code-sdk` slash-command-loader):
  YAML frontmatter `name`/`description`/`namespace`/`goal`; directory nesting →
  `namespace:subname`; `$ARGUMENTS`/`$1` substitution. The reusable `validatePageId` guard lives
  in `scripts/workflow/utilities/page-id.ts`.
- **Gate:** `pnpm exec vitest run scripts/workflow/tests/commands.test.ts` → **29 passed**.
  Asserts every skill/agent/command exists + is well-formed, agents reference real skills,
  commands reference the shared apparatus + `$ARGUMENTS`, and the page-id guard rejects
  empty/missing/multi/malformed and never defaults. Full suite green (413 tests).

## Phase 2 detail — Validators + reconciler + stale guard (passed)

- **Validators:** `scripts/workflow/validators/{types,coverage,traceability,blockers,reconciler,stale-input,index}.ts`.
  - Coverage: field, component, state, action (each returns a 0–100 `coveragePct`).
  - Traceability: required field → verified producer→consumer link; producerRef
    mismatch + orphan-producer checks.
  - Hard blockers: `no-unknown-producer` (unknown transport kind / placeholder producer
    text), `no-omitted-component`, `no-forbidden-producer` (config-driven — the Tdarr
    `percentage` trap is supplied as a regex pattern, NOT baked into apparatus logic).
  - Prior-art reconciler: emits `missing | stale | contradictory | duplicate |
    ambiguous-owner` drift; generated contracts authoritative, drift recorded not merged.
  - Stale-input guard: pure function; a changed/missing manifest input invalidates its
    consuming phase + all downstream phases and blocks stale feed-forward.
- **Gate:** `pnpm exec vitest run scripts/workflow/tests/validators.test.ts` → **25 passed**.
  Every blocker proven with a red (must-fail) AND green (must-pass) fixture; reconciler
  proven on a known-drift fixture hitting all 5 drift kinds; stale-input invalidation
  proven for earliest-input, later-input, and missing-input cascades.
- `tsc --noEmit` clean for `scripts/workflow`.

## Phase 1 detail — Schemas + CONSTITUTION (passed)

- **Schemas:** `scripts/workflow/schemas/{meta,primitives,artifacts,index}.ts` — 8 canonical
  artifact schemas (page-spec, component-inventory, field-inventory, data-contract,
  state-contract, action-contract, traceability-matrix, acceptance-report), each embedding
  the versioned `meta` block, the stable-ID rule, and the transport-kind enum. `.strict()`
  everywhere so fabricated/placeholder fields can't ride along.
- **Gate:** `pnpm exec vitest run scripts/workflow/tests/schemas.test.ts` → **17 passed**.
  Covers: valid parse of all 8; malformed `meta` (bad semver, missing/unknown provenance,
  independent schema-vs-contract version, strict unknown-key rejection); http-poll cadence
  requirement; governor null vs running:false as distinct states; non-read-only action
  confirmation requirement; fixture-status follow-up-checklist requirement; live-verified
  blocked on fixture provenance.
- **CONSTITUTION.md** written: substrate, 3-axis rule verbatim, stable-IDs, transport kinds,
  version-bump discipline, gate policy, independent-review principle, resumability/stale
  rules, acceptance-status enum, safe runtime-action policy, load-bearing footguns.
- **vitest.config.ts:** added `scripts/workflow/tests/**/*.test.ts` to `include` so the
  pinned gate command (`pnpm exec vitest run scripts/workflow/tests/<file>`) runs verbatim
  — vitest 4 treats a positional arg as a filter against `include`, not an override, so
  tests outside `src/**` needed registration. Verified the full existing suite still green.
- `tsc --noEmit` clean for `scripts/workflow` (2 pre-existing `.next/` Plex-route errors are
  unrelated to this work).

## Phase 0 detail — Baseline (passed)

- **.gitignore:** the repo ignores all of `.mastracode/`; added negation rules so ONLY the apparatus subpaths (`skills/stackdash-*`, `agents/stackdash-*`, `commands/stackdash-migrate*`, `stackdash-workflow-builder/`) are tracked/reviewable, keeping `plans/` + plugin config ignored. Verified: apparatus paths tracked, others still ignored.
