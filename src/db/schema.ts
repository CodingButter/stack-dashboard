import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "viewer"]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("viewer"),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  // sha256 hex of the raw cookie token — the raw token never touches the DB.
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  target: text("target"),
  detail: jsonb("detail"),
  result: text("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per poll attempt per service — the reachability heartbeat.
 * Pruned aggressively (Segment 03 retention: > 3 days deleted).
 */
export const serviceStatus = pgTable(
  "service_status",
  {
    id: text("id").primaryKey(),
    service: text("service").notNull(),
    ok: boolean("ok").notNull(),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    polledAt: timestamp("polled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("service_status_service_polled_idx").on(t.service, t.polledAt)],
);

/**
 * Current-state payloads for panels (queue lists, sessions, node states...).
 * `kind` distinguishes multiple snapshot shapes per service; retention keeps
 * the latest N per (service, kind).
 */
export const snapshots = pgTable(
  "snapshots",
  {
    id: text("id").primaryKey(),
    service: text("service").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    polledAt: timestamp("polled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("snapshots_service_kind_polled_idx").on(t.service, t.kind, t.polledAt)],
);

/**
 * Numeric time-series (cpu, iowait, mem, disk util, net, tier fill, queue
 * depths, speeds). `box` scopes hardware metrics per machine. Retention: > 30
 * days deleted.
 */
export const metrics = pgTable(
  "metrics",
  {
    id: text("id").primaryKey(),
    box: text("box").notNull(),
    metric: text("metric").notNull(),
    value: doublePrecision("value").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("metrics_box_metric_at_idx").on(t.box, t.metric, t.at)],
);

/**
 * Key/value config vault. API keys are stored AES-256-GCM encrypted (encrypted
 * = true); non-secret values (service URLs) stored plaintext (encrypted = false).
 */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  encrypted: boolean("encrypted").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Per-service poll cursor/etag state (e.g. journal cursors, session cookies). */
export const pollState = pgTable("poll_state", {
  service: text("service").primaryKey(),
  state: jsonb("state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type ServiceStatus = typeof serviceStatus.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
export type Metric = typeof metrics.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type PollState = typeof pollState.$inferSelect;
