/**
 * Shared result types for the coverage / traceability / blocker validators.
 * Every validator returns the same `ValidationResult` shape so gate scripts,
 * the reconciler, and the adversarial reviewer all consume one vocabulary.
 */

export type Severity = "critical" | "high" | "medium" | "low";

export interface Finding {
  /** Stable rule id, e.g. "field-coverage" or "no-unknown-producer". */
  rule: string;
  severity: Severity;
  message: string;
  /** The offending stable id / ref, when applicable. */
  ref?: string;
}

export interface ValidationResult {
  ok: boolean;
  findings: Finding[];
  /** Optional 0..100 coverage number for coverage-style checks. */
  coveragePct?: number;
}

export function pass(coveragePct?: number): ValidationResult {
  return { ok: true, findings: [], coveragePct };
}

export function fail(findings: Finding[], coveragePct?: number): ValidationResult {
  return { ok: findings.length === 0, findings, coveragePct };
}

/** True when any finding is critical or high — the hard-gate threshold. */
export function hasBlocking(result: ValidationResult): boolean {
  return result.findings.some((f) => f.severity === "critical" || f.severity === "high");
}
