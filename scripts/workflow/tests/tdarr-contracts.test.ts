import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  pageSpecSchema,
  componentInventorySchema,
  fieldInventorySchema,
  dataContractSchema,
  stateContractSchema,
  actionContractSchema,
  traceabilityMatrixSchema,
  acceptanceReportSchema,
} from "../schemas";
import {
  checkFieldCoverage,
  checkComponentCoverage,
  checkStateCoverage,
  checkActionCoverage,
  checkTraceability,
  checkNoUnknownProducer,
  checkNoOmittedComponent,
  checkNoForbiddenProducer,
  reconcilePriorArt,
  type PriorArtField,
} from "../validators";

/**
 * Phase 4 gate: load the REAL generated Tdarr contracts from
 * docs/stackdash/contracts/tdarr/ and prove every canonical artifact validates
 * against its schema and clears every coverage / traceability / hard-blocker
 * gate. This is the machine-checkable half of the mid-run decision gate.
 */

const DIR = join(process.cwd(), "docs/stackdash/contracts/tdarr");
const load = (name: string) => JSON.parse(readFileSync(join(DIR, name), "utf8"));

const pageSpec = pageSpecSchema.parse(load("page-spec.json"));
const components = componentInventorySchema.parse(load("component-inventory.json"));
const fields = fieldInventorySchema.parse(load("field-inventory.json"));
const data = dataContractSchema.parse(load("data-contract.json"));
const states = stateContractSchema.parse(load("state-contract.json"));
const actions = actionContractSchema.parse(load("action-contract.json"));
const matrix = traceabilityMatrixSchema.parse(load("traceability-matrix.json"));
const acceptance = acceptanceReportSchema.parse(load("acceptance-report.json"));

// The Tdarr write-back trap, expressed as CONFIG (never baked into apparatus):
// a write-back progress field must NOT be produced by a bare worker percentage.
const TDARR_FORBIDDEN_PRODUCERS = ["writeback.*worker\\.percentage", "replace.*worker\\.percentage"];

describe("Tdarr contracts — schema validity", () => {
  it("all 8 artifacts parse against their schemas", () => {
    expect(pageSpec.pageId).toBe("tdarr");
    expect(components.components.length).toBeGreaterThan(0);
    expect(fields.fields.length).toBeGreaterThan(0);
    expect(data.fields.length).toBeGreaterThan(0);
    expect(states.states.length).toBeGreaterThan(0);
    expect(actions.actions.length).toBeGreaterThan(0);
    expect(matrix.links.length).toBeGreaterThan(0);
    expect(acceptance.acceptanceStatus).toBe("fixture-verified-with-live-follow-up");
  });
});

describe("Tdarr contracts — coverage gates", () => {
  it("field coverage is complete", () => {
    const r = checkFieldCoverage(fields, data);
    expect(r.findings).toEqual([]);
    expect(r.coveragePct).toBe(100);
  });
  it("component coverage is complete", () => {
    const r = checkComponentCoverage(components, pageSpec);
    expect(r.findings).toEqual([]);
    expect(r.coveragePct).toBe(100);
  });
  it("state coverage is complete", () => {
    const r = checkStateCoverage(components, states);
    expect(r.findings).toEqual([]);
    expect(r.coveragePct).toBe(100);
  });
  it("action coverage is complete", () => {
    const r = checkActionCoverage(actions);
    expect(r.findings).toEqual([]);
    expect(r.coveragePct).toBe(100);
  });
});

describe("Tdarr contracts — traceability + hard blockers", () => {
  it("producer→consumer traceability is fully verified", () => {
    const r = checkTraceability(fields, data, matrix);
    expect(r.findings).toEqual([]);
  });
  it("no required field has an unknown/placeholder producer", () => {
    const r = checkNoUnknownProducer(fields, data);
    expect(r.findings).toEqual([]);
  });
  it("no redesign component is silently omitted", () => {
    const r = checkNoOmittedComponent(components, pageSpec);
    expect(r.findings).toEqual([]);
  });
  it("no field maps to the forbidden write-back-via-percentage producer (trap)", () => {
    const r = checkNoForbiddenProducer(data, TDARR_FORBIDDEN_PRODUCERS);
    expect(r.findings).toEqual([]);
  });
  it("write-back fields are produced by replaceProgress, not the worker percentage", () => {
    const wb = data.fields.filter((f) => f.fieldId.includes("writeback"));
    expect(wb.length).toBeGreaterThan(0);
    for (const f of wb) {
      expect(f.producer.toLowerCase()).toContain("replaceprogress");
      expect(`${f.producer} ${f.producerRef}`).not.toMatch(/worker\.percentage/i);
    }
  });
});

describe("Tdarr contracts — prior-art reconciliation", () => {
  // The dashboard-data-classification.md census asserts only coarse Tdarr facts;
  // it never decomposed Tdarr to the field level. We model those coarse claims
  // and expect: no contradictions, and every fine-grained field shows as drift
  // kind `missing` (expected supersession, recorded in gap-analysis.md).
  const priorArt: PriorArtField[] = [
    { key: "governor", source: "server-derived", owner: "agent/governor snapshot" },
  ];

  it("reconciles prior art with no contradictory/duplicate/ambiguous drift", () => {
    const r = reconcilePriorArt(fields, data, priorArt);
    const bad = r.drift.filter(
      (d) => d.kind === "contradictory" || d.kind === "duplicate" || d.kind === "ambiguous-owner",
    );
    expect(bad).toEqual([]);
  });

  it("records fine-grained fields as expected `missing` supersession drift", () => {
    const r = reconcilePriorArt(fields, data, priorArt);
    const missing = r.drift.filter((d) => d.kind === "missing");
    // All 26 generated fields lack a per-field prior-art entry.
    expect(missing.length).toBe(fields.fields.length);
  });
});
