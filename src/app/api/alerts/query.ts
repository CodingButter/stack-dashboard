/**
 * Alert read/ack queries for the /alerts page + shell badge. Kept out of the
 * route so they're importable by the server page directly.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { alerts } from "@/db/schema";

export interface AlertRow {
  id: string;
  ruleId: string;
  severity: "critical" | "warning" | "info";
  target: string;
  message: string;
  firstSeen: string;
  lastSeen: string;
  resolvedAt: string | null;
  acked: boolean;
}

const SEVERITY_RANK = sql`case ${alerts.severity}
  when 'critical' then 0 when 'warning' then 1 else 2 end`;

function toRow(a: typeof alerts.$inferSelect): AlertRow {
  return {
    id: a.id,
    ruleId: a.ruleId,
    severity: a.severity,
    target: a.target,
    message: a.message,
    firstSeen: a.firstSeen.toISOString(),
    lastSeen: a.lastSeen.toISOString(),
    resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
    acked: a.acked,
  };
}

/** Open alerts, severity-sorted then newest-first. */
export async function listActiveAlerts(): Promise<AlertRow[]> {
  const rows = await db
    .select()
    .from(alerts)
    .where(isNull(alerts.resolvedAt))
    .orderBy(SEVERITY_RANK, desc(alerts.lastSeen));
  return rows.map(toRow);
}

/** Recently-resolved alerts (history tail). */
export async function listResolvedAlerts(limit = 50): Promise<AlertRow[]> {
  const rows = await db
    .select()
    .from(alerts)
    .where(sql`${alerts.resolvedAt} is not null`)
    .orderBy(desc(alerts.resolvedAt))
    .limit(limit);
  return rows.map(toRow);
}

/** Count of un-acked, un-resolved alerts — the shell badge number. */
export async function activeAlertCount(): Promise<number> {
  const rows = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(alerts)
    .where(and(isNull(alerts.resolvedAt), eq(alerts.acked, false)))) as Array<{
    n: number;
  }>;
  return rows[0]?.n ?? 0;
}

/**
 * Acknowledge an open alert (mutes the badge without resolving). Returns the
 * updated row, or null if the id doesn't exist / is already resolved.
 */
export async function ackAlert(id: string, userId: string): Promise<AlertRow | null> {
  const rows = await db
    .update(alerts)
    .set({ acked: true, ackedBy: userId })
    .where(and(eq(alerts.id, id), isNull(alerts.resolvedAt)))
    .returning();
  return rows[0] ? toRow(rows[0]) : null;
}
