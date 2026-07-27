---
name: stackdash-design-inventory
description: Decompose a redesign screenshot into the canonical page → region → section → component → field hierarchy with stable IDs. Use as the first discovery step of a StackDash page migration, before auditing the current implementation.
---

# stackdash-design-inventory

Turn the redesign evidence (a `*-redesign.png` under
`.mastracode/stackdash-workflow-builder/`) into a structured inventory that seeds the
`page-spec`, `component-inventory`, and `field-inventory` canonical artifacts.

## Procedure

1. Read the redesign screenshot for the target page. Record its `path@<sha>` as the
   `sourceDesignRef` for every artifact you seed.
2. Walk the layout top-to-bottom, left-to-right. Decompose into:
   `page → region → section → component → field`.
3. Assign a **stable ID** to every node using `<page>.<region>.<section>.<component>.<field>`,
   each segment `[a-z0-9-]+`. IDs are derived from the supplied page id — never hard-coded to
   another page's slug.
4. For every component, note the states it must render (loading / empty / stale / unavailable
   / partial / error / ready) based on what the design implies.
5. For every field, capture the human label and the component that displays it. Mark it
   `required` when the redesign clearly depends on it.

## Output

Feed the `stackdash-contract-generation` skill three lists: components (with required flag +
states), fields (with component id + required flag), and the page tree. Validate the emitted
`page-spec` / `component-inventory` / `field-inventory` with the Phase 1 schemas.

## Rules

- Do not invent fields the design does not show. A speculative field is worse than a gap.
- Every node you emit must cite the design region it came from (`designRef`).
- Stay page-agnostic in method: this skill classifies pixels into structure, not Tdarr-specific
  knowledge.
