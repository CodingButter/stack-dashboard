# Red/green baseline capture — Tdarr migration (Phase 0, amendment 6)

**Purpose:** fix the *red* input the branch-created validators run against, so the Phase 5
reproducible proof shows the **implementation** changed — not the test. The exact same
validator version + config runs against this baseline (`without.txt`) and against the
migrated implementation (`with.txt`).

## Baseline method: Git worktree pinned to the base revision

- **Base revision:** `f8c137f961fcfee6214845eef53b068d03138860` (branch point; `main` at Phase 0).
- **Apparatus branch:** `feat/stackdash-migration-apparatus` (created from that revision).
- The pre-migration Tdarr page implementation is the tree at the base revision. Rather than
  copy it here (drift risk), Phase 5 materializes it on demand with a pinned worktree:

  ```sh
  git worktree add --detach /tmp/stackdash-baseline f8c137f961fcfee6214845eef53b068d03138860
  # run the BRANCH's validator against /tmp/stackdash-baseline  -> without.txt (must fail red)
  # run the BRANCH's validator against the working tree          -> with.txt    (must pass green)
  git worktree remove /tmp/stackdash-baseline
  ```

- The pre-migration Tdarr surface at the base revision (recorded in `../../input-manifest.json`,
  `inputs.tdarrSlice`) is the fixed red input. Its `git-blob` hashes pin the exact bytes; any
  change to those files invalidates this baseline (plan §5b).

## The validator: implementation conformance

The contract validators (coverage/traceability/blockers) read the JSON artifacts and pass
on both trees — they cannot detect an implementation that omits a contracted component. The
red/green proof instead uses `checkImplementation` (`scripts/workflow/validators/implementation.ts`),
which asserts that, for every required component, the implementation *source* contains the
markers proving it is rendered. The validator logic is page-agnostic; the Tdarr-specific
marker map lives in `../../analysis/impl-markers.json` (run-scoped, not apparatus logic).

Test: `scripts/workflow/tests/tdarr-redgreen.test.ts`. It runs the identical validator +
marker map against the base revision (`git show f8c137f:<path>`) and the working tree,
writes `without.txt` (red) and `with.txt` (green), and asserts the outcomes differ — which
can only be true because the implementation changed, not the test.

## Result

- `without.txt` — baseline @ `f8c137f`: **17% coverage, 5 redesign components missing, blocking.**
- `with.txt` — migrated working tree: **100% coverage, no findings.**

## Why not snapshot the files here

Copying `src/app/tdarr/page.tsx` + the slice into this dir would create a second source of
truth that can silently diverge from the pinned revision. The worktree is byte-identical to
`f8c137f` by construction, so it is the safer red input. If a worktree cannot be created in a
given environment, Phase 5 falls back to snapshotting the `tdarrSlice` files at the base
revision into this directory via `git show f8c137f:<path>`.
