/**
 * Log query executors — the only place in this feature that touches `db`.
 * Kept apart from query.ts so the SQL builders stay unit-testable without a
 * live connection.
 */
import { sql } from "drizzle-orm";

import { db } from "@/db";
import {
  LOG_STATEMENT_TIMEOUT_MS,
  type LogQuery,
  type LogRow,
  buildLogSelect,
} from "./query";

/**
 * Execute under a transaction-local statement timeout so a pathological
 * regex can never hold a connection past LOG_STATEMENT_TIMEOUT_MS.
 */
export async function runLogQuery(f: LogQuery): Promise<LogRow[]> {
  const rows = await db.transaction(async (tx) => {
    await tx.execute(
      sql.raw(`set local statement_timeout = ${LOG_STATEMENT_TIMEOUT_MS}`),
    );
    return tx.execute(buildLogSelect(f));
  });
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    box: String(r.box),
    source: String(r.source),
    unit: String(r.unit),
    severity: Number(r.severity),
    ts: new Date(r.ts as string).toISOString(),
    message: String(r.message),
  }));
}

export interface LogFacets {
  boxes: string[];
  sources: string[];
  units: Array<{ source: string; unit: string }>;
}

/** Distinct filter values for the viewer's dropdowns. */
export async function logFacets(): Promise<LogFacets> {
  const rows = await db.execute(sql`
    select distinct box, source, unit from log_lines order by source, unit
  `);
  const list = rows as unknown as Array<Record<string, unknown>>;
  return {
    boxes: [...new Set(list.map((r) => String(r.box)))].sort(),
    sources: [...new Set(list.map((r) => String(r.source)))].sort(),
    units: list.map((r) => ({ source: String(r.source), unit: String(r.unit) })),
  };
}
