---
name: stackdash-migrate:resume
description: Resume the latest valid StackDash migration run for the page in $ARGUMENTS. Revalidates recorded inputs against the current tree, marks any changed-input phases invalidated, and continues from the first non-passed phase. Never trusts a stale or partial artifact.
goal: true
---

# /stackdash-migrate:resume <page>

Resume the migration workflow for **`$ARGUMENTS`** from where it left off — safely.

## Argument validation (first, always)

- `$ARGUMENTS` must be exactly one token matching `^[a-z0-9-]+$`. Empty/missing/multiple/
  malformed → **STOP with an error**. Never default to `tdarr`.

## Resume procedure (per CONSTITUTION §7)

1. Load `runs/$ARGUMENTS/PROGRESS.md` and `runs/$ARGUMENTS/input-manifest.json`.
2. **Revalidate inputs:** recompute the hash of every manifest input and run the stale-input
   guard (`checkStaleInputs`). Any changed/missing input marks its consuming phase — and all
   downstream phases — `invalidated`; record this in the PROGRESS invalidation log.
3. **Revalidate outputs:** a completed phase is trusted only if its artifacts still parse under
   the current schemas and were not invalidated in step 2.
4. Resume from the first phase whose status is not `passed`. Never feed a stale or partial
   artifact forward.
5. This is a thin entry point — it invokes the same shared apparatus as `/stackdash-migrate`;
   no workflow logic is duplicated here.

## Refuse to proceed if

- The run directory for `$ARGUMENTS` does not exist (nothing to resume — suggest
  `/stackdash-migrate $ARGUMENTS`).
- A hard gate previously left the run `blocked` for a reason that still holds (e.g. no
  independent reviewer available).
