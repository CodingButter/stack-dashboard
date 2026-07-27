---
name: stackdash-current-page-audit
description: Map the current implementation of a StackDash page — its poller client, assembler, panel schema, API route, component, page, and RBAC actions — so the migration knows exactly what already exists to reuse. Use after design-inventory, before contract generation.
---

# stackdash-current-page-audit

Produce an implementation map of the page as it exists today, so the migration reuses real
producers instead of reinventing them.

## Procedure

1. Locate the page's vertical slice by convention:
   - poller client: `src/poller/clients/<page>.ts`
   - assembler: `src/lib/panels/<page>-stage.ts` + `src/lib/panels/assemble.ts`
   - panel schema: `<page>PanelSchema` in `src/lib/panels/schemas.ts`
   - API route: `src/app/api/panels/<page>/route.ts`
   - component: `src/components/panels/<page>-panel.tsx`
   - page: `src/app/<page>/page.tsx`
   - RBAC actions: `src/actions/services/<page>.ts`
2. Record each file with its git-blob hash into the run's `input-manifest.json`.
3. For every value the current UI shows, trace it back to its producer (poller field,
   snapshot key, derivation, DB query). Note the update mechanism.
4. Capture existing derivations that must be reused rather than reinvented (e.g. any
   write-back / progress derivation that corrects a lying raw value).

## Output

An implementation-map note under `runs/<page>/inventories/` and the manifest slice consumed.
This feeds `stackdash-reuse-audit` and `stackdash-traceability`.

## Rules

- Producer truth is the snapshot, not `poll_state`; `assemble.ts` keys off a stats snapshot
  whose `payload.box` matches the poller's registration arg.
- Never assume a raw API field is the producer of record if a corrective derivation exists.
