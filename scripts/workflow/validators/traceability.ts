import type {
  FieldInventory,
  DataContract,
  TraceabilityMatrix,
} from "../schemas";
import { type ValidationResult, type Finding, fail } from "./types";

/**
 * Producer→consumer traceability: every REQUIRED field must have a
 * traceability-matrix link that is `verified`, joining a producer ref to a
 * consumer ref. A producer with no documented consumer, or a consumer with no
 * producer, is a hard finding.
 */
export function checkTraceability(
  fields: FieldInventory,
  data: DataContract,
  matrix: TraceabilityMatrix,
): ValidationResult {
  const findings: Finding[] = [];
  const linkByField = new Map(matrix.links.map((l) => [l.fieldId, l]));
  const contractByField = new Map(data.fields.map((f) => [f.fieldId, f]));

  for (const f of fields.fields) {
    if (!f.required) continue;
    const link = linkByField.get(f.id);
    if (!link) {
      findings.push({
        rule: "traceability",
        severity: "critical",
        message: `required field has no producer→consumer link: ${f.id}`,
        ref: f.id,
      });
      continue;
    }
    if (!link.verified) {
      findings.push({
        rule: "traceability",
        severity: "high",
        message: `producer→consumer link for ${f.id} is unverified`,
        ref: f.id,
      });
    }
    const contract = contractByField.get(f.id);
    if (contract && contract.producerRef !== link.producerRef) {
      findings.push({
        rule: "traceability",
        severity: "high",
        message: `producerRef mismatch for ${f.id}: data-contract "${contract.producerRef}" vs matrix "${link.producerRef}"`,
        ref: f.id,
      });
    }
  }

  // A producer that no consumer references is dead weight — flag it.
  for (const link of matrix.links) {
    if (!link.consumerRef || link.consumerRef.trim() === "") {
      findings.push({
        rule: "traceability",
        severity: "high",
        message: `producer ${link.producerRef} has no documented consumer`,
        ref: link.fieldId,
      });
    }
  }

  return fail(findings);
}
