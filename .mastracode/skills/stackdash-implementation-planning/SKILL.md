---
name: stackdash-implementation-planning
description: Turn approved contracts into an ordered, goal-ready implementation plan for the migrated page — sequencing gap/poller work before UI, wiring every field to its producer, and handling every required state. Use after the decision gate passes.
---

# stackdash-implementation-planning

Convert the approved, versioned contracts into a concrete build order.

## Procedure

1. Sequence any new-source/poller/endpoint/schema work FIRST (from `gap-analysis.md`); the UI
   cannot wire to a producer that does not exist.
2. For each component, plan its data wiring to the `data-contract` producer of record and its
   handling of every state in the `state-contract` (loading / empty / stale / unavailable /
   partial / error / ready).
3. Reuse existing derivations per the reuse audit; do not reinvent corrective derivations.
4. Plan the red/green proof: which validator run against the pinned baseline yields the
   failing `without.txt`, and the same validator against the new implementation yields the
   passing `with.txt`.

## Output

An implementation plan under `runs/<page>/reports/`, ordered and verifiable, that a goal judge
can check step-by-step.

## Rules

- Every displayed field/component/state/action must trace to a producer + mechanism before it
  is built.
- Keep the plan goal-ready: concrete steps, explicit verification, no vague instructions.
