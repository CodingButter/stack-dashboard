# Tdarr migration run — PROGRESS

**Run:** `tdarr` &nbsp;|&nbsp; **Branch:** `feat/stackdash-migration-apparatus` &nbsp;|&nbsp; **Base revision:** `f8c137f` (`main`)
**Acceptance status:** _not yet determined_ (`live-verified | fixture-verified-with-live-follow-up | blocked | failed`)

Phase status enum: `pending | running | blocked | passed | invalidated`

| Phase | Status | Gate | Notes |
|---|---|---|---|
| 0 — Baseline + red/green capture | passed | 3 Tdarr test files / 31 tests green; branch from `main`; base rev + baseline input recorded | worktree-pinned baseline; input-manifest written |
| 1 — Canonical schemas + meta-versioning + CONSTITUTION | pending | `pnpm exec vitest run scripts/workflow/tests/schemas.test.ts` | |
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
- **.gitignore:** the repo ignores all of `.mastracode/`; added negation rules so ONLY the apparatus subpaths (`skills/stackdash-*`, `agents/stackdash-*`, `commands/stackdash-migrate*`, `stackdash-workflow-builder/`) are tracked/reviewable, keeping `plans/` + plugin config ignored. Verified: apparatus paths tracked, others still ignored.
