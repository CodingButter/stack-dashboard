import { describe, expect, it } from "vitest";

import { metrics, serviceStatus, snapshots } from "@/db/schema";
import {
  METRICS_TTL_MS,
  SERVICE_STATUS_TTL_MS,
  SNAPSHOTS_KEEP_PER_KIND,
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
  const database = {
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

  return { database, deletes };
}

describe("retention windows", () => {
  it("uses 3-day and 30-day windows", () => {
    expect(SERVICE_STATUS_TTL_MS).toBe(3 * 24 * 60 * 60 * 1000);
    expect(METRICS_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(SNAPSHOTS_KEEP_PER_KIND).toBeGreaterThan(0);
  });

  it("deletes status + metrics by window and prunes snapshots to keep-N", async () => {
    const { database, deletes } = makeShim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const counts = await runRetention(database as any, new Date());

    expect(counts.serviceStatusDeleted).toBe(7);
    expect(counts.metricsDeleted).toBe(7);
    // only the over-limit group triggers a snapshot delete
    expect(counts.snapshotsDeleted).toBe(10);

    const tables = deletes.map((d) => d.table);
    expect(tables).toContain(serviceStatus);
    expect(tables).toContain(metrics);
    expect(tables).toContain(snapshots);
  });
});
