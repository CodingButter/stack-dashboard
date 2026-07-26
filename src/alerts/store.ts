/**
 * Drizzle-backed AlertStore + RuleInput assembler (Segment 06). The pure engine
 * (engine.ts) and rules (rules.ts) never touch the DB — this module is the only
 * I/O seam, so it can be swapped for an in-memory fake in tests.
 */
import { and, eq, gte, isNull, sql, inArray } from "drizzle-orm";

import type { db as DbType } from "@/db";
import { alerts, logLines } from "@/db/schema";
import { newId } from "@/lib/auth";
import type { AgentStats, SmartDrive } from "@/poller/clients/agent";
import type { TdarrNode } from "@/poller/clients/tdarr";
import type { AlertStore, OpenAlert } from "./engine";
import type { Breach, RuleInput, StatusInput } from "./types";

type Db = typeof DbType;

export function makeAlertStore(database: Db): AlertStore {
  return {
    async listOpen(): Promise<OpenAlert[]> {
      const rows = await database
        .select({
          id: alerts.id,
          ruleId: alerts.ruleId,
          target: alerts.target,
          severity: alerts.severity,
          message: alerts.message,
        })
        .from(alerts)
        .where(isNull(alerts.resolvedAt));
      return rows.map((r) => ({
        id: r.id,
        ruleId: r.ruleId,
        target: r.target,
        severity: r.severity,
        message: r.message,
      }));
    },

    async open(b: Breach, now: Date): Promise<void> {
      await database.insert(alerts).values({
        id: newId(),
        ruleId: b.ruleId,
        severity: b.severity,
        target: b.target,
        message: b.message,
        firstSeen: now,
        lastSeen: now,
      });
    },

    async refresh(id: string, b: Breach, now: Date): Promise<void> {
      await database
        .update(alerts)
        .set({ lastSeen: now, message: b.message, severity: b.severity })
        .where(eq(alerts.id, id));
    },

    async resolve(ids: string[], now: Date): Promise<void> {
      if (ids.length === 0) return;
      await database
        .update(alerts)
        .set({ resolvedAt: now })
        .where(inArray(alerts.id, ids));
    },
  };
}

// ------------------------------------------------------- input assembly

const AGENT_STALE_MS = 5 * 60 * 1000;

function latestSnap<T>(
  rows: Array<{ service: string; kind: string; payload: unknown; polledAt: Date }>,
  service: string,
  kind: string,
): { payload: T; polledAt: Date } | null {
  const row = rows.find((r) => r.service === service && r.kind === kind);
  return row ? { payload: row.payload as T, polledAt: row.polledAt } : null;
}

/**
 * Read the freshest cluster state into a RuleInput. Uses the same latest-per
 * pattern as the panels, plus a 60 s ssh-failure count and (optionally) a cert
 * expiry supplied by the caller.
 */
export async function assembleRuleInput(
  database: Db,
  opts: { now?: Date; certExpiresInMs?: number | null } = {},
): Promise<RuleInput> {
  const now = opts.now ?? new Date();

  const snapRows = (await database.execute(sql`
    select distinct on (service, kind) service, kind, payload, polled_at
    from snapshots
    order by service, kind, polled_at desc
  `)) as unknown as Array<Record<string, unknown>>;
  const snaps = snapRows.map((r) => ({
    service: String(r.service),
    kind: String(r.kind),
    payload: r.payload,
    polledAt: new Date(r.polled_at as string),
  }));

  // Latest status + a short failure streak per service (for service.down /
  // breaker escalation). Pull the last 6 polls per service in one round trip.
  const statusRows = (await database.execute(sql`
    select service, ok, error, polled_at from (
      select service, ok, error, polled_at,
             row_number() over (partition by service order by polled_at desc) as rn
      from service_status
    ) t where rn <= 6
    order by service, polled_at desc
  `)) as unknown as Array<Record<string, unknown>>;

  const byService = new Map<string, Array<{ ok: boolean; error: string | null; at: Date }>>();
  for (const r of statusRows) {
    const s = String(r.service);
    (byService.get(s) ?? byService.set(s, []).get(s)!).push({
      ok: Boolean(r.ok),
      error: r.error === null ? null : String(r.error),
      at: new Date(r.polled_at as string),
    });
  }
  const statuses: StatusInput[] = [];
  for (const [service, hist] of byService) {
    // hist is newest-first
    let consecutiveFailures = 0;
    for (const h of hist) {
      if (h.ok) break;
      consecutiveFailures++;
    }
    const latest = hist[0];
    const breakerOpenMs =
      consecutiveFailures >= 3 && latest
        ? now.getTime() - hist[Math.min(consecutiveFailures, hist.length) - 1].at.getTime()
        : null;
    statuses.push({
      service,
      ok: latest?.ok ?? true,
      error: latest?.error ?? null,
      consecutiveFailures,
      breakerOpenMs,
    });
  }

  const agentSnap = latestSnap<AgentStats>(snaps, "agent", "stats");
  const agent =
    agentSnap && now.getTime() - agentSnap.polledAt.getTime() < AGENT_STALE_MS
      ? agentSnap.payload
      : null;
  const smart = latestSnap<SmartDrive[]>(snaps, "agent", "smart")?.payload ?? [];
  const tdarrNodes =
    latestSnap<{ nodes: TdarrNode[] }>(snaps, "tdarr", "nodes")?.payload.nodes ?? [];

  const sshRow = (await database
    .select({ n: sql<number>`count(*)::int` })
    .from(logLines)
    .where(
      and(
        eq(logLines.source, "auth"),
        gte(logLines.ts, new Date(now.getTime() - 60_000)),
        sql`${logLines.message} ~* 'failed password|authentication failure|invalid user'`,
      ),
    )) as Array<{ n: number }>;
  const sshFailuresLastMin = sshRow[0]?.n ?? 0;

  return {
    now,
    statuses,
    agent,
    smart,
    tdarrNodes,
    sshFailuresLastMin,
    certExpiresInMs: opts.certExpiresInMs ?? null,
  };
}
