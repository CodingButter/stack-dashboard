/**
 * Alert engine contracts (Segment 06). Rules are pure predicates over a
 * typed snapshot of the freshest cluster state; the engine (engine.ts) applies
 * the two-strike debounce and owns open/resolve persistence.
 */
import type { AgentStats, SmartDrive } from "@/poller/clients/agent";
import type { TdarrNode } from "@/poller/clients/tdarr";

export type Severity = "critical" | "warning" | "info";

/** One reachability heartbeat, as the rules see it. */
export interface StatusInput {
  service: string;
  ok: boolean;
  error: string | null;
  /** consecutive failed polls ending at the latest sample (0 if currently ok) */
  consecutiveFailures: number;
  /** ms since the breaker opened for this service, or null if closed */
  breakerOpenMs: number | null;
}

/** A raised alert candidate: a rule fired against a specific target. */
export interface Breach {
  ruleId: string;
  severity: Severity;
  target: string;
  message: string;
}

/**
 * Everything a rule may read. Assembled once per cycle from the same
 * snapshots/status/metrics the panels use — no rule does its own I/O.
 */
export interface RuleInput {
  now: Date;
  statuses: StatusInput[];
  /** NAS agent box stats (filesystems, dstate, failed units…) or null if stale */
  agent: AgentStats | null;
  smart: SmartDrive[];
  tdarrNodes: TdarrNode[];
  /** count of ssh auth-failure log lines in the last 60 s (from log_lines) */
  sshFailuresLastMin: number;
  /** ms until the watched TLS cert expires, or null if unknown */
  certExpiresInMs: number | null;
}

/**
 * A declarative rule. `evaluate` returns zero or more breaches (a rule can
 * fire per-target, e.g. one per down container). `strikes` is how many
 * consecutive breaching cycles are required before the alert opens
 * (two-strike default = 2). `severity` is the default; a breach may override.
 */
export interface Rule {
  id: string;
  severity: Severity;
  description: string;
  strikes: number;
  evaluate(input: RuleInput): Breach[];
}
