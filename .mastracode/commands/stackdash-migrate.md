---
name: stackdash-migrate
description: Start the StackDash page-migration workflow for the page named in $ARGUMENTS. Runs the reusable apparatus (schemas, validators, skills, analyst subagents) end-to-end against the real page slice and its redesign, producing versioned contracts and a migrated page. Goal-ready.
goal: true
---

# /stackdash-migrate <page>

Start the standard StackDash migration workflow for the page **`$ARGUMENTS`**.

## Argument validation (do this first, always)

1. Treat `$ARGUMENTS` as the page identifier. Trim it.
2. Require **exactly one** token matching `^[a-z0-9-]+$`.
3. If it is empty, missing, multiple tokens, or malformed — **STOP with an error**. Never
   silently default to `tdarr` or any other page.

## What this command does

This is a **thin entry point**. It does not duplicate workflow logic; it invokes the shared
apparatus:

- schemas: `scripts/workflow/schemas/`
- validators: `scripts/workflow/validators/`
- rulebook: `.mastracode/stackdash-workflow-builder/CONSTITUTION.md`
- skills: the `stackdash-*` skills (design-inventory → contract-generation → traceability →
  reuse-audit → implementation-planning → runtime-verification → adversarial-review →
  workflow-regression)
- analyst subagents: page-intent, current-system auditor, data-contract, benchmark

## Workflow (per CONSTITUTION)

1. **Discovery** — page-intent analyst decomposes the redesign; current-system auditor maps
   the existing slice. Record the run's `input-manifest.json`.
2. **Contracts** — data-contract analyst classifies fields (3-axis rule), maps producers,
   finds gaps; generate the 8 versioned canonical artifacts under
   `docs/stackdash/contracts/$ARGUMENTS/`; run coverage + traceability validators + the
   prior-art reconciler.
3. **Decision gate** — independent adversarial review of the contracts. Do not implement until
   every hard criterion is green (§gate policy). If no independent reviewer can run → `blocked`.
4. **Implement** — build the migrated page wired to real producers, handling every required
   state; reuse existing derivations.
5. **Verify** — runtime verification (live-first, fixture-backed fallback with honest
   labeling); reproducible red/green proof.
6. **Ship checks** — full suite + validators + portability regression + independent adversarial
   review; write `acceptance-report.md` with an explicit acceptance status; human approval gate.

Update `.mastracode/stackdash-workflow-builder/runs/$ARGUMENTS/PROGRESS.md` (status enum
`pending | running | blocked | passed | invalidated`) after every phase, and commit per phase.
