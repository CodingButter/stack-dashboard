---
name: stackdash-workflow-regression
description: Prove the migration apparatus is genuinely reusable by exercising it on generic/synthetic non-Tdarr fixtures — canonical schemas accept another page shape, validators block omissions without page-specific names, and no page-specific knowledge leaks into reusable logic. Use for the Phase 5.5 portability gate.
---

# stackdash-workflow-regression

Prove portability without migrating any real second page. Uses synthetic non-Tdarr fixtures
only.

## What to prove

1. Canonical schemas accept a valid **non-Tdarr** page shape (stable IDs generated from the
   supplied page config, not hard-coded to any slug).
2. Validators detect omissions **without relying on page-specific names** — a required-field
   failure and a missing-component failure are correctly blocked on the synthetic page.
3. The migration command accepts a configurable page identifier + input set.
4. Skills assume no page-specific components, producers, states, paths, or terminology.
5. Transport classification handles `udp-push | http-poll | database-query | local-derived |
   event-driven | static-config | unknown` generically.
6. **Leak check:** page-specific knowledge (e.g. the Tdarr write-back trap) lives only in
   benchmark inputs/contracts/adapters — never in reusable apparatus logic.

## Gate

`pnpm exec vitest run scripts/workflow/tests/portability.test.ts` — synthetic-page acceptance
passes; the two failure fixtures are blocked; the leak check passes.

## Rules

- This gate must NOT migrate Downloads, Overview, or any production page. Portability is proven
  with synthetic fixtures only.
