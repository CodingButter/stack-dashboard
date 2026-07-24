import { and, eq, lt, sql } from "drizzle-orm";

import type { db as Db } from "@/db";
import { metrics, serviceStatus, snapshots } from "@/db/schema";

/** Retention windows. */
export const SERVICE_STATUS_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
export const METRICS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SNAPSHOTS_KEEP_PER_KIND = 50;

export interface RetentionCounts {
  serviceStatusDeleted: number;
  metricsDeleted: number;
  snapshotsDeleted: number;
}

type Database = typeof Db;

/**
 * Prune old rows. Time-window deletes for status/metrics; keep-latest-N per
 * (service, kind) for snapshots so panels always have current state but jsonb
 * can't grow unbounded.
 */
export async function runRetention(
  database: Database,
  now: Date = new Date(),
): Promise<RetentionCounts> {
  const statusCutoff = new Date(now.getTime() - SERVICE_STATUS_TTL_MS);
  const metricsCutoff = new Date(now.getTime() - METRICS_TTL_MS);

  const statusDel = await database
    .delete(serviceStatus)
    .where(lt(serviceStatus.polledAt, statusCutoff))
    .returning({ id: serviceStatus.id });

  const metricsDel = await database
    .delete(metrics)
    .where(lt(metrics.at, metricsCutoff))
    .returning({ id: metrics.id });

  // Keep only the latest N snapshots per (service, kind).
  const groups = await database
    .select({ service: snapshots.service, kind: snapshots.kind })
    .from(snapshots)
    .groupBy(snapshots.service, snapshots.kind);

  let snapshotsDeleted = 0;
  for (const g of groups) {
    const keep = await database
      .select({ id: snapshots.id })
      .from(snapshots)
      .where(and(eq(snapshots.service, g.service), eq(snapshots.kind, g.kind)))
      .orderBy(sql`${snapshots.polledAt} desc`)
      .limit(SNAPSHOTS_KEEP_PER_KIND);
    const keepIds = keep.map((r) => r.id);
    if (keepIds.length < SNAPSHOTS_KEEP_PER_KIND) continue;
    const del = await database
      .delete(snapshots)
      .where(
        and(
          eq(snapshots.service, g.service),
          eq(snapshots.kind, g.kind),
          sql`${snapshots.id} not in ${keepIds}`,
        ),
      )
      .returning({ id: snapshots.id });
    snapshotsDeleted += del.length;
  }

  return {
    serviceStatusDeleted: statusDel.length,
    metricsDeleted: metricsDel.length,
    snapshotsDeleted,
  };
}
