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
import { httpFetch } from "./clients/http";
import {
  LOG_PULL_INTERVAL_MS,
  pullLogs,
  runLogRetention,
  type AgentFetcher,
} from "./logs";
import { runAlertCycle } from "@/alerts";
import { sendPush } from "@/lib/notifications/send";
import { NewMediaDetector, dispatchNewMedia } from "./new-media";

// Register all service pollers (side-effect imports populate the registry).
import "./register-all";

const RETENTION_INTERVAL_MS = 60 * 60 * 1000; // hourly
const ALERT_INTERVAL_MS = 15_000; // evaluate rules every 15 s
const TICK_MS = 1_000;

// One detector for the process lifetime — holds the per-section seen-set so a
// new title only notifies once. First poll after startup seeds silently.
const newMediaDetector = new NewMediaDetector();

/** Fire new-media push for a plex-recent outcome. Never throws. */
async function dispatchNewMediaSafe(outcome: PollOutcome): Promise<void> {
  if (outcome.service !== "plex-recent" || !outcome.ok || !outcome.snapshots) {
    return;
  }
  try {
    await dispatchNewMedia(newMediaDetector, outcome.snapshots, sendPush);
  } catch (err) {
    console.warn(`[poller] new-media dispatch failed:`, err);
  }
}

async function runAlertsSafe(): Promise<void> {
  try {
    const summary = await runAlertCycle(db);
    if (summary.opened || summary.resolved) {
      console.log(
        `[poller] alerts +${summary.opened} -${summary.resolved} ` +
          `(refreshed ${summary.refreshed}, pending ${summary.pending})`,
      );
    }
  } catch (err) {
    console.warn(`[poller] alert cycle failed:`, err);
  }
}

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

/** Bearer-authed fetcher against the NAS agent's log endpoints. */
async function makeAgentFetcher(): Promise<AgentFetcher | null> {
  const cfg = await loadServiceConfig("agent");
  if (!cfg.url || !cfg.apiKey) return null;
  const base = cfg.url.replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${cfg.apiKey}` };
  return {
    async get<T>(path: string): Promise<T | null> {
      const res = await httpFetch<T>(`${base}${path}`, { headers });
      return res.ok && res.data !== undefined ? res.data : null;
    },
  };
}

async function pullLogsSafe(): Promise<void> {
  try {
    const agent = await makeAgentFetcher();
    if (!agent) return;
    const { pulled, errors } = await pullLogs(db, agent);
    const total = Object.values(pulled).reduce((a, b) => a + b, 0);
    if (total > 0) console.log(`[poller] logs +${total}`, pulled);
    for (const e of errors) console.warn(`[poller] logs error: ${e}`);
  } catch (err) {
    console.warn(`[poller] logs pull failed:`, err);
  }
}

async function runOnce(): Promise<void> {
  const pollers = allPollers();
  console.log(`[poller] --once: ${pollers.length} services`);
  for (const poller of pollers) {
    const outcome = await pollOnce(poller);
    await persistOutcome(db, outcome);
    await dispatchNewMediaSafe(outcome);
    console.log(
      `[poller] ${outcome.service.padEnd(18)} ok=${outcome.ok} ` +
        `${outcome.latencyMs}ms${outcome.error ? ` err=${outcome.error}` : ""}`,
    );
  }
  await pullLogsSafe();
  await runAlertsSafe();
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
  let lastLogPull = 0;
  let lastAlerts = 0;

  for (;;) {
    const now = Date.now();
    for (const poller of pollers) {
      const state = breakers.get(poller.service)!;
      if (now < (nextEligible.get(poller.service) ?? 0)) continue;
      if (!isDue(poller.service, state, now)) continue;

      const outcome = await pollOnce(poller);
      await persistOutcome(db, outcome);
      await dispatchNewMediaSafe(outcome);
      const next = recordResult(state, outcome.ok, Date.now());
      breakers.set(poller.service, next);
      if (!outcome.ok && next.consecutiveFailures === BREAKER_THRESHOLD) {
        console.warn(`[poller] ${poller.service} breaker tripped — backing off`);
      }
    }

    if (now - lastLogPull >= LOG_PULL_INTERVAL_MS) {
      lastLogPull = now;
      await pullLogsSafe();
    }

    if (now - lastAlerts >= ALERT_INTERVAL_MS) {
      lastAlerts = now;
      await runAlertsSafe();
    }

    if (now - lastRetention >= RETENTION_INTERVAL_MS) {
      lastRetention = now;
      const counts = await runRetention(db);
      console.log(`[poller] retention`, counts);
      try {
        const logCounts = await runLogRetention(db);
        console.log(`[poller] log retention`, logCounts);
      } catch (err) {
        console.warn(`[poller] log retention failed:`, err);
      }
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
