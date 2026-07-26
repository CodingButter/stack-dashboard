/**
 * Log query builder — pure and unit-testable. No `db` import, so tests can
 * compile the SQL without a live connection. Every filter value is bound as a
 * parameter (never interpolated), regex search runs in Postgres via the `~*`
 * operator under a hard result limit and a statement timeout, and pagination
 * is keyset on (ts, id) — no OFFSET scans over a high-churn table.
 */
import { SQL, and, sql } from "drizzle-orm";
import { z } from "zod";

export const LOG_QUERY_LIMIT_MAX = 500;
export const LOG_QUERY_LIMIT_DEFAULT = 100;
export const LOG_STATEMENT_TIMEOUT_MS = 5_000;

export const logQuerySchema = z.object({
  box: z.string().min(1).max(64).optional(),
  source: z.enum(["journal", "docker", "auth", "kernel", "app"]).optional(),
  unit: z.string().min(1).max(128).optional(),
  /** Show lines at this severity or worse (numerically <=). */
  maxSeverity: z.coerce.number().int().min(0).max(7).optional(),
  q: z.string().min(1).max(256).optional(),
  regex: z
    .enum(["1", "0", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
  /** Keyset: fetch lines strictly OLDER than this (ts, id) — "load older". */
  beforeTs: z.string().datetime({ offset: true }).optional(),
  beforeId: z.coerce.number().int().positive().optional(),
  /** Keyset: fetch lines strictly NEWER than this (ts, id) — live tail. */
  afterTs: z.string().datetime({ offset: true }).optional(),
  afterId: z.coerce.number().int().positive().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LOG_QUERY_LIMIT_MAX)
    .default(LOG_QUERY_LIMIT_DEFAULT),
});

export type LogQuery = z.infer<typeof logQuerySchema>;

export interface LogRow {
  id: number;
  box: string;
  source: string;
  unit: string;
  severity: number;
  ts: string; // ISO
  message: string;
}

/** WHERE conditions for a validated filter. All values are bound params. */
export function buildLogConditions(f: LogQuery): SQL {
  const conds: SQL[] = [];
  if (f.box) conds.push(sql`box = ${f.box}`);
  if (f.source) conds.push(sql`source = ${f.source}`);
  if (f.unit) conds.push(sql`unit = ${f.unit}`);
  if (f.maxSeverity !== undefined) conds.push(sql`severity <= ${f.maxSeverity}`);
  if (f.q) {
    // Parameterized in both modes — user text never reaches the SQL string.
    conds.push(f.regex ? sql`message ~* ${f.q}` : sql`message ilike ${"%" + f.q + "%"}`);
  }
  if (f.beforeTs && f.beforeId !== undefined) {
    conds.push(sql`(ts, id) < (${f.beforeTs}::timestamptz, ${f.beforeId})`);
  }
  if (f.afterTs && f.afterId !== undefined) {
    conds.push(sql`(ts, id) > (${f.afterTs}::timestamptz, ${f.afterId})`);
  }
  const merged = and(...conds);
  return merged ?? sql`true`;
}

/** Full statement: newest-first keyset page under the hard limit. */
export function buildLogSelect(f: LogQuery): SQL {
  const order = f.afterTs ? sql`asc` : sql`desc`;
  return sql`
    select id, box, source, unit, severity, ts, message
    from log_lines
    where ${buildLogConditions(f)}
    order by ts ${order}, id ${order}
    limit ${Math.min(f.limit, LOG_QUERY_LIMIT_MAX)}
  `;
}
