---
name: stackdash-migrate:restart
description: Begin a clean StackDash migration run for the page in $ARGUMENTS while PRESERVING previous evidence and reports. Bumps to a new run/contract version; never overwrites approved artifacts silently.
goal: true
---

# /stackdash-migrate:restart <page>

Start a fresh migration run for **`$ARGUMENTS`** without destroying prior work.

## Argument validation (first, always)

- `$ARGUMENTS` must be exactly one token matching `^[a-z0-9-]+$`. Empty/missing/multiple/
  malformed → **STOP with an error**. Never default to `tdarr`.

## Restart procedure (per CONSTITUTION §4, §7)

1. **Preserve** the existing `runs/$ARGUMENTS/` evidence and reports and the current contracts
   under `docs/stackdash/contracts/$ARGUMENTS/`. Nothing is overwritten silently.
2. Begin a clean run: either a new versioned run directory or a `contractVersion` bump with
   `supersedes` set to the prior version, recording **what changed and why**.
3. Re-record a fresh `input-manifest.json` from the current tree.
4. Run the full workflow from Phase 0/Discovery using the same shared apparatus as
   `/stackdash-migrate` — a thin entry point, no duplicated logic.

## Rules

- Regenerating an approved contract REQUIRES a contract-version bump with `supersedes`.
- Partial output from a previously failed phase is never carried forward as approved.
