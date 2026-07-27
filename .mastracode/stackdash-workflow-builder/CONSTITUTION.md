# StackDash Page-Migration Apparatus — CONSTITUTION

The governing rulebook for the reusable, MastraCode-native page-migration apparatus.
It is **page-agnostic**: nothing Tdarr-specific belongs here. Tdarr is only the first
benchmark that proves the system. Every rule below is binding on every run and is the
rubric the adversarial reviewer scores against.

Substrate: MastraCode-native only — commands, skills, subagents, zod schemas, vitest
validators. **No `mastra` / `@mastra/*` runtime dependency is added.**

---

## 1. Substrate & conventions

- Test runner is the **repository-pinned Vitest**: `pnpm exec vitest run <file>`
  (preferred over `npx`). Workflow tests live under `scripts/workflow/tests/**` and are
  registered in `vitest.config.ts` `include` so the pinned command runs them verbatim.
- Canonical schemas live in `scripts/workflow/schemas/`, validators in
  `scripts/workflow/validators/`, their tests in `scripts/workflow/tests/`.
- Reusable apparatus (skills, agents, commands, schemas, validators) carries **no
  page-specific names, producers, states, paths, or terminology**. Page knowledge lives
  only in that page's run inputs and generated contracts.

## 2. Data-source classification — the fixed 3-axis rule (verbatim)

Every displayed metric MUST be classified on exactly one of these axes, with evidence:

1. **UDP 2Hz push** — cheap continuous values in Wren's blaster (governor, vitals, stream
   counts/bandwidth, worker/queue depth). Hard constraint: fire-and-forget over WireGuard,
   **1280-byte MTU, envelope already gzipped** — every new live field competes for that
   budget. Designs wanting many new live fields must fall back to HTTP.
2. **HTTP poll, tiered cadence** — fast 5s (downloads, plex sessions), **medium 10–15s
   (Tdarr nodes, *arr queues)**, slow 300s (plex-recent).
3. **New source / not-yet-captured** — flag loudly; sequence poller work BEFORE UI.

Producer truth: snapshots (not `poll_state`) are the source of truth for panel data;
`src/lib/panels/assemble.ts` keys off a stats snapshot whose `payload.box` matches the
poller's registration arg.

## 3. Transport kinds & stable IDs

- **Transport-kind enum:** `udp-push | http-poll | database-query | event-driven |
  local-derived | server-derived | static-config | unknown`.
- **Stable-ID rule:** `<page>.<region>.<section>.<component>.<field>`, each segment
  `[a-z0-9-]+`. IDs are generated from the supplied page configuration, never hard-coded.

## 4. Version-bump discipline (machine-checked via the `meta` block)

Every canonical artifact embeds a `meta` block (schema: `scripts/workflow/schemas/meta.ts`):

- `schemaVersion` — bumps when the **artifact schema** shape/semantics change.
- `contractVersion` — bumps when **this page's contract content** changes.
- The two are declared independently; an existing field's meaning must never silently
  change under the same version. A schema migration is always distinguishable from a
  page-contract change.
- Regenerating an approved contract requires a **contractVersion bump** with `supersedes`
  set to the prior version. Approved artifacts are never overwritten without recording
  what changed and why.
- `provenance ∈ live | fixture | static-analysis | mixed` governs what acceptance claims
  the artifact may support.

## 5. Gate policy

- Each phase does work → runs its gate → updates `PROGRESS.md` → commits.
- Gates are vitest files run with the pinned command. A phase is `passed` only when its
  gate is green; **partial output from a failed phase is never treated as approved**
  (status stays `blocked`/`failed`).
- Hard blockers (day one): complete field / component / state / action coverage;
  producer→consumer traceability for every displayed field; a known producer + update
  mechanism for every required field; **no required field with an unknown producer**; no
  redesigned component silently omitted; **no fabricated/placeholder production value**;
  verified critical actions; a functioning runtime implementation.
- Secondary refinements (minor visual polish, naming, optional optimization) are
  reported-only and must not wedge a run on cosmetics.

## 6. Independent-review principle (the coder never clears its own work)

The hard adversarial gate requires a reviewer that is **NOT the implementation agent**.
Order of preference:

1. the configured `adversarial_review` tool;
2. on tool failure, a **separate read-only review subagent or fresh review session** given
   the full brief (this Constitution, the contracts, redesign evidence, the implementation
   diff, runtime evidence, and the verbatim rubric).

A same-agent structured self-review MAY supplement but can NEVER independently clear
critical/high findings. The implementation agent must not resolve-and-self-approve its own
findings. If NO independent reviewer can run, the run **stops at the human approval gate**
and does NOT mark adversarial review passed. Record in `PROGRESS.md`: the original tool
failure and the identity/type of the fallback reviewer.

