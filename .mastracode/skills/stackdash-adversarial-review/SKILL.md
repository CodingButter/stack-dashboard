---
name: stackdash-adversarial-review
description: Run the hard adversarial gate via an INDEPENDENT reviewer that hunts missing fields/components/states/actions, data shown without a valid producer, duplicate sources of truth, unhandled states, broken/simulated actions, and overstated completion claims. Use at the contract decision gate (Phase 4) and the ship gate (Phase 6).
---

# stackdash-adversarial-review

The coder never clears its own work. This skill runs an independent review and refuses to
self-approve.

## Independent-review principle

1. Attempt the configured `adversarial_review` tool first (keyed to the plan path so reviewers
   keep memory across rounds).
2. On tool failure, dispatch a **separate read-only review subagent or fresh review session**
   with the full brief: CONSTITUTION, the contracts, redesign evidence, the implementation
   diff, runtime evidence, and the verbatim rubric.
3. A same-agent structured self-review MAY supplement but can NEVER independently clear
   critical/high findings. If no independent reviewer can run, mark the phase `blocked` and
   stop at the human approval gate — do NOT mark review passed.
4. Record in `PROGRESS.md`: the tool attempt + outcome, and the fallback reviewer identity/type.

## What the reviewer actively hunts

- Missing required fields / components / states / actions.
- Data shown without a valid producer — especially a corrective-derivation trap (e.g. a
  progress field mapped to a raw `percentage` instead of the write-back derivation).
- Producers with no documented consumer; wrong update mechanism vs the 3-axis rule.
- Duplicate sources of truth; unhandled states (e.g. `governor` null never-received vs
  `running:false` dead).
- Broken/simulated actions; false or overstated completion claims (fixture proof passed off
  as live); contract↔code drift; visual omissions vs the redesign.

## Gate

No pass with unresolved critical/high findings. Medium/low deferrable only if documented and
justified. If a review exposes an APPARATUS weakness, fix the apparatus and rerun affected
stages — do not patch around it inside one page.
