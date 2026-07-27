/**
 * Alert engine wiring for the poller worker (Segment 06). Holds the singleton
 * engine (so two-strike streaks persist across cycles) and exposes a single
 * `runAlertCycle` the worker calls each poll tick.
 */
import type { db as DbType } from "@/db";
import { sendPush } from "@/lib/notifications/send";
import { AlertEngine } from "./engine";
import { makeNotifyingStore } from "./notifying-store";
import { RULES } from "./rules";
import { assembleRuleInput, makeAlertStore } from "./store";

export { AlertEngine } from "./engine";
export { RULES, ALERT_THRESHOLDS, setThreshold } from "./rules";
export type { Rule, RuleInput, Breach, Severity } from "./types";

let engine: AlertEngine | null = null;

function getEngine(): AlertEngine {
  return (engine ??= new AlertEngine(RULES));
}

export async function runAlertCycle(
  database: typeof DbType,
  opts: { now?: Date; certExpiresInMs?: number | null } = {},
): Promise<{ opened: number; refreshed: number; resolved: number; pending: number }> {
  const input = await assembleRuleInput(database, opts);
  const store = makeNotifyingStore(makeAlertStore(database), sendPush);
  return getEngine().tick(input, store);
}
