import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  uniqueIndex,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "viewer"]);

/**
 * Downsampling tier of a metrics row. `raw` = as-polled; `hour`/`day` = a
 * collapsed average of finer rows over that bucket (see runRetention). Lets the
 * retention pass age raw → hour → day without ever re-collapsing a row.
 */
export const metricResolution = pgEnum("metric_resolution", [
  "raw",
  "hour",
  "day",
]);

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
    resolution: metricResolution("resolution").notNull().default("raw"),
  },
  (t) => [
    index("metrics_box_metric_at_idx").on(t.box, t.metric, t.at),
    index("metrics_resolution_at_idx").on(t.resolution, t.at),
  ],
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

export const logSource = pgEnum("log_source", [
  "journal",
  "docker",
  "auth",
  "kernel",
  "app",
]);

/**
 * Off-box log store (Segment 06). One row per line, cursor-pulled from the
 * agent's journal/docker endpoints. Retention: 14 days AND a 5 GB size cap.
 */
export const logLines = pgTable(
  "log_lines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    box: text("box").notNull(),
    source: logSource("source").notNull(),
    // systemd unit or container name; "sshd" for auth, "kernel" for kernel.
    unit: text("unit").notNull(),
    // syslog priority 0 (emerg) .. 7 (debug)
    severity: integer("severity").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    message: text("message").notNull(),
    meta: jsonb("meta"),
  },
  (t) => [
    index("log_lines_box_source_ts_idx").on(t.box, t.source, t.ts),
    index("log_lines_unit_ts_idx").on(t.unit, t.ts),
  ],
);

/**
 * Pull position per (box, source, unit). Journal-family sources persist the
 * opaque journald cursor; docker sources persist a unix-seconds watermark.
 * Updated in the same transaction as the batch insert — restart-safe.
 */
export const logCursors = pgTable("log_cursors", {
  // `${box}:${source}:${unit}`
  id: text("id").primaryKey(),
  box: text("box").notNull(),
  source: logSource("source").notNull(),
  unit: text("unit").notNull(),
  cursor: text("cursor"),
  sinceUnix: integer("since_unix"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alertSeverity = pgEnum("alert_severity", [
  "critical",
  "warning",
  "info",
]);

/**
 * Open/resolved alert instances raised by the rule engine (Segment 06). One
 * row per (ruleId, target); the engine upserts on breach and stamps
 * `resolvedAt` when the auto-resolve predicate clears. `acked` mutes the shell
 * badge without resolving. Two-strike debounce lives in the engine, not here.
 */
export const alerts = pgTable(
  "alerts",
  {
    id: text("id").primaryKey(),
    ruleId: text("rule_id").notNull(),
    severity: alertSeverity("severity").notNull(),
    // the thing the rule is about (container name, mount, node, service…)
    target: text("target").notNull(),
    message: text("message").notNull(),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    acked: boolean("acked").notNull().default(false),
    ackedBy: text("acked_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("alerts_rule_target_idx").on(t.ruleId, t.target),
    index("alerts_resolved_last_seen_idx").on(t.resolvedAt, t.lastSeen),
  ],
);

/**
 * One row per (user, browser/device) Web Push subscription. `endpoint` is the
 * push-service URL; `auth`/`p256dh` are the subscription's encryption keys.
 * Unique on (userId, endpoint) so re-subscribing the same device upserts.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    auth: text("auth").notNull(),
    p256dh: text("p256dh").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_subscriptions_user_endpoint_idx").on(t.userId, t.endpoint)],
);

/**
 * Per-user notification event-type toggles. `preferences` is a JSON object of
 * `{ eventType: boolean }`; missing keys default to enabled at read time.
 */
export const notificationPreferences = pgTable("notification_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  preferences: jsonb("preferences").notNull(),
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
export type LogLine = typeof logLines.$inferSelect;
export type LogCursor = typeof logCursors.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NotificationPreferenceRow = typeof notificationPreferences.$inferSelect;
