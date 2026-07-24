import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { SnapRow, StatusRow, SeriesMap } from "./assemble";
import type { Point } from "./schemas";

/** Latest snapshot row per (service, kind). */
export async function latestSnapshots(): Promise<SnapRow[]> {
  const rows = await db.execute(sql`
    select distinct on (service, kind) service, kind, payload, polled_at
    from snapshots
    order by service, kind, polled_at desc
  `);
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    service: String(r.service),
    kind: String(r.kind),
    payload: r.payload,
    polledAt: new Date(r.polled_at as string),
  }));
}

/** Latest heartbeat per service. */
export async function latestStatuses(): Promise<StatusRow[]> {
  const rows = await db.execute(sql`
    select distinct on (service) service, ok, latency_ms, error, polled_at
    from service_status
    order by service, polled_at desc
  `);
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    service: String(r.service),
    ok: Boolean(r.ok),
    latencyMs: r.latency_ms === null ? null : Number(r.latency_ms),
    error: r.error === null ? null : String(r.error),
    polledAt: new Date(r.polled_at as string),
  }));
}

/**
 * Last `cells` poll outcomes per service, oldest → newest — feeds the
 * uptime TrackerStrips on panel headers.
 */
export async function statusHistory(
  services: string[],
  cells = 40,
): Promise<Record<string, StatusRow[]>> {
  if (services.length === 0) return {};
  const rows = await db.execute(sql`
    select service, ok, latency_ms, error, polled_at from (
      select service, ok, latency_ms, error, polled_at,
             row_number() over (partition by service order by polled_at desc) as rn
      from service_status
      where service in (${sql.join(services.map((s) => sql`${s}`), sql`, `)})
    ) t
    where rn <= ${cells}
    order by polled_at asc
  `);
  const out: Record<string, StatusRow[]> = {};
  for (const r of rows as unknown as Array<Record<string, unknown>>) {
    (out[String(r.service)] ??= []).push({
      service: String(r.service),
      ok: Boolean(r.ok),
      latencyMs: r.latency_ms === null ? null : Number(r.latency_ms),
      error: r.error === null ? null : String(r.error),
      polledAt: new Date(r.polled_at as string),
    });
  }
  return out;
}

/**
 * Recent series for a set of (box, metric) pairs in one round trip.
 * Returns points ascending, keyed `metric` (single box) or `box:metric`.
 */
export async function metricSeries(
  pairs: Array<{ box: string; metric: string }>,
  opts: { minutes?: number; maxPoints?: number; keyByBox?: boolean } = {},
): Promise<SeriesMap> {
  if (pairs.length === 0) return {};
  const minutes = opts.minutes ?? 60;
  const maxPoints = opts.maxPoints ?? 180;

  const pairCond = sql.join(
    pairs.map((p) => sql`(box = ${p.box} and metric = ${p.metric})`),
    sql` or `,
  );
  const rows = await db.execute(sql`
    select box, metric, value, at from (
      select box, metric, value, at,
             row_number() over (partition by box, metric order by at desc) as rn
      from metrics
      where (${pairCond})
        and at > now() - make_interval(mins => ${minutes})
    ) t
    where rn <= ${maxPoints}
    order by at asc
  `);

  const out: SeriesMap = {};
  for (const r of rows as unknown as Array<Record<string, unknown>>) {
    const key = opts.keyByBox
      ? `${String(r.box)}:${String(r.metric)}`
      : String(r.metric);
    const point: Point = {
      at: new Date(r.at as string).toISOString(),
      v: Number(r.value),
    };
    (out[key] ??= []).push(point);
  }
  return out;
}
