import type {
  ComponentInventory,
  FieldInventory,
  DataContract,
  PageSpec,
} from "../schemas";
import { type ValidationResult, type Finding, fail } from "./types";
import { checkComponentCoverage } from "./coverage";

/**
 * Hard-blocker validators. Each is page-agnostic; any page-specific trap (e.g.
 * the Tdarr `percentage`→producer trap) is supplied as CONFIG, never baked into
 * apparatus logic — see `forbiddenProducerPatterns`.
 */

/** Generic placeholder markers that must never appear in a producer of record. */
const PLACEHOLDER_MARKERS = [
  "tbd",
  "todo",
  "fixme",
  "placeholder",
  "lorem",
  "fake",
  "dummy",
  "xxx",
  "??",
];

/**
 * BLOCKER 1 — no required field may map to an `unknown` transport kind or an
 * empty/placeholder producer. (Schema already forbids empty strings; this adds
 * the semantic `unknown`-kind and placeholder checks.)
 */
export function checkNoUnknownProducer(
  fields: FieldInventory,
  data: DataContract,
): ValidationResult {
  const required = new Set(
    fields.fields.filter((f) => f.required).map((f) => f.id),
  );
  const findings: Finding[] = [];
  for (const f of data.fields) {
    if (!required.has(f.fieldId)) continue;
    if (f.transportKind === "unknown") {
      findings.push({
        rule: "no-unknown-producer",
        severity: "critical",
        message: `required field ${f.fieldId} has transportKind "unknown" — source not yet captured`,
        ref: f.fieldId,
      });
    }
    const haystack = `${f.producer} ${f.producerRef}`.toLowerCase();
    for (const marker of PLACEHOLDER_MARKERS) {
      if (haystack.includes(marker)) {
        findings.push({
          rule: "no-unknown-producer",
          severity: "critical",
          message: `required field ${f.fieldId} has a placeholder producer ("${marker}")`,
          ref: f.fieldId,
        });
        break;
      }
    }
  }
  return fail(findings);
}

/**
 * BLOCKER 2 — no redesign component silently omitted. Thin wrapper over
 * component coverage, surfaced as its own named blocker.
 */
export function checkNoOmittedComponent(
  components: ComponentInventory,
  spec: PageSpec,
): ValidationResult {
  const result = checkComponentCoverage(components, spec);
  return fail(
    result.findings.map((f) => ({ ...f, rule: "no-omitted-component" })),
  );
}

/**
 * BLOCKER 3 — no fabricated / forbidden producer. Config-driven: the caller
 * supplies `forbiddenProducerPatterns` (regex sources) that must not appear in
 * any producer of record. The Tdarr write-back trap is expressed by passing a
 * pattern that matches a bare `percentage` producer for a progress field — the
 * apparatus itself stays page-agnostic.
 */
export function checkNoForbiddenProducer(
  data: DataContract,
  forbiddenProducerPatterns: string[],
): ValidationResult {
  const findings: Finding[] = [];
  const regexes = forbiddenProducerPatterns.map((p) => new RegExp(p, "i"));
  for (const f of data.fields) {
    const haystack = `${f.producer} ${f.producerRef}`;
    for (let i = 0; i < regexes.length; i++) {
      if (regexes[i].test(haystack)) {
        findings.push({
          rule: "no-forbidden-producer",
          severity: "critical",
          message: `field ${f.fieldId} maps to a forbidden producer (pattern: ${forbiddenProducerPatterns[i]})`,
          ref: f.fieldId,
        });
        break;
      }
    }
  }
  return fail(findings);
}
