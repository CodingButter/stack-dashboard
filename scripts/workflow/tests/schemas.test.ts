import { describe, it, expect } from "vitest";
import {
  metaSchema,
  pageSpecSchema,
  componentInventorySchema,
  fieldInventorySchema,
  dataContractSchema,
  stateContractSchema,
  actionContractSchema,
  traceabilityMatrixSchema,
  acceptanceReportSchema,
  canonicalSchemas,
} from "../schemas";
import { validMeta } from "./fixtures/valid-meta";

describe("meta schema", () => {
  it("accepts a well-formed meta block", () => {
    expect(metaSchema.safeParse(validMeta).success).toBe(true);
  });

  it("rejects a bad semver in schemaVersion", () => {
    const bad = { ...validMeta, schemaVersion: "1.0" };
    expect(metaSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing provenance", () => {
    const { provenance: _drop, ...rest } = validMeta;
    expect(metaSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an unknown provenance enum value", () => {
    const bad = { ...validMeta, provenance: "guessed" };
    expect(metaSchema.safeParse(bad).success).toBe(false);
  });

  it("keeps schemaVersion and contractVersion independently declared", () => {
    // Bumping only the contract version must still parse — the two are
    // distinct axes and neither derives from the other.
    const bumped = { ...validMeta, contractVersion: "1.1.0", supersedes: "1.0.0" };
    expect(metaSchema.safeParse(bumped).success).toBe(true);
    // Omitting either one is a hard failure.
    const { contractVersion: _c, ...noContract } = validMeta;
    expect(metaSchema.safeParse(noContract).success).toBe(false);
    const { schemaVersion: _s, ...noSchema } = validMeta;
    expect(metaSchema.safeParse(noSchema).success).toBe(false);
  });

  it("rejects unknown keys (strict) — no fabricated fields ride along", () => {
    const bad = { ...validMeta, injected: "x" };
    expect(metaSchema.safeParse(bad).success).toBe(false);
  });
});

describe("canonical artifact schemas — valid fixtures parse", () => {
  it("page-spec", () => {
    const spec = {
      meta: validMeta,
      pageId: "tdarr",
      title: "Tdarr",
      regions: [
        {
          id: "tdarr.main",
          name: "Main",
          sections: [
            {
              id: "tdarr.main.nodes",
              name: "Nodes",
              components: [
                {
                  id: "tdarr.main.nodes.node-card",
                  name: "NodeCard",
                  designRef: "tdarr-redesign.png@dbe5a12",
                },
              ],
            },
          ],
        },
      ],
    };
    expect(pageSpecSchema.safeParse(spec).success).toBe(true);
  });

  it("component-inventory", () => {
    const inv = {
      meta: validMeta,
      components: [
        {
          id: "tdarr.main.nodes.node-card",
          name: "NodeCard",
          required: true,
          states: ["loading", "ready", "unavailable"],
          designRef: "tdarr-redesign.png@dbe5a12",
        },
      ],
    };
    expect(componentInventorySchema.safeParse(inv).success).toBe(true);
  });

  it("field-inventory", () => {
    const inv = {
      meta: validMeta,
      fields: [
        {
          id: "tdarr.main.nodes.node-card.replace-progress",
          label: "Write-back progress",
          componentId: "tdarr.main.nodes.node-card",
          required: true,
          designRef: "tdarr-redesign.png@dbe5a12",
        },
      ],
    };
    expect(fieldInventorySchema.safeParse(inv).success).toBe(true);
  });

  it("data-contract with the write-back producer, not raw percentage", () => {
    const contract = {
      meta: validMeta,
      fields: [
        {
          fieldId: "tdarr.main.nodes.node-card.replace-progress",
          transportKind: "http-poll",
          cadenceTier: "medium-10-15s",
          producer: "replaceProgress derivation (writtenBytes/finalBytes)",
          producerRef: "src/lib/panels/tdarr-stage.ts#WorkerStage",
          updateMechanism: "medium-cadence poll of Tdarr nodes",
          notes: "raw percentage is 0 through the Replace phase — do not map to it",
        },
      ],
    };
    expect(dataContractSchema.safeParse(contract).success).toBe(true);
  });

  it("data-contract rejects http-poll without a cadence tier", () => {
    const contract = {
      meta: validMeta,
      fields: [
        {
          fieldId: "tdarr.main.nodes.node-card.x",
          transportKind: "http-poll",
          cadenceTier: null,
          producer: "p",
          producerRef: "r",
          updateMechanism: "poll",
          notes: null,
        },
      ],
    };
    expect(dataContractSchema.safeParse(contract).success).toBe(false);
  });

  it("state-contract handles governor null vs running:false distinctly", () => {
    const contract = {
      meta: validMeta,
      states: [
        {
          componentId: "tdarr.main.governor.gauge",
          state: "unavailable",
          trigger: "governor === null (never received)",
          presentation: "unavailable placeholder",
        },
        {
          componentId: "tdarr.main.governor.gauge",
          state: "stale",
          trigger: "governor.running === false (gate dead/stale)",
          presentation: "stale badge with last-seen",
        },
      ],
    };
    expect(stateContractSchema.safeParse(contract).success).toBe(true);
  });

  it("action-contract requires confirmation for non-read-only actions", () => {
    const ok = {
      meta: validMeta,
      actions: [
        {
          id: "tdarr.action.pause-node",
          name: "Pause node",
          safety: "disruptive",
          handlerRef: "src/actions/services/tdarr.ts#pauseNode",
          requiredRoles: ["admin"],
          requiresConfirmation: true,
          expectedEffect: "node stops accepting new work",
          rollback: "resume node",
        },
      ],
    };
    expect(actionContractSchema.safeParse(ok).success).toBe(true);

    const bad = {
      ...ok,
      actions: [{ ...ok.actions[0], requiresConfirmation: false }],
    };
    expect(actionContractSchema.safeParse(bad).success).toBe(false);
  });

  it("traceability-matrix", () => {
    const m = {
      meta: validMeta,
      links: [
        {
          fieldId: "tdarr.main.nodes.node-card.replace-progress",
          producerRef: "src/lib/panels/tdarr-stage.ts#WorkerStage",
          consumerRef: "src/components/panels/tdarr-panel.tsx",
          verified: true,
        },
      ],
    };
    expect(traceabilityMatrixSchema.safeParse(m).success).toBe(true);
  });

  it("acceptance-report — fixture status must carry a follow-up checklist", () => {
    const base = {
      meta: validMeta,
      acceptanceStatus: "fixture-verified-with-live-follow-up",
      coverage: { field: 100, component: 100, state: 100, action: 100, traceability: 100 },
      reviewer: "adversarial_review tool",
      liveFollowUp: [
        {
          item: "confirm poller restart propagation on live NAS",
          ref: "tdarr.main.governor.gauge",
          resolved: false,
        },
      ],
    };
    expect(acceptanceReportSchema.safeParse(base).success).toBe(true);

    // Empty checklist for a fixture status is a hard failure.
    const noChecklist = { ...base, liveFollowUp: [] };
    expect(acceptanceReportSchema.safeParse(noChecklist).success).toBe(false);
  });

  it("acceptance-report — optional shipGate: a passing gate cannot carry critical/high findings", () => {
    const base = {
      meta: validMeta,
      acceptanceStatus: "fixture-verified-with-live-follow-up",
      coverage: { field: 100, component: 100, state: 100, action: 100, traceability: 100 },
      reviewer: "independent adversarial review",
      liveFollowUp: [
        { item: "restart poller and confirm live series", ref: "tdarr.main.chart", resolved: false },
      ],
    };
    // Absent shipGate is valid (pre-ship-gate contract).
    expect(acceptanceReportSchema.safeParse(base).success).toBe(true);

    // A clean pass parses.
    const pass = {
      ...base,
      shipGate: { verdict: "pass", criticalHighFindings: 0, priorFixesReVerified: ["x"], nonBlockingRisks: [] },
    };
    expect(acceptanceReportSchema.safeParse(pass).success).toBe(true);

    // A "pass" with unresolved critical/high findings is a hard failure — no overstated ship.
    const dishonest = {
      ...base,
      shipGate: { verdict: "pass", criticalHighFindings: 2, priorFixesReVerified: [], nonBlockingRisks: [] },
    };
    expect(acceptanceReportSchema.safeParse(dishonest).success).toBe(false);
  });

  it("acceptance-report — live-verified cannot be claimed on fixture provenance", () => {
    const bad = {
      meta: { ...validMeta, provenance: "fixture" },
      acceptanceStatus: "live-verified",
      coverage: { field: 100, component: 100, state: 100, action: 100, traceability: 100 },
      reviewer: "adversarial_review tool",
      liveFollowUp: [],
    };
    expect(acceptanceReportSchema.safeParse(bad).success).toBe(false);
  });

  it("acceptance-report — fixture status cannot be claimed on static-analysis provenance", () => {
    // Reviewer round-1 finding: nothing was fixture-verified, yet the report
    // claimed the fixture status. The fixture status now requires fixture|mixed
    // provenance; a static-analysis run must use contract-only instead.
    const bad = {
      meta: { ...validMeta, provenance: "static-analysis" },
      acceptanceStatus: "fixture-verified-with-live-follow-up",
      coverage: { field: 100, component: 100, state: 100, action: 100, traceability: 100 },
      reviewer: "adversarial_review tool",
      liveFollowUp: [
        { item: "confirm live governor push", ref: "tdarr.governor.status.panel.running", resolved: false },
      ],
    };
    expect(acceptanceReportSchema.safeParse(bad).success).toBe(false);
  });

  it("acceptance-report — contract-only is the honest status for a static-analysis contract stage", () => {
    const base = {
      meta: { ...validMeta, provenance: "static-analysis" },
      acceptanceStatus: "contract-only",
      coverage: { field: 100, component: 100, state: 100, action: 100, traceability: 100 },
      reviewer: "pending-phase-4-independent-review",
      liveFollowUp: [
        { item: "verify write-back live during a real Replace phase", ref: "tdarr.nodes.grid.worker.writeback-pct", resolved: false },
      ],
    };
    expect(acceptanceReportSchema.safeParse(base).success).toBe(true);

    // contract-only demands static-analysis provenance...
    const wrongProvenance = { ...base, meta: { ...validMeta, provenance: "fixture" } };
    expect(acceptanceReportSchema.safeParse(wrongProvenance).success).toBe(false);

    // ...and a preserved non-empty follow-up checklist.
    const noChecklist = { ...base, liveFollowUp: [] };
    expect(acceptanceReportSchema.safeParse(noChecklist).success).toBe(false);
  });
});

describe("canonical schema registry", () => {
  it("exposes exactly the 8 canonical artifact schemas", () => {
    expect(Object.keys(canonicalSchemas).sort()).toEqual(
      [
        "acceptance-report",
        "action-contract",
        "component-inventory",
        "data-contract",
        "field-inventory",
        "page-spec",
        "state-contract",
        "traceability-matrix",
      ].sort(),
    );
  });
});
