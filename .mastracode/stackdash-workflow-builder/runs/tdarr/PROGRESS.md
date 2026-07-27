# Tdarr migration run — PROGRESS

**Run:** `tdarr` &nbsp;|&nbsp; **Branch:** `feat/stackdash-migration-apparatus` &nbsp;|&nbsp; **Base revision:** `f8c137f` (`main`)
**Acceptance status:** _not yet determined_ (`live-verified | fixture-verified-with-live-follow-up | blocked | failed`)

Phase status enum: `pending | running | blocked | passed | invalidated`

| Phase | Status | Gate | Notes |
|---|---|---|---|
| 0 — Baseline + red/green capture | passed | 3 Tdarr test files / 31 tests green; branch from `main`; base rev + baseline input recorded | worktree-pinned baseline; input-manifest written |
| 1 — Canonical schemas + meta-versioning + CONSTITUTION | passed | `pnpm exec vitest run scripts/workflow/tests/schemas.test.ts` → 17 passed | 8 canonical zod schemas + meta block + CONSTITUTION written |
| 2 — Validators + reconciler + stale-input guard | pending | `pnpm exec vitest run scripts/workflow/tests/validators.test.ts` | |
| 3 — Skills + subagents + namespaced commands | pending | `pnpm exec vitest run scripts/workflow/tests/commands.test.ts` | |
| 4 — Run apparatus on Tdarr → contracts → decision gate | pending | coverage+traceability validators + independent contract review | mid-run DECISION GATE |
| 5 — Implement + runtime-verify migrated page | pending | full suite + runtime validator + reproducible red/green | |
| 5.5 — Apparatus portability regression | pending | `pnpm exec vitest run scripts/workflow/tests/portability.test.ts` | synthetic non-Tdarr fixtures only |
| 6 — Ship checks | pending | full suite + all validators + independent adversarial review | human approval gate |

## Reviewer log
_(records: adversarial_review tool attempt + outcome; fallback reviewer identity/type if the tool fails; per plan §2 independent-review principle)_

- _none yet_

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
