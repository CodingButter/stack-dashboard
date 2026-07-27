# Tdarr migration run — PROGRESS

**Run:** `tdarr` &nbsp;|&nbsp; **Branch:** `feat/stackdash-migration-apparatus` &nbsp;|&nbsp; **Base revision:** `f8c137f` (`main`)
**Acceptance status:** _not yet determined_ (`live-verified | fixture-verified-with-live-follow-up | blocked | failed`)

Phase status enum: `pending | running | blocked | passed | invalidated`

| Phase | Status | Gate | Notes |
|---|---|---|---|
| 0 — Baseline + red/green capture | passed | 3 Tdarr test files / 31 tests green; branch from `main`; base rev + baseline input recorded | worktree-pinned baseline; input-manifest written |
| 1 — Canonical schemas + meta-versioning + CONSTITUTION | passed | `pnpm exec vitest run scripts/workflow/tests/schemas.test.ts` → 17 passed | 8 canonical zod schemas + meta block + CONSTITUTION written |
| 2 — Validators + reconciler + stale-input guard | passed | `pnpm exec vitest run scripts/workflow/tests/validators.test.ts` → 25 passed | coverage/traceability/3 blockers + reconciler + stale guard, each red+green |
| 3 — Skills + subagents + namespaced commands | passed | `pnpm exec vitest run scripts/workflow/tests/commands.test.ts` → 29 passed | 12 skills + 4 read-only agents + 4 namespaced commands + page-id guard |
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
