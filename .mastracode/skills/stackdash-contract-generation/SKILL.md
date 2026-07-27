---
name: stackdash-contract-generation
description: Emit the canonical, versioned contract artifacts (page-spec, component/field inventories, data/state/action contracts, traceability matrix, acceptance report) with a valid meta block, validated by the Phase 1 schemas. Use to write and re-write contracts under docs/stackdash/contracts/<page>/.
---

# stackdash-contract-generation

Serialize the inventories and classifications into the 8 canonical JSON artifacts, each
carrying a versioned `meta` block.

## The 8 canonical artifacts

`page-spec` · `component-inventory` · `field-inventory` · `data-contract` · `state-contract` ·
`action-contract` · `traceability-matrix` · `acceptance-report` (plus `gap-analysis.md`).

## meta block (required on every artifact)

- `schemaVersion` bumps when the artifact SCHEMA changes; `contractVersion` bumps when THIS
  page's content changes. Declare both independently.
- `pageId`, `createdAt`, `updatedAt`, `apparatusVersion` (git sha of `scripts/workflow`),
  `sourceDesignRef` (`...png@<sha>`), `provenance` (`live|fixture|static-analysis|mixed`),
  `supersedes` (prior contractVersion or null).

## Procedure

1. Validate every artifact against `scripts/workflow/schemas` before writing it. A `.strict()`
   failure means a fabricated/placeholder field slipped in — fix it, don't suppress it.
2. Regenerating an approved contract requires a `contractVersion` bump with `supersedes` set,
   and a note of what changed and why. Never overwrite an approved artifact silently.
3. Write JSON artifacts to `docs/stackdash/contracts/<page>/`; keep working notes under
   `runs/<page>/`.

## Rules

- Schema-version changes must be distinguishable from page-contract changes.
- An existing field's meaning must never silently change under the same version.
