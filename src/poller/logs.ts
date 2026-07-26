/**
 * Cursor-pull log ingestion (Segment 06). Every LOG_PULL_INTERVAL_MS the
 * worker pulls each configured source from the NAS agent's log endpoints,
 * normalizes entries, batch-inserts them, and advances the cursor in the
 * SAME transaction — a crash between insert and cursor write can therefore
 * never lose lines (worst case: the batch re-inserts are avoided because the
 * cursor only advances with its batch).
 *
 * Sources:
 * - journal: the agent's allowlisted custom units (tier-mover, tdarr-gate, …)
 * - auth:    sshd journal entries
 * - kernel:  journald kernel transport (dmesg)
 * - docker:  every mediastack container (list taken from the latest agent
 *            docker snapshot — no hardcoded container names)
 * - app:     the worker's own log lines (in-process sink, no file tail)
 */
import { and, eq, lt, sql, desc } from "drizzle-orm";

import type { db as DbType } from "@/db";
import { logCursors, logLines, snapshots } from "@/db/schema";

// ------------------------------------------------------------- constants

export const LOG_PULL_INTERVAL_MS = 5_000;
export const LOG_BATCH_SIZE = 500;
export const LOG_MAX_AGE_DAYS = 14;
export const LOG_SIZE_CAP_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
export const LOG_SIZE_KEEP_FRACTION = 0.8; // keep the newest 80 % on cap breach

/** Mirror of the agent's JOURNAL_UNITS allowlist (agent/controlib.py). */
export const NAS_JOURNAL_UNITS = [
  "anime-sort",
  "binge-prefetch",
  "cifs-watchdog",
  "recent-warm",
  "stack-alerts",
  "stack-digest",
  "tdarr-sweep",
  "tier-mover",
  "tdarr-gate",
  "nas-agent",
] as const;

// ------------------------------------------------------------- wire shapes

export interface JournalEntry {
  ts_us: number | null;
  unit: string | null;
  priority: string | null;
  message: string | null;
}

export interface JournalResponse {
  entries: JournalEntry[];
  cursor: string | null;
}

export interface DockerLogsResponse {
  container: string;
  since: number;
  text: string;
}

// --------------------------------------------------------- normalization

export interface NormalizedLine {
  ts: Date;
  severity: number;
  message: string;
}

/** journald __REALTIME_TIMESTAMP is microseconds since epoch. */
export function normalizeJournalEntry(e: JournalEntry): NormalizedLine | null {
  if (!e.message) return null;
  const ts = e.ts_us != null ? new Date(Math.floor(e.ts_us / 1000)) : null;
  if (!ts || Number.isNaN(ts.getTime())) return null;
  return { ts, severity: clampSeverity(e.priority), message: e.message };
}

export function clampSeverity(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : parseInt(raw ?? "", 10);
  if (Number.isNaN(n)) return 6; // info
  return Math.min(7, Math.max(0, n));
}

/**
 * Docker lines have no PRIORITY field — classify by content. Deliberately
 * conservative: only clear markers move a line off "info".
 */
export function classifyDockerLine(message: string): number {
  if (/\b(fatal|panic)\b/i.test(message)) return 2;
  if (/\b(error|err!|exception|traceback|failed)\b/i.test(message)) return 3;
  if (/\b(warn|warning|deprecated)\b/i.test(message)) return 4;
  if (/\b(debug|trace)\b/i.test(message)) return 7;
  return 6;
}

/**
 * Docker log text with timestamps=1: each line is
 * `2026-07-24T18:00:00.123456789Z the message`. Lines without a parseable
 * leading timestamp are dropped (partial line from the demuxer).
 */
export function parseDockerText(text: string): NormalizedLine[] {
  const out: NormalizedLine[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const sp = line.indexOf(" ");
    if (sp <= 0) continue;
    const ts = new Date(line.slice(0, sp));
    if (Number.isNaN(ts.getTime())) continue;
    const message = line.slice(sp + 1);
    if (!message) continue;
    out.push({ ts, severity: classifyDockerLine(message), message });
  }
  return out;
}

