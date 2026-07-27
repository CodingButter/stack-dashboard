---
name: stackdash-data-gap-analysis
description: Find every field the redesign needs that the current system cannot yet produce, and sequence the poller/endpoint/schema work required before the UI can be built. Use to produce gap-analysis.md.
---

# stackdash-data-gap-analysis

Compare the required field surface against what the current system actually produces and
record the gaps.

## Procedure

1. Join `field-inventory` (required fields) against `data-contract` (mapped producers) and the
   current-page audit (what exists today).
2. For each required field with transport kind `unknown` or no real producer, record a gap:
   what is missing, which source would provide it, and the poller/endpoint/schema/API work
   needed.
3. Sequence gap work BEFORE the UI that depends on it — never wire a component to a producer
   that does not exist yet.
4. Distinguish a genuine new-source gap from a field that already exists under a different
   name (that is drift for the reconciler, not a gap).

## Output

`gap-analysis.md` under `docs/stackdash/contracts/<page>/`, listing each gap with its
required upstream work and sequencing.

## Rules

- A required field with an unresolved gap is a hard blocker for the decision gate.
- Loudly flag any `unknown` transport kind; silence here becomes a review failure later.
