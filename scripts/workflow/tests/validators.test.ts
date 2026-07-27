import { describe, it, expect } from "vitest";
import type {
  PageSpec,
  ComponentInventory,
  FieldInventory,
  DataContract,
  StateContract,
  ActionContract,
  TraceabilityMatrix,
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
  checkStaleInputs,
  hasBlocking,
} from "../validators";
import { validMeta } from "./fixtures/valid-meta";

// ─── Shared GREEN fixtures (a consistent, fully-covered mini page) ───────────
const fieldInventory: FieldInventory = {
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

const componentInventory: ComponentInventory = {
  meta: validMeta,
  components: [
    {
      id: "tdarr.main.nodes.node-card",
      name: "NodeCard",
      required: true,
      states: ["loading", "ready"],
      designRef: "tdarr-redesign.png@dbe5a12",
    },
  ],
};

const pageSpec: PageSpec = {
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

const dataContract: DataContract = {
  meta: validMeta,
  fields: [
    {
      fieldId: "tdarr.main.nodes.node-card.replace-progress",
      transportKind: "http-poll",
      cadenceTier: "medium-10-15s",
      producer: "replaceProgress derivation (writtenBytes/finalBytes)",
      producerRef: "src/lib/panels/tdarr-stage.ts#WorkerStage",
      updateMechanism: "medium-cadence poll of Tdarr nodes",
      notes: null,
    },
  ],
};

const stateContract: StateContract = {
  meta: validMeta,
  states: [
    {
      componentId: "tdarr.main.nodes.node-card",
      state: "loading",
      trigger: "no snapshot yet",
      presentation: "skeleton",
    },
    {
      componentId: "tdarr.main.nodes.node-card",
      state: "ready",
      trigger: "snapshot present",
      presentation: "node card",
    },
  ],
};

const actionContract: ActionContract = {
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

const traceMatrix: TraceabilityMatrix = {
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

// ─── Coverage: GREEN ─────────────────────────────────────────────────────────
describe("coverage validators — green fixtures pass", () => {
  it("field coverage 100%", () => {
    const r = checkFieldCoverage(fieldInventory, dataContract);
    expect(r.ok).toBe(true);
    expect(r.coveragePct).toBe(100);
  });
  it("component coverage 100%", () => {
    expect(checkComponentCoverage(componentInventory, pageSpec).ok).toBe(true);
  });
  it("state coverage 100%", () => {
    expect(checkStateCoverage(componentInventory, stateContract).ok).toBe(true);
  });
  it("action coverage 100%", () => {
    expect(checkActionCoverage(actionContract).ok).toBe(true);
  });
  it("traceability passes", () => {
    expect(checkTraceability(fieldInventory, dataContract, traceMatrix).ok).toBe(true);
  });
});

// ─── Coverage: RED ───────────────────────────────────────────────────────────
describe("coverage validators — red fixtures fail", () => {
  it("field coverage flags an unmapped required field (critical)", () => {
    const r = checkFieldCoverage(fieldInventory, { ...dataContract, fields: [] });
    expect(r.ok).toBe(false);
    expect(hasBlocking(r)).toBe(true);
    expect(r.coveragePct).toBe(0);
  });
  it("component coverage flags a component missing from page-spec", () => {
    const emptySpec: PageSpec = { ...pageSpec, regions: [{ ...pageSpec.regions[0], sections: [] }] };
    expect(checkComponentCoverage(componentInventory, emptySpec).ok).toBe(false);
  });
  it("state coverage flags an undocumented required state", () => {
    const missingState: StateContract = { ...stateContract, states: [stateContract.states[0]] };
    const r = checkStateCoverage(componentInventory, missingState);
    expect(r.ok).toBe(false);
    expect(hasBlocking(r)).toBe(true);
  });
  it("action coverage flags an action with no RBAC role", () => {
    const noRole: ActionContract = {
      ...actionContract,
      actions: [{ ...actionContract.actions[0], requiredRoles: [] }],
    };
    expect(checkActionCoverage(noRole).ok).toBe(false);
  });
  it("traceability flags a missing link", () => {
    const r = checkTraceability(fieldInventory, dataContract, { ...traceMatrix, links: [] });
    expect(r.ok).toBe(false);
    expect(hasBlocking(r)).toBe(true);
  });
  it("traceability flags an unverified link", () => {
    const unverified: TraceabilityMatrix = {
      ...traceMatrix,
      links: [{ ...traceMatrix.links[0], verified: false }],
    };
    expect(checkTraceability(fieldInventory, dataContract, unverified).ok).toBe(false);
  });
});

// ─── Blocker 1: no unknown producer ──────────────────────────────────────────
describe("blocker: no-unknown-producer", () => {
  it("green: known producer passes", () => {
    expect(checkNoUnknownProducer(fieldInventory, dataContract).ok).toBe(true);
  });
  it("red: transportKind unknown on a required field is critical", () => {
    const bad: DataContract = {
      ...dataContract,
      fields: [{ ...dataContract.fields[0], transportKind: "unknown", cadenceTier: null }],
    };
    const r = checkNoUnknownProducer(fieldInventory, bad);
    expect(r.ok).toBe(false);
    expect(hasBlocking(r)).toBe(true);
  });
  it("red: placeholder producer text is critical", () => {
    const bad: DataContract = {
      ...dataContract,
      fields: [{ ...dataContract.fields[0], producer: "TODO wire this up" }],
    };
    expect(checkNoUnknownProducer(fieldInventory, bad).ok).toBe(false);
  });
});

// ─── Blocker 2: no omitted component ─────────────────────────────────────────
describe("blocker: no-omitted-component", () => {
  it("green: placed component passes", () => {
    expect(checkNoOmittedComponent(componentInventory, pageSpec).ok).toBe(true);
  });
  it("red: omitted required component is critical", () => {
    const emptySpec: PageSpec = { ...pageSpec, regions: [{ ...pageSpec.regions[0], sections: [] }] };
    const r = checkNoOmittedComponent(componentInventory, emptySpec);
    expect(r.ok).toBe(false);
    expect(r.findings[0].rule).toBe("no-omitted-component");
    expect(hasBlocking(r)).toBe(true);
  });
});

// ─── Blocker 3: no forbidden producer (Tdarr percentage trap as CONFIG) ──────
describe("blocker: no-forbidden-producer", () => {
  // The Tdarr write-back trap expressed as a config pattern, NOT apparatus code.
  const tdarrTrapPatterns = ["\\bpercentage\\b"];
  it("green: replaceProgress producer passes the trap pattern", () => {
    expect(checkNoForbiddenProducer(dataContract, tdarrTrapPatterns).ok).toBe(true);
  });
  it("red: a bare percentage producer trips the trap (critical)", () => {
    const trap: DataContract = {
      ...dataContract,
      fields: [
        {
          ...dataContract.fields[0],
          producer: "raw percentage field",
          producerRef: "tdarr api percentage",
        },
      ],
    };
    const r = checkNoForbiddenProducer(trap, tdarrTrapPatterns);
    expect(r.ok).toBe(false);
    expect(hasBlocking(r)).toBe(true);
  });
});

// ─── Prior-art reconciler ────────────────────────────────────────────────────
describe("prior-art reconciler", () => {
  it("clean when prior art matches generated inventory", () => {
    const r = reconcilePriorArt(fieldInventory, dataContract, [
      { key: "tdarr.main.nodes.node-card.replace-progress", source: "http-poll" },
    ]);
    expect(r.clean).toBe(true);
    expect(r.drift).toHaveLength(0);
  });

  it("emits every drift kind on a known-drift fixture", () => {
    const r = reconcilePriorArt(fieldInventory, dataContract, [
      // contradictory: same field, wrong source
      { key: "Write-back progress", source: "udp-push", owner: "poller" },
      // duplicate + ambiguous-owner: same key twice, different owners
      { key: "ghost metric", owner: "poller" },
      { key: "ghost metric", owner: "web" },
      // stale: prior-art key with no generated match (also the duplicate above is stale)
    ]);
    const kinds = new Set(r.drift.map((d) => d.kind));
    expect(kinds.has("contradictory")).toBe(true);
    expect(kinds.has("duplicate")).toBe(true);
    expect(kinds.has("ambiguous-owner")).toBe(true);
    expect(kinds.has("stale")).toBe(true);
  });

  it("flags a generated field missing from prior art", () => {
    const r = reconcilePriorArt(fieldInventory, dataContract, []);
    expect(r.drift.some((d) => d.kind === "missing")).toBe(true);
  });
});

// ─── Stale-input guard ───────────────────────────────────────────────────────
describe("stale-input guard", () => {
  const recorded = [
    { path: "src/poller/clients/tdarr.ts", hash: "aaa" },
    { path: ".../tdarr-redesign.png", hash: "bbb" },
  ];
  const pipeline = [
    { phase: "discovery", consumes: ["src/poller/clients/tdarr.ts"] },
    { phase: "contract", consumes: [".../tdarr-redesign.png"] },
    { phase: "implement", consumes: [] },
  ];

  it("no change → nothing invalidated", () => {
    const r = checkStaleInputs({
      recorded,
      current: { "src/poller/clients/tdarr.ts": "aaa", ".../tdarr-redesign.png": "bbb" },
      pipeline,
    });
    expect(r.ok).toBe(true);
    expect(r.invalidatedPhases).toEqual([]);
  });

  it("mutating the earliest input invalidates it AND all downstream phases", () => {
    const r = checkStaleInputs({
      recorded,
      current: { "src/poller/clients/tdarr.ts": "MUTATED", ".../tdarr-redesign.png": "bbb" },
      pipeline,
    });
    expect(r.ok).toBe(false);
    expect(r.changedInputs).toEqual(["src/poller/clients/tdarr.ts"]);
    // discovery changed → discovery + contract + implement all invalidated
    expect(r.invalidatedPhases).toEqual(["discovery", "contract", "implement"]);
  });

  it("mutating a later input invalidates only it and its downstream", () => {
    const r = checkStaleInputs({
      recorded,
      current: { "src/poller/clients/tdarr.ts": "aaa", ".../tdarr-redesign.png": "MUTATED" },
      pipeline,
    });
    expect(r.invalidatedPhases).toEqual(["contract", "implement"]);
  });

  it("a missing input is treated as changed", () => {
    const r = checkStaleInputs({
      recorded,
      current: { "src/poller/clients/tdarr.ts": "aaa" },
      pipeline,
    });
    expect(r.ok).toBe(false);
    expect(r.invalidatedPhases).toEqual(["contract", "implement"]);
  });
});
