import { newId } from "@/lib/auth";
import type { db as Db } from "@/db";
import { metrics, serviceStatus, snapshots } from "@/db/schema";

type Database = typeof Db;

export interface PollOutcome {
  service: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
  /** current-state payloads to persist as snapshots, keyed by kind. */
  snapshots?: Array<{ kind: string; payload: unknown }>;
  /** numeric time-series points. */
  metrics?: Array<{ box: string; metric: string; value: number }>;
}

/** Persist one service's poll outcome: status heartbeat + snapshots + metrics. */
export async function persistOutcome(
  database: Database,
  outcome: PollOutcome,
  now: Date = new Date(),
): Promise<void> {
  await database.insert(serviceStatus).values({
    id: newId(),
    service: outcome.service,
    ok: outcome.ok,
    latencyMs: outcome.latencyMs,
    error: outcome.error ?? null,
    polledAt: now,
  });

  if (outcome.snapshots?.length) {
    await database.insert(snapshots).values(
      outcome.snapshots.map((s) => ({
        id: newId(),
        service: outcome.service,
        kind: s.kind,
        payload: s.payload,
        polledAt: now,
      })),
    );
  }

  if (outcome.metrics?.length) {
    await database.insert(metrics).values(
      outcome.metrics.map((m) => ({
        id: newId(),
        box: m.box,
        metric: m.metric,
        value: m.value,
        at: now,
      })),
    );
  }
}
