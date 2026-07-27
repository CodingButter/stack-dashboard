import { and, eq, lt, sql } from "drizzle-orm";

import { newId } from "@/lib/auth";
import type { db as Db } from "@/db";
import { metrics, serviceStatus, snapshots } from "@/db/schema";

/** Retention windows. */
export const SERVICE_STATUS_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
export const METRICS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SNAPSHOTS_KEEP_PER_KIND = 50;

/**
 * Tiered metric downsampling. Raw (as-polled) rows collapse to hourly averages
 * once older than {@link RAW_TO_HOUR_MS}; hourly rows collapse to daily averages
 * once older than {@link HOUR_TO_DAY_MS}. Each collapse averages the finer rows
 * per (box, metric, bucket), writes one coarser row, and deletes its sources, so
 * old series stay dependable without hoarding per-tick rows.
 */
export const RAW_TO_HOUR_MS = 24 * 60 * 60 * 1000; // 1 day
export const HOUR_TO_DAY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface RetentionCounts {
  serviceStatusDeleted: number;
  metricsDeleted: number;
  snapshotsDeleted: number;
  metricsCollapsedRawToHour: number;
  metricsCollapsedHourToDay: number;
}

type Database = typeof Db;

/**
 * Collapse one metric-resolution tier: average every `from`-resolution row older
 * than `cutoff` into one `to`-resolution row per (box, metric, bucket), then
 * delete the source rows — all in a single transaction so a crash never leaves
 * both the collapsed row and its sources. Idempotent: a second run finds no
 * source rows for an already-collapsed bucket (the coarser row is a different
 * resolution and is excluded by the `from` filter).
 *
 * NOTE: hour->day averages the hourly rows, so the daily value is a mean-of-means,
 * not a sample-count-weighted mean. With uneven per-hour sample counts (e.g. poller
 * downtime) the daily point is slightly biased. This is standard/acceptable for a
 * monitoring throughput chart; read the daily series as indicative, not exact.
 */
async function collapseTier(
  database: Database,
  from: "raw" | "hour",
  to: "hour" | "day",
  bucket: "hour" | "day",
  cutoff: Date,
): Promise<number> {
  return database.transaction(async (tx) => {
    const buckets = await tx
      .select({
        box: metrics.box,
        metric: metrics.metric,
        bucket: sql<string>`date_trunc(${bucket}, ${metrics.at})`.as("bucket"),
        avg: sql<number>`avg(${metrics.value})`.as("avg"),
      })
      .from(metrics)
      .where(and(eq(metrics.resolution, from), lt(metrics.at, cutoff)))
      .groupBy(metrics.box, metrics.metric, sql`date_trunc(${bucket}, ${metrics.at})`);

    if (buckets.length === 0) return 0;

    await tx.insert(metrics).values(
      buckets.map((b) => ({
        id: newId(),
        box: b.box,
        metric: b.metric,
        value: b.avg,
        at: new Date(b.bucket),
        resolution: to,
      })),
    );

    await tx
      .delete(metrics)
      .where(and(eq(metrics.resolution, from), lt(metrics.at, cutoff)));

    return buckets.length;
  });
}

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

  // Collapse before the flat TTL delete so aging raw rows survive as coarser
  // averages. Hour→day first: a day-old batch just promoted to hourly should
  // not wait a full cycle to become daily once it crosses the 7-day line.
  const metricsCollapsedRawToHour = await collapseTier(
    database,
    "raw",
    "hour",
    "hour",
    new Date(now.getTime() - RAW_TO_HOUR_MS),
  );
  const metricsCollapsedHourToDay = await collapseTier(
    database,
    "hour",
    "day",
    "day",
    new Date(now.getTime() - HOUR_TO_DAY_MS),
  );

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
    metricsCollapsedRawToHour,
    metricsCollapsedHourToDay,
  };
}
