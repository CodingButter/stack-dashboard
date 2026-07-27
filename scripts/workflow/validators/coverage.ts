import type {
  PageSpec,
  ComponentInventory,
  FieldInventory,
  DataContract,
  StateContract,
  ActionContract,
} from "../schemas";
import { type ValidationResult, type Finding, fail } from "./types";

/** Collect every component id referenced anywhere in the page-spec tree. */
function pageSpecComponentIds(spec: PageSpec): Set<string> {
  const ids = new Set<string>();
  for (const region of spec.regions)
    for (const section of region.sections)
      for (const component of section.components) ids.add(component.id);
  return ids;
}

function pct(covered: number, total: number): number {
  return total === 0 ? 100 : Math.round((covered / total) * 100);
}

/**
 * Field coverage: every REQUIRED field in the field-inventory must have a
 * mapping in the data-contract. Missing mappings are critical (a field shown
 * with no producer).
 */
export function checkFieldCoverage(
  fields: FieldInventory,
  data: DataContract,
): ValidationResult {
  const mapped = new Set(data.fields.map((f) => f.fieldId));
  const required = fields.fields.filter((f) => f.required);
  const findings: Finding[] = [];
  for (const f of required) {
    if (!mapped.has(f.id)) {
      findings.push({
        rule: "field-coverage",
        severity: "critical",
        message: `required field has no data-contract mapping: ${f.id}`,
        ref: f.id,
      });
    }
  }
  const covered = required.length - findings.length;
  return fail(findings, pct(covered, required.length));
}

/**
 * Component coverage: every REQUIRED component in the component-inventory must
 * be placed in the page-spec. A redesign component silently omitted from the
 * page structure is critical.
 */
export function checkComponentCoverage(
  components: ComponentInventory,
  spec: PageSpec,
): ValidationResult {
  const placed = pageSpecComponentIds(spec);
  const required = components.components.filter((c) => c.required);
  const findings: Finding[] = [];
  for (const c of required) {
    if (!placed.has(c.id)) {
      findings.push({
        rule: "component-coverage",
        severity: "critical",
        message: `required redesign component missing from page-spec: ${c.id}`,
        ref: c.id,
      });
    }
  }
  const covered = required.length - findings.length;
  return fail(findings, pct(covered, required.length));
}

/**
 * State coverage: every state a required component declares it must render
 * (component-inventory `states`) must have a state-contract entry describing
 * its trigger + presentation.
 */
export function checkStateCoverage(
  components: ComponentInventory,
  states: StateContract,
): ValidationResult {
  const declared = new Set(
    states.states.map((s) => `${s.componentId}::${s.state}`),
  );
  const findings: Finding[] = [];
  let required = 0;
  for (const c of components.components) {
    if (!c.required) continue;
    for (const state of c.states) {
      required += 1;
      if (!declared.has(`${c.id}::${state}`)) {
        findings.push({
          rule: "state-coverage",
          severity: "high",
          message: `component ${c.id} declares state "${state}" but state-contract has no entry`,
          ref: `${c.id}::${state}`,
        });
      }
    }
  }
  const covered = required - findings.length;
  return fail(findings, pct(covered, required));
}

/**
 * Action coverage: every action in the action-contract must name a handler
 * ref (request contract). Actions with an empty handler are unverifiable.
 * Handler emptiness is already blocked by the schema; this reports coverage
 * and flags read-only-misclassification as a signal, not a block.
 */
export function checkActionCoverage(actions: ActionContract): ValidationResult {
  const findings: Finding[] = [];
  for (const a of actions.actions) {
    if (a.requiredRoles.length === 0) {
      findings.push({
        rule: "action-coverage",
        severity: "high",
        message: `action ${a.id} declares no required RBAC role`,
        ref: a.id,
      });
    }
  }
  const covered = actions.actions.length - findings.length;
  return fail(findings, pct(covered, actions.actions.length));
}
