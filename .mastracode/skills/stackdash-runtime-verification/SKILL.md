---
name: stackdash-runtime-verification
description: Prove the migrated page renders and behaves correctly at runtime — live-first via pnpm dev + Playwright per state, or fixture-backed with honest labeling — while enforcing the safe runtime-action policy and the poller-restart staleness check. Use during Phase 5 verification.
---

# stackdash-runtime-verification

Prove runtime behavior honestly. Live data is used whenever reasonably available; otherwise
fixture-backed with an explicit follow-up checklist.

## Live-first procedure

1. Run the app (`pnpm dev`). Drive the page in-browser via Playwright: accessibility snapshot
   + screenshot per required state, asserting real values.
2. For any UDP/poll-sourced field, confirm the poller's `ActiveEnterTimestamp` is AFTER the
   code change — the poller is a **separate systemd unit** (`stackdash-poller.service`, runs
   `pnpm tsx src/poller/index.ts`) that `deploy/redeploy.sh` does not reliably bounce. If the
   poller predates the change, you are verifying stale code.
3. Set acceptance status `live-verified` only when transport/runtime behaviors are genuinely
   proven against live infrastructure.

## Fixture-backed fallback

When live NAS data is unavailable, use the repo's real captured fixtures
(`src/poller/clients/__fixtures__/<page>_*.json` — real shapes, never invented values) and:

- Set `provenance: "fixture"` and acceptance status `fixture-verified-with-live-follow-up`.
- Record WHY live was unavailable; enumerate exactly what was fixture-verified and what still
  needs live verification; preserve a live follow-up checklist in `acceptance-report.md`.
- Never describe the page as fully live-verified from fixtures alone.

## Safe runtime-action policy

- Read-only by default. No destructive/disruptive/production-changing action without explicit
  human approval.
- Governor pause/resume, worker/queue mutations, service restarts, file ops carry a documented
  safety classification; non-read-only actions require a confirmation flow.
- A visible UI button is not proof an action works; a mocked action is never a verified live
  action. Any live action is logged with expected effect, actual effect, rollback, evidence.
- Poller-restart verification may INSPECT service state automatically, but RESTARTING a
  production service requires explicit approval. Production shell access stays with the main
  loop, never a subagent.