export function chunk<T>(items: T[], size: number = LOG_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// -------------------------------------------------------------- app sink

const appBuffer: { ts: Date; severity: number; message: string }[] = [];

/** In-process sink for the worker's own lines (source "app"). */
export function appLog(severity: number, message: string): void {
  appBuffer.push({ ts: new Date(), severity, message });
  // Never let the buffer grow unbounded if the DB is down.
  if (appBuffer.length > 5_000) appBuffer.splice(0, appBuffer.length - 5_000);
}

export function drainAppBuffer(): NormalizedLine[] {
  return appBuffer.splice(0, appBuffer.length);
}

// ------------------------------------------------------------- ingestion

type Db = typeof DbType;

export type LogSourceKind = "journal" | "docker" | "auth" | "kernel" | "app";

export interface AgentFetcher {
  /** GET an agent path (already includes query string), parse JSON. */
  get<T>(path: string): Promise<T | null>;
}

export interface CursorState {
  cursor: string | null;
  sinceUnix: number | null;
}

/**
 * Storage seam for the pull loop. The drizzle implementation commits each
 * batch and its cursor in one transaction; the in-memory test double lets the
 * resume semantics be verified without Postgres.
 */
export interface LogStore {
  loadCursor(box: string, source: LogSourceKind, unit: string): Promise<CursorState>;
  commitBatch(
    box: string,
    source: LogSourceKind,
    unit: string,
    lines: NormalizedLine[],
    next: CursorState,
  ): Promise<void>;
  containerNames(): Promise<string[]>;
}

function cursorId(box: string, source: string, unit: string): string {
  return `${box}:${source}:${unit}`;
}

/**
 * Drizzle-backed store. commitBatch inserts and advances the cursor in the
 * SAME transaction — the cursor only moves with its batch, so a crash between
 * insert and cursor write can never duplicate or drop lines on restart.
 */
export function makeDrizzleLogStore(db: Db): LogStore {
  return {
    async loadCursor(box, source, unit) {
      const rows = await db
        .select()
        .from(logCursors)
        .where(eq(logCursors.id, cursorId(box, source, unit)))
        .limit(1);
      if (rows.length === 0) return { cursor: null, sinceUnix: null };
      return { cursor: rows[0].cursor, sinceUnix: rows[0].sinceUnix };
    },

    async commitBatch(box, source, unit, lines, next) {
      await db.transaction(async (tx) => {
        for (const part of chunk(lines)) {
          if (part.length === 0) continue;
          await tx.insert(logLines).values(
            part.map((l) => ({
              box,
              source,
              unit,
              severity: l.severity,
              ts: l.ts,
              message: l.message,
            })),
          );
        }
        await tx
          .insert(logCursors)
          .values({
            id: cursorId(box, source, unit),
            box,
            source,
            unit,
            cursor: next.cursor,
            sinceUnix: next.sinceUnix,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: logCursors.id,
            set: {
              cursor: next.cursor,
              sinceUnix: next.sinceUnix,
              updatedAt: new Date(),
            },
          });
      });
    },

    /** Container names from the latest agent docker snapshot — nothing hardcoded. */
    async containerNames() {
      const rows = await db
        .select()
        .from(snapshots)
        .where(and(eq(snapshots.service, "agent"), eq(snapshots.kind, "docker")))
        .orderBy(desc(snapshots.polledAt))
        .limit(1);
      if (rows.length === 0) return [];
      const payload = rows[0].payload as { containers?: unknown };
      // Agent /docker returns an array of {name, ...}; tolerate the older
      // name-keyed record shape too.
      const c = payload.containers;
      if (Array.isArray(c)) {
        return c
          .map((e) => (e && typeof e === "object" ? String((e as { name?: unknown }).name ?? "") : ""))
          .filter(Boolean);
      }
      if (c && typeof c === "object") return Object.keys(c);
      return [];
    },
  };
}

export async function pullJournalFamily(
  store: LogStore,
  agent: AgentFetcher,
  box: string,
  source: "journal" | "auth" | "kernel",
  unit: string,
  path: string,
): Promise<number> {
  const state = await store.loadCursor(box, source, unit);
  const qs = new URLSearchParams({ lines: "1000" });
  if (source === "journal") qs.set("unit", unit);
  if (state.cursor) qs.set("cursor", state.cursor);
  const res = await agent.get<JournalResponse>(`${path}?${qs.toString()}`);
  if (!res) return 0;
  const lines = res.entries
    .map(normalizeJournalEntry)
    .filter((l): l is NormalizedLine => l !== null);
  // First pull has no cursor — journalctl returns the newest N lines; that
  // backfill is intentional. Subsequent pulls are strictly after-cursor.
  if (lines.length === 0 && res.cursor === state.cursor) return 0;
  await store.commitBatch(box, source, unit, lines, {
    cursor: res.cursor,
    sinceUnix: null,
  });
  return lines.length;
}

export async function pullDocker(
  store: LogStore,
  agent: AgentFetcher,
  box: string,
  container: string,
  nowUnix: number,
): Promise<number> {
  const state = await store.loadCursor(box, "docker", container);
  // Docker's `since` is second-granular, but lines carry sub-second
  // timestamps — a second-only watermark re-ingests every line that shares
  // the watermark second. So the exact millisecond watermark rides in the
  // cursor field; `since` re-fetches the boundary second and the ms filter
  // drops what we already have.
  const lastMs = state.cursor !== null ? Number(state.cursor) : null;
  // First pull: only the last 5 minutes, not the whole history.
  const since = lastMs !== null ? Math.floor(lastMs / 1000) : nowUnix - 300;
  const qs = new URLSearchParams({
    container,
    since: String(since),
    tail: "1000",
  });
  const res = await agent.get<DockerLogsResponse>(`/logs/docker?${qs.toString()}`);
  if (!res) return 0;
  const all = parseDockerText(res.text);
  const lines = lastMs === null ? all : all.filter((l) => l.ts.getTime() > lastMs);
  if (lines.length === 0) return 0;
  const newestMs = lines.reduce((m, l) => Math.max(m, l.ts.getTime()), lastMs ?? 0);
  await store.commitBatch(box, "docker", container, lines, {
    cursor: String(newestMs),
    sinceUnix: Math.floor(newestMs / 1000),
  });
  return lines.length;
}

export interface LogPullResult {
  pulled: Record<string, number>;
  errors: string[];
}

/** One full pull cycle across every source. */
export async function pullLogsWithStore(
  store: LogStore,
  agent: AgentFetcher,
  box = "nas",
  nowUnix = Math.floor(Date.now() / 1000),
): Promise<LogPullResult> {
  const pulled: Record<string, number> = {};
  const errors: string[] = [];

  const tasks: [string, () => Promise<number>][] = [
    ...NAS_JOURNAL_UNITS.map(
      (unit): [string, () => Promise<number>] => [
        `journal:${unit}`,
        () => pullJournalFamily(store, agent, box, "journal", unit, "/logs/journal"),
      ],
    ),
    ["auth:sshd", () => pullJournalFamily(store, agent, box, "auth", "sshd", "/logs/auth")],
    [
      "kernel:kernel",
      () => pullJournalFamily(store, agent, box, "kernel", "kernel", "/logs/kernel"),
    ],
  ];

  const containers = await store.containerNames();
  for (const c of containers) {
    tasks.push([`docker:${c}`, () => pullDocker(store, agent, box, c, nowUnix)]);
  }

  for (const [key, run] of tasks) {
    try {
      const n = await run();
      if (n > 0) pulled[key] = n;
    } catch (err) {
      errors.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Flush the worker's own lines.
  const app = drainAppBuffer();
  if (app.length > 0) {
    await store.commitBatch("dev-beast", "app", "poller", app, {
      cursor: null,
      sinceUnix: null,
    });
    pulled["app:poller"] = app.length;
  }

  return { pulled, errors };
}

/** Production entry — drizzle store over the shared db handle. */
export async function pullLogs(db: Db, agent: AgentFetcher): Promise<LogPullResult> {
  return pullLogsWithStore(makeDrizzleLogStore(db), agent);
}

// ------------------------------------------------------------- retention

export interface LogRetentionDeps {
  /** pg_total_relation_size('log_lines') — injectable for tests. */
  tableSizeBytes(): Promise<number>;
}

export interface LogRetentionResult {
  deletedByAge: number;
  deletedBySize: number;
  sizeBytes: number;
}

/**
 * Decide whether the size-cap path must delete, and down to which fraction.
 * Pure — the actual SQL runs in runLogRetention.
 */
export function sizeCapBreached(
  sizeBytes: number,
  capBytes: number = LOG_SIZE_CAP_BYTES,
): boolean {
  return sizeBytes > capBytes;
}

export async function runLogRetention(
  db: Db,
  deps?: Partial<LogRetentionDeps>,
): Promise<LogRetentionResult> {
  const cutoff = new Date(Date.now() - LOG_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const aged = await db
    .delete(logLines)
    .where(lt(logLines.ts, cutoff))
    .returning({ id: logLines.id });

  const sizeBytes = deps?.tableSizeBytes
    ? await deps.tableSizeBytes()
    : Number(
        (
          await db.execute<{ size: string }>(
            sql`select pg_total_relation_size('log_lines') as size`,
          )
        )[0]?.size ?? 0,
      );

  let deletedBySize = 0;
  if (sizeCapBreached(sizeBytes)) {
    // Keep the newest LOG_SIZE_KEEP_FRACTION of rows; delete the rest.
    const [{ n }] = await db.execute<{ n: string }>(
      sql`select count(*) as n from log_lines`,
    );
    const total = Number(n);
    const keep = Math.floor(total * LOG_SIZE_KEEP_FRACTION);
    if (total > keep) {
      const cutoffRows = await db
        .select({ id: logLines.id })
        .from(logLines)
        .orderBy(desc(logLines.id))
        .offset(keep - 1)
        .limit(1);
      if (cutoffRows.length > 0) {
        const deleted = await db
          .delete(logLines)
          .where(lt(logLines.id, cutoffRows[0].id))
          .returning({ id: logLines.id });
        deletedBySize = deleted.length;
      }
    }
  }

  return { deletedByAge: aged.length, deletedBySize, sizeBytes };
}
