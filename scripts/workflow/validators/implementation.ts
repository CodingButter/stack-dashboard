/**
 * Implementation-conformance validator.
 *
 * The coverage/traceability/blocker validators check the JSON *contracts* against
 * themselves. They cannot tell whether the actual page implementation renders what
 * the contract promises — a contract can be perfect while the component that ships
 * omits half of it. This validator closes that gap: it checks that, for every
 * required component in the contract, the implementation source contains the
 * marker(s) that prove that component is rendered.
 *
 * The logic here is page-agnostic. The Tdarr-specific knowledge (which regex
 * proves which component is on screen) lives in a run-scoped marker map supplied
 * by the caller — never hard-coded into the apparatus. That keeps this validator
 * reusable for any page: swap the marker map, keep the logic.
 */

import { fail, pass, type Finding, type ValidationResult } from "./types";

/** One required component and the source markers that prove it is rendered. */
export interface ComponentMarker {
  /** Stable componentId from the component-inventory / field-inventory. */
  componentId: string;
  /**
   * Regex source strings. ALL must match the implementation source for the
   * component to count as rendered. A component with an empty list is treated
   * as an authoring error (nothing proves it), so it fails.
   */
  patterns: string[];
  /** Human label for messages. */
  label?: string;
}

export interface ImplementationInput {
  /** The implementation source under test (concatenated component/page source). */
  source: string;
  /** Run-scoped marker map: which patterns prove each required component. */
  markers: ComponentMarker[];
}

/**
 * Fails (high severity) for every required component whose markers are not all
 * present in the implementation source — i.e. a contracted component the shipped
 * code does not actually render.
 */
export function checkImplementation(input: ImplementationInput): ValidationResult {
  const findings: Finding[] = [];
  const total = input.markers.length;
  let present = 0;

  for (const m of input.markers) {
    if (m.patterns.length === 0) {
      findings.push({
        rule: "impl-conformance",
        severity: "high",
        message: `Component ${m.componentId} has no proof markers — cannot verify it is rendered.`,
        ref: m.componentId,
      });
      continue;
    }

    const missing = m.patterns.filter((p) => !new RegExp(p).test(input.source));
    if (missing.length > 0) {
      findings.push({
        rule: "impl-conformance",
        severity: "high",
        message: `Component ${m.componentId}${m.label ? ` (${m.label})` : ""} not rendered in implementation — missing marker(s): ${missing.join(", ")}`,
        ref: m.componentId,
      });
    } else {
      present += 1;
    }
  }

  const coveragePct = total === 0 ? 100 : Math.round((present / total) * 100);
  return findings.length === 0 ? pass(coveragePct) : fail(findings, coveragePct);
}
