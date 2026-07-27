---
name: stackdash-reuse-audit
description: Decide, per component/producer/derivation, whether to reuse existing code, extend it, or build new — preventing duplicate sources of truth and reinvented derivations. Use during implementation planning.
---

# stackdash-reuse-audit

Before building anything, decide what already exists and must be reused.

## Procedure

1. Cross-reference the required components/fields against the current-page audit.
2. For each, choose: **reuse** (wire to existing producer/derivation), **extend** (add to
   existing code), or **build-new** (only when nothing exists).
3. Explicitly reuse existing corrective derivations (e.g. a write-back/progress derivation)
   rather than re-deriving them — re-deriving risks reintroducing the raw-value trap.
4. Detect duplication: two components rendering the same value, two producers for one field,
   or a new derivation that duplicates an existing one.

## Output

A reuse-decision note under `runs/<page>/analysis/`, feeding `stackdash-implementation-planning`.

## Rules

- One value has exactly one producer of record. Duplicate sources of truth are a review
  failure.
- Prefer reuse; `build-new` requires justification that nothing existing fits.
