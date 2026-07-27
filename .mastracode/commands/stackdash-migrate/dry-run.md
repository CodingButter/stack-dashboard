---
name: stackdash-migrate:dry-run
description: Discovery + input validation + workflow-readiness checks ONLY for the page in $ARGUMENTS. Reports what the migration would consume and whether it is ready to run. Makes no page modification and mutates no contract.
---

# /stackdash-migrate:dry-run <page>

Check readiness for migrating **`$ARGUMENTS`** without changing anything.

## Argument validation (first, always)

- `$ARGUMENTS` must be exactly one token matching `^[a-z0-9-]+$`. Empty/missing/multiple/
  malformed → **STOP with an error**. Never default to `tdarr`.

## What this does (read-only)

1. **Discovery preview:** confirm the redesign screenshot and the page's vertical slice exist
   by convention (poller client, assembler, panel schema, API route, component, page, RBAC
   actions). Report anything missing.
2. **Input validation:** compute the would-be `input-manifest.json` (paths + hashes) and, if a
   prior manifest exists, run the stale-input guard to report which phases WOULD be invalidated.
3. **Workflow-readiness:** confirm the apparatus is intact — schemas parse, validators import,
   the `stackdash-*` skills and analyst subagents resolve, and an independent reviewer path is
   available (tool or fallback). Report readiness.

## Hard constraints

- **No page modification. No contract mutation.** This command must not write to
  `docs/stackdash/contracts/$ARGUMENTS/` or edit any source file.
- Output is a readiness report only: what would be consumed, what is missing, what would be
  invalidated, and whether the run can proceed.
