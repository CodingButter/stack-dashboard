---
name: stackdash-traceability
description: Verify that every displayed field traces from a real producer to a real consumer, and record the links in the traceability-matrix. Use to prove producer→consumer coverage before the decision gate.
---

# stackdash-traceability

Prove that nothing is shown without a producer and nothing is produced without a consumer.

## Procedure

1. For every required field, establish a link: `fieldId → producerRef → consumerRef`.
2. Verify each link against real code — open the producer symbol and the consuming component,
   confirm the value actually flows. Only then set `verified: true`.
3. Confirm the `producerRef` in the traceability-matrix matches the `data-contract`'s
   `producerRef` for that field; a mismatch is a finding.
4. Flag any producer with no documented consumer (dead weight) and any consumer with no
   producer (field shown without a source).

## Output

A `traceability-matrix` artifact, and a green run of `checkTraceability`.

## Rules

- `verified: true` requires actually reading the code path, not asserting it.
- Producer→consumer coverage for every required field is a hard decision-gate criterion.
