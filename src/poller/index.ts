/**
 * Standalone poller worker. Run: `pnpm tsx src/poller/index.ts` (loop) or
 * `pnpm tsx src/poller/index.ts --once` (single cycle over every configured
 * service, then exit — used by the S3.3 live-proof gate).
 *
 * The worker owns three things: the timing loop (respecting per-service tiers
 * and circuit-breaker backoff), persistence of each outcome, and periodic
 * retention. Client pollers register themselves via ./registry (Segment S3.2).
 */
import { db } from "@/db";
import { persistOutcome, type PollOutcome } from "./persist";
import {
  BREAKER_THRESHOLD,
  POLL_TIMEOUT_MS,
  initBreaker,
  isDue,
  recordResult,
  startJitter,
  type BreakerState,
} from "./scheduler";
import { allPollers, type Poller } from "./registry";
import { runRetention } from "./retention";
import { loadServiceConfig } from "./settings";

// Register all service pollers (side-effect imports populate the registry).
import "./register-all";

const RETENTION_INTERVAL_MS = 60 * 60 * 1000; // hourly
const TICK_MS = 1_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`poll timeout after ${ms}ms`)), ms),
    ),
  ]);
}

async function pollOnce(poller: Poller): Promise<PollOutcome> {
  const started = Date.now();
  const cfg = await loadServiceConfig(poller.service);
  if (!poller.configured(cfg)) {
    return {
      service: poller.service,
      ok: false,
      latencyMs: 0,
      error: "not configured",
    };
  }
  try {
    const result = await withTimeout(poller.poll(cfg), POLL_TIMEOUT_MS);
    return {
      service: poller.service,
      latencyMs: Date.now() - started,
      ...result,
    };
  } catch (err) {
    return {
      service: poller.service,
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runOnce(): Promise<void> {
  const pollers = allPollers();
  console.log(`[poller] --once: ${pollers.length} services`);
  for (const poller of pollers) {
    const outcome = await pollOnce(poller);
    await persistOutcome(db, outcome);
    console.log(
      `[poller] ${outcome.service.padEnd(18)} ok=${outcome.ok} ` +
        `${outcome.latencyMs}ms${outcome.error ? ` err=${outcome.error}` : ""}`,
    );
  }
}

async function runLoop(): Promise<void> {
  const pollers = allPollers();
  const breakers = new Map<string, BreakerState>();
  const nextEligible = new Map<string, number>();
  const start = Date.now();
  for (const p of pollers) {
    breakers.set(p.service, initBreaker());
    nextEligible.set(p.service, start + startJitter(p.service));
  }

  console.log(`[poller] loop: ${pollers.length} services`);
  let lastRetention = 0;

  for (;;) {
    const now = Date.now();
    for (const poller of pollers) {
      const state = breakers.get(poller.service)!;
      if (now < (nextEligible.get(poller.service) ?? 0)) continue;
      if (!isDue(poller.service, state, now)) continue;

      const outcome = await pollOnce(poller);
      await persistOutcome(db, outcome);
      const next = recordResult(state, outcome.ok, Date.now());
      breakers.set(poller.service, next);
      if (!outcome.ok && next.consecutiveFailures === BREAKER_THRESHOLD) {
        console.warn(`[poller] ${poller.service} breaker tripped — backing off`);
      }
    }

    if (now - lastRetention >= RETENTION_INTERVAL_MS) {
      lastRetention = now;
      const counts = await runRetention(db);
      console.log(`[poller] retention`, counts);
    }

    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  if (once) {
    await runOnce();
    process.exit(0);
  }
  await runLoop();
}

main().catch((err) => {
  console.error("[poller] fatal", err);
  process.exit(1);
});
