import { z } from "zod";

/**
 * Transport-kind enum for data contracts — how a field's value physically
 * arrives at the consumer. Fixed vocabulary (plan §2); the reusable apparatus
 * must classify every field into exactly one of these, generically (no
 * page-specific kinds).
 */
export const transportKindSchema = z.enum([
  "udp-push", // Wren blaster, 2Hz, 1280-byte MTU, gzipped envelope
  "http-poll", // tiered cadence: fast 5s / medium 10-15s / slow 300s
  "database-query",
  "event-driven",
  "local-derived", // computed client-side from other displayed values
  "server-derived", // computed server-side during assembly
  "static-config",
  "unknown", // not-yet-captured; must be flagged loudly, sequenced before UI
]);
export type TransportKind = z.infer<typeof transportKindSchema>;

/**
 * Cadence tier for `http-poll` fields (plan §2 axis 2). Optional; only
 * meaningful when transportKind === "http-poll".
 */
export const cadenceTierSchema = z.enum(["fast-5s", "medium-10-15s", "slow-300s"]);
export type CadenceTier = z.infer<typeof cadenceTierSchema>;

/**
 * Stable-ID rule: `<page>.<region>.<section>.<component>.<field>` (plan §2).
 * Segments are `[a-z0-9-]+`; a stable ID has 2..5 dot-separated segments so
 * region/section/component/field can each be addressed at their own depth.
 */
export const stableIdSchema = z
  .string()
  .regex(
    /^[a-z0-9-]+(\.[a-z0-9-]+){1,4}$/,
    "stable ID must be <page>.<region>[.<section>[.<component>[.<field>]]] in [a-z0-9-]",
  );
export type StableId = z.infer<typeof stableIdSchema>;

/** Which required states a component/page must handle (plan §6 Phase 5). */
export const uiStateSchema = z.enum([
  "loading",
  "empty",
  "stale",
  "unavailable",
  "partial",
  "error",
  "ready",
]);
export type UiState = z.infer<typeof uiStateSchema>;

/**
 * Safety classification for runtime actions (plan §6 amendment 5). Anything
 * beyond `read-only` requires explicit human approval before live execution.
 */
export const actionSafetySchema = z.enum([
  "read-only",
  "reversible-write",
  "disruptive",
  "destructive",
]);
export type ActionSafety = z.infer<typeof actionSafetySchema>;
