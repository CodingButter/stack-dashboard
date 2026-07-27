---
name: stackdash-field-extraction
description: Extract the complete field surface a redesigned StackDash page must display, each with a stable ID, label, owning component, and required flag. Use to build the field-inventory canonical artifact.
---

# stackdash-field-extraction

Enumerate every value the redesigned page shows and normalize it into `field-inventory`
entries.

## Procedure

1. From the design inventory, list every discrete value rendered anywhere on the page —
   numbers, labels, badges, progress, timestamps, states.
2. Assign each a stable ID `<page>.<region>.<section>.<component>.<field>` and a human label.
3. Bind each field to the component that displays it (`componentId`).
4. Mark `required` when the redesign's meaning collapses without it.
5. De-duplicate: if the same value appears twice, it is one field with one producer, not two.

## Output

A `field-inventory` object validated by the Phase 1 schema. Every entry carries a `designRef`.

## Rules

- One value → one field → (later) one producer. Duplicate sources of truth are a review
  failure, so never mint two field IDs for the same underlying value.
- Do not extract fields the design does not actually render.
