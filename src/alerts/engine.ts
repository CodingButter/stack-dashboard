/**
 * Alert engine (Segment 06). Each poll cycle:
 *   1. every rule evaluates the fresh RuleInput → a flat list of Breach.
 *   2. two-strike debounce: a (ruleId, target) must breach on TWO consecutive
 *      cycles before its alert opens — absorbs single-sample blips under load.
 *   3. reconcile against the store: open new alerts, refresh lastSeen on ones
 *      still breaching, and auto-resolve open alerts whose breach cleared.
 *
 * The debounce state lives in-process (a Map) so it resets on worker restart —
 * intentional: after a restart we re-earn two clean strikes before firing.
 * Persistence goes through the AlertStore seam so the reconcile logic is
 * testable without a database (see __tests__/engine.test.ts).
 */
import type { Breach, Rule, RuleInput, Severity } from "./types";

export interface OpenAlert {
  id: string;
  ruleId: string;
  target: string;
  severity: Severity;
  message: string;
}

export interface AlertStore {
  /** Currently-open (unresolved) alerts. */
  listOpen(): Promise<OpenAlert[]>;
  /** Create a new open alert. */
  open(b: Breach, now: Date): Promise<void>;
  /** Bump lastSeen (and message/severity if changed) on a still-breaching alert. */
  refresh(id: string, b: Breach, now: Date): Promise<void>;
  /** Stamp resolvedAt on alerts whose breach cleared. */
  resolve(ids: string[], now: Date): Promise<void>;
}

const key = (ruleId: string, target: string) => `${ruleId}\u0000${target}`;

export class AlertEngine {
  private readonly rules: Rule[];
  /** (ruleId\0target) → consecutive breaching-cycle count (capped at strikes). */
  private streak = new Map<string, number>();

  constructor(rules: Rule[]) {
    this.rules = rules;
  }

  /** Run every rule; flatten and de-dup breaches by (ruleId, target). */
  evaluate(input: RuleInput): Breach[] {
    const out = new Map<string, Breach>();
    for (const rule of this.rules) {
      let breaches: Breach[];
      try {
        breaches = rule.evaluate(input);
      } catch {
        // A rule must never take the engine down; a throwing rule is skipped.
        continue;
      }
      for (const b of breaches) out.set(key(b.ruleId, b.target), b);
    }
    return [...out.values()];
  }

  /**
   * One reconcile cycle. Returns a summary for logging/proof.
   */
  async tick(input: RuleInput, store: AlertStore): Promise<{
    opened: number;
    refreshed: number;
    resolved: number;
    pending: number;
  }> {
    const breaches = this.evaluate(input);
    const breachByKey = new Map<string, Breach>();
    for (const b of breaches) breachByKey.set(key(b.ruleId, b.target), b);

    const strikesFor = new Map<string, number>();
    for (const rule of this.rules) strikesFor.set(rule.id, rule.strikes);

    // Advance / reset streaks. A key breaching this cycle increments (capped);
    // a key not breaching drops to 0.
    const seen = new Set<string>();
    let pending = 0;
    for (const [k, b] of breachByKey) {
      seen.add(k);
      const need = strikesFor.get(b.ruleId) ?? 2;
      const next = Math.min((this.streak.get(k) ?? 0) + 1, need);
      this.streak.set(k, next);
      if (next < need) pending++;
    }
    for (const k of this.streak.keys()) {
      if (!seen.has(k)) this.streak.delete(k);
    }

    const open = await store.listOpen();
    const openByKey = new Map<string, OpenAlert>();
    for (const a of open) openByKey.set(key(a.ruleId, a.target), a);

    let opened = 0;
    let refreshed = 0;
    const resolvedIds: string[] = [];

    // Open or refresh alerts for breaches that have met their strike count.
    for (const [k, b] of breachByKey) {
      const need = strikesFor.get(b.ruleId) ?? 2;
      if ((this.streak.get(k) ?? 0) < need) continue; // still debouncing
      const existing = openByKey.get(k);
      if (existing) {
        await store.refresh(existing.id, b, input.now);
        refreshed++;
      } else {
        await store.open(b, input.now);
        opened++;
      }
    }

    // Auto-resolve any open alert whose breach is gone this cycle.
    for (const [k, a] of openByKey) {
      if (!breachByKey.has(k)) resolvedIds.push(a.id);
    }
    if (resolvedIds.length) await store.resolve(resolvedIds, input.now);

    return { opened, refreshed, resolved: resolvedIds.length, pending };
  }
}
