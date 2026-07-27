import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { metrics, serviceStatus, snapshots } from "@/db/schema";
import {
  HOUR_TO_DAY_MS,
  METRICS_TTL_MS,
  RAW_TO_HOUR_MS,
  SERVICE_STATUS_TTL_MS,
  SNAPSHOTS_KEEP_PER_KIND,
  bucketTruncExpr,
  runRetention,
} from "../retention";

/**
 * In-memory shim reproducing exactly the drizzle call chains runRetention uses:
 *   db.delete(t).where(...).returning(...)
 *   db.select(...).from(snapshots).groupBy(...)
 *   db.select(...).from(snapshots).where(...).orderBy(...).limit(n)
 *
 * We don't evaluate the SQL conditions; we assert the orchestration:
 * time-window deletes fire for status/metrics, and snapshots prune to keep-N.
 */
function makeShim() {
  const deletes: Array<{ table: unknown; deleted: number }> = [];

  // A fake snapshots dataset: 2 groups, one over the keep limit.
  const overLimit = SNAPSHOTS_KEEP_PER_KIND + 10;
  const groupsData = [
    { service: "plex", kind: "sessions", count: overLimit },
    { service: "sonarr", kind: "queue", count: 5 },
  ];

  let groupCursor = 0;

  // Metric collapse runs inside a transaction and selects/groups from `metrics`.
  // By default there are no metric rows, so both tiers collapse nothing and the
  // snapshot/status assertions below are undisturbed. Collapse-specific tests
  // pass a `metricRows` set to exercise the averaging path.
  const collapse = {
    // buckets returned by the grouped select, per tier call in order
    tierBuckets: [] as Array<Array<{ box: string; metric: string; bucket: string; avg: number }>>,
    inserted: [] as Array<{ resolution: string; value: number; count: number }>,
  };
  let tierCursor = 0;

  function metricsTx() {
    return {
      select() {
        return {
          from(table: unknown) {
            if (table !== metrics) throw new Error("unexpected tx select");
            return {
              where() {
                return {
                  async groupBy() {
                    return collapse.tierBuckets[tierCursor++] ?? [];
                  },
                };
              },
            };
          },
        };
      },
      insert(table: unknown) {
        if (table !== metrics) throw new Error("unexpected tx insert");
        return {
          async values(rows: Array<{ resolution: string; value: number }>) {
            for (const r of rows)
              collapse.inserted.push({
                resolution: r.resolution,
                value: r.value,
                count: rows.length,
              });
          },
        };
      },
      delete(table: unknown) {
        if (table !== metrics) throw new Error("unexpected tx delete");
        return { async where() {} };
      },
    };
  }

  const database = {
    async transaction(fn: (tx: unknown) => Promise<number>) {
      return fn(metricsTx());
    },
    delete(table: unknown) {
      return {
        where() {
          return {
            async returning() {
              // status/metrics deletes: pretend 7 rows matched the window.
              // snapshots delete: rows beyond keep-N.
              let deleted = 7;
              if (table === snapshots) deleted = overLimit - SNAPSHOTS_KEEP_PER_KIND;
              deletes.push({ table, deleted });
              return Array.from({ length: deleted }, (_, i) => ({ id: `d${i}` }));
            },
          };
        },
      };
    },
    select() {
      return {
        from(table: unknown) {
          if (table !== snapshots) throw new Error("unexpected select");
          return {
            async groupBy() {
              groupCursor = 0;
              return groupsData.map((g) => ({ service: g.service, kind: g.kind }));
            },
            where(/* group filter */) {
              // Each where() call corresponds to the next group in order.
              const group = groupsData[groupCursor++];
              return {
                orderBy() {
                  return {
                    async limit(n: number) {
                      // Return up to the group's real size — a small group
                      // yields fewer than keep-N, so runRetention skips it.
                      return Array.from(
                        { length: Math.min(n, group.count) },
                        (_, i) => ({ id: `k${i}` }),
                      );
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return { database, deletes, collapse };
}

describe("retention windows", () => {
  it("uses 3-day and 30-day windows", () => {
    expect(SERVICE_STATUS_TTL_MS).toBe(3 * 24 * 60 * 60 * 1000);
    expect(METRICS_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(SNAPSHOTS_KEEP_PER_KIND).toBeGreaterThan(0);
  });

  it("uses 1-day raw→hour and 7-day hour→day collapse thresholds", () => {
    expect(RAW_TO_HOUR_MS).toBe(24 * 60 * 60 * 1000);
    expect(HOUR_TO_DAY_MS).toBe(7 * 24 * 60 * 60 * 1000);
    // collapse must precede the flat TTL so aging rows survive as averages
    expect(RAW_TO_HOUR_MS).toBeLessThan(METRICS_TTL_MS);
    expect(HOUR_TO_DAY_MS).toBeLessThan(METRICS_TTL_MS);
  });

  it("deletes status + metrics by window and prunes snapshots to keep-N", async () => {
    const { database, deletes } = makeShim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const counts = await runRetention(database as any, new Date());

    expect(counts.serviceStatusDeleted).toBe(7);
    expect(counts.metricsDeleted).toBe(7);
    // only the over-limit group triggers a snapshot delete
    expect(counts.snapshotsDeleted).toBe(10);
    // no metric rows in the default shim → nothing to collapse
    expect(counts.metricsCollapsedRawToHour).toBe(0);
    expect(counts.metricsCollapsedHourToDay).toBe(0);

    const tables = deletes.map((d) => d.table);
    expect(tables).toContain(serviceStatus);
    expect(tables).toContain(metrics);
    expect(tables).toContain(snapshots);
  });
});

describe("metric downsampling", () => {
  it("collapses raw and hourly buckets into coarser averaged rows", async () => {
    const { database, collapse } = makeShim();
    // Tier order in runRetention: [0] raw→hour, [1] hour→day.
    collapse.tierBuckets = [
      [
        { box: "tdarr", metric: "tdarr.writeback.mbps", bucket: "2026-07-25T10:00:00Z", avg: 4.5 },
        { box: "tdarr", metric: "tdarr.writeback.mbps", bucket: "2026-07-25T11:00:00Z", avg: 6.0 },
      ],
      [{ box: "tdarr", metric: "tdarr.queue.depth", bucket: "2026-07-18T00:00:00Z", avg: 120 }],
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const counts = await runRetention(database as any, new Date());

    expect(counts.metricsCollapsedRawToHour).toBe(2);
    expect(counts.metricsCollapsedHourToDay).toBe(1);

    // inserted rows carry the coarser resolution and the bucket average
    const hourRows = collapse.inserted.filter((r) => r.resolution === "hour");
    const dayRows = collapse.inserted.filter((r) => r.resolution === "day");
    expect(hourRows.map((r) => r.value)).toEqual([4.5, 6.0]);
    expect(dayRows.map((r) => r.value)).toEqual([120]);
  });

  it("is idempotent: a tier with no aged source rows collapses nothing", async () => {
    const { database, collapse } = makeShim();
    collapse.tierBuckets = [[], []]; // nothing old enough on either tier

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const counts = await runRetention(database as any, new Date());

    expect(counts.metricsCollapsedRawToHour).toBe(0);
    expect(counts.metricsCollapsedHourToDay).toBe(0);
    expect(collapse.inserted).toHaveLength(0);
  });
});

describe("collapse bucket SQL generation", () => {
  const dialect = new PgDialect();
  const render = (fragment: ReturnType<typeof sql>) => dialect.sqlToQuery(fragment);

  // Regression: the collapse tier once passed the bucket unit ("hour"/"day") as a
  // bind parameter, so the SELECT and GROUP BY date_trunc() expressions rendered
  // as $1 vs $N. Postgres does not treat two distinct placeholders as the same
  // expression and rejected "metrics.at" as ungrouped (SQLSTATE 42803), crash-
  // looping the poller in production. The in-memory shim can't catch this — it
  // never evaluates SQL — so we assert the emitted SQL text directly.
  for (const bucket of ["hour", "day"] as const) {
    it(`inlines the ${bucket} bucket unit as a literal, not a bind param`, () => {
      const { sql: text, params } = render(bucketTruncExpr(bucket));
      // The truncation unit must be a literal in the SQL, not a placeholder.
      expect(text).toContain(`date_trunc('${bucket}',`);
      expect(params).not.toContain(bucket);
    });

    it(`renders identical ${bucket} date_trunc text in SELECT and GROUP BY`, () => {
      const expr = bucketTruncExpr(bucket);
      // Build a query that references the SAME expression in both clauses, the
      // way collapseTier does, and confirm both occurrences are byte-identical.
      const query = sql`select ${expr} as "bucket" from ${metrics} group by ${expr}`;
      const { sql: text } = render(query);
      const occurrences = text.match(/date_trunc\('[a-z]+',[^)]*\)/g) ?? [];
      expect(occurrences).toHaveLength(2);
      expect(occurrences[0]).toBe(occurrences[1]);
    });
  }
});