> Harness note: the configured `adversarial_review` tool has errored on this repo before
> (`(message.content ?? []).filter is not a function`). Phases 4 and 6 attempt the tool
> first; on failure, follow the principle above — never downgrade silently to same-agent
> self-review as the clearing authority.

## 7. Resumability, idempotency & stale-artifact protection

- **Every phase is safe to rerun** (idempotent): a rerun yields the same artifacts or a
  properly version-bumped supersession — never silent divergence.
- **Resume revalidates:** a completed phase may be trusted only after its recorded inputs
  and outputs are revalidated against the current tree.
- **Input manifest per run** (`runs/<page>/input-manifest.json`): every relevant file path
  with its git-blob or sha256 hash, design-screenshot references (path@sha), schema
  version, contract version, apparatus revision. Each phase records the slice it consumed.
- **Change detection:** a changed upstream hash marks the phase — and all downstream
  phases — `invalidated` in `PROGRESS.md`.
- **No stale feed-forward:** an `invalidated` or partial artifact cannot silently feed a
  later stage; later stages refuse stale inputs and require rerun.
- **PROGRESS.md status enum:** `pending | running | blocked | passed | invalidated`.

## 8. Acceptance status (explicit enum, never a binary pass)

Recorded in `acceptance-report.md` `meta` and in `PROGRESS.md`:

- `live-verified` — proven against live NAS/Tdarr, including transport/runtime behaviors.
  Requires `provenance: live|mixed` (schema-enforced).
- `fixture-verified-with-live-follow-up` — contract, rendering, mapping, state, and
  apparatus gates proven on **real captured fixtures**; live-only behaviors remain on a
  follow-up checklist. Requires `provenance: fixture|mixed` (schema-enforced) — a run that
  exercised **no** fixtures may NOT claim this status.
- `contract-only` — contracts drafted + validated by static analysis alone; **nothing**
  executed against live infra or captured fixtures yet. The honest status for a Phase-4
  contract stage. Requires `provenance: static-analysis` and a non-empty live follow-up
  checklist (schema-enforced). Must never be described as verified.
- `blocked` — a hard gate cannot be cleared (e.g. no independent reviewer); stop at human
  approval.
- `failed` — a gate produced a genuine failure.

> **Honesty rule (round-1 review lesson):** the acceptance status must match `provenance`.
> A static-analysis contract stage is `contract-only`, never `fixture-verified-*`. The
> schema now enforces this pairing so the two can never drift.

**Fixture-backed labeling rules:** when live data is unavailable, set `provenance:
"fixture"`, record why, enumerate exactly which fields/states/actions/runtime behaviors
were fixture-verified, preserve a live follow-up checklist, and mark anything that
fundamentally depends on live infrastructure as **pending live verification**. Never
invent/approximate/silently substitute production values. **Never** describe the page or
apparatus as fully live-verified from fixtures alone. The live follow-up pass must be able
to flip checklist items to `live-verified` **without rebuilding unrelated phases**.

## 9. Safe runtime-action policy

- Runtime automation is **read-only by default**. No destructive/disruptive/
  production-changing action without explicit human approval.
- Governor pause/resume, worker changes, queue mutations, service restarts, and file
  operations carry a documented **safety classification** (`read-only | reversible-write |
  disruptive | destructive`); non-read-only actions require a confirmation flow.
- Actions are proven via request-contract tests, RBAC tests, confirmation-flow tests,
  fixtures, or an approved safe test environment. **A visible UI button is not proof; a
  mocked action is never represented as a verified live action.**
- Any live action performed is recorded with expected effect, actual effect, rollback
  method, and evidence.
- Poller-restart verification may **inspect** service state automatically (read
  `ActiveEnterTimestamp`), but **restarting a production service requires explicit
  approval** unless the environment is pre-designated safe for automated restarts.
  Production shell access stays with the main loop, never a subagent.

## 10. Load-bearing footguns the apparatus must capture (cited as evidence)

- **Write-back producer trap:** Tdarr's `percentage` is per-stage and unreliably `0`
  during a large network write. Real progress is derived from
  `replaceProgress {writtenBytes,finalBytes,pct,mbps}` in `src/lib/panels/tdarr-stage.ts`.
  A naive `percentage`→producer mapping is a **"field shown without valid producer"**
  failure. (This is a Tdarr benchmark fact, recorded here as a reviewer hard-check —
  general apparatus logic stays page-agnostic.)
- **Poller is a separate systemd unit:** `stackdash-poller.service` runs
  `pnpm tsx src/poller/index.ts`, distinct from the web unit; `deploy/redeploy.sh` does not
  reliably bounce it. Runtime verification of any UDP/poll-sourced field must confirm the
  poller's `ActiveEnterTimestamp` is after the code change, else stale code is verified.
