import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  pageSpecSchema,
  componentInventorySchema,
  fieldInventorySchema,
  dataContractSchema,
  stateContractSchema,
  actionContractSchema,
  traceabilityMatrixSchema,
  type Meta,
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
} from "../validators";
import { validatePageId } from "../utilities/page-id";

/**
 * Phase 5.5 — Apparatus portability regression (plan amendment 2).
 *
 * Proves the apparatus is genuinely reusable, NOT hard-wired to Tdarr, using a
 * SYNTHETIC non-Tdarr page ("weather-station") built entirely in this file.
 * No production page (Downloads, Overview, …) is migrated here.
 *
 * The synthetic page deliberately uses vocabulary that shares NOTHING with
 * Tdarr (no governor, node, worker, transcode, write-back, replaceProgress) so
 * that any Tdarr-specific assumption in the apparatus would surface as a
 * failure to accept this page or to block its omissions.
 */

const PAGE = "weather-station";

const META: Meta = {
  schemaVersion: "1.0.0",
  contractVersion: "1.0.0",
  pageId: PAGE,
  createdAt: "2026-07-27T00:00:00Z",
  updatedAt: "2026-07-27T00:00:00Z",
  apparatusVersion: "portability-regression",
  sourceDesignRef: "synthetic://weather-station-redesign@v1",
  provenance: "static-analysis",
  supersedes: null,
};

// ── A valid, fully-covered synthetic page shape ──────────────────────────────

const pageSpec = pageSpecSchema.parse({
  meta: META,
  pageId: PAGE,
  title: "Weather Station",
  regions: [
    {
      id: `${PAGE}.summary`,
      name: "Summary",
      sections: [
        {
          id: `${PAGE}.summary.current`,
          name: "Current Conditions",
          components: [
            { id: `${PAGE}.summary.current.temp-card`, name: "Temperature", designRef: "synthetic://a" },
            { id: `${PAGE}.summary.current.wind-card`, name: "Wind", designRef: "synthetic://b" },
          ],
        },
      ],
    },
    {
      id: `${PAGE}.charts`,
      name: "Charts",
      sections: [
        {
          id: `${PAGE}.charts.trends`,
          name: "Trends",
          components: [
            { id: `${PAGE}.charts.trends.temp-history`, name: "Temp History", designRef: "synthetic://c" },
          ],
        },
      ],
    },
  ],
});

const components = componentInventorySchema.parse({
  meta: META,
  components: [
    {
      id: `${PAGE}.summary.current.temp-card`,
      name: "Temperature",
      required: true,
      states: ["loading", "ready", "unavailable"],
      designRef: "synthetic://a",
    },
    {
      id: `${PAGE}.summary.current.wind-card`,
      name: "Wind",
      required: true,
      states: ["loading", "ready"],
      designRef: "synthetic://b",
    },
    {
      id: `${PAGE}.charts.trends.temp-history`,
      name: "Temp History",
      required: true,
      states: ["loading", "empty", "ready"],
      designRef: "synthetic://c",
    },
  ],
});

const fields = fieldInventorySchema.parse({
  meta: META,
  fields: [
    { id: `${PAGE}.summary.current.temp-card.value`, label: "Temp °C", componentId: `${PAGE}.summary.current.temp-card`, required: true, designRef: "synthetic://a" },
    { id: `${PAGE}.summary.current.wind-card.speed`, label: "Wind kph", componentId: `${PAGE}.summary.current.wind-card`, required: true, designRef: "synthetic://b" },
    { id: `${PAGE}.summary.current.wind-card.gust`, label: "Gust kph", componentId: `${PAGE}.summary.current.wind-card`, required: false, designRef: "synthetic://b" },
    { id: `${PAGE}.charts.trends.temp-history.series`, label: "Temp series", componentId: `${PAGE}.charts.trends.temp-history`, required: true, designRef: "synthetic://c" },
  ],
});

// Exercises ALL transport kinds generically (leak-check item 5).
const data = dataContractSchema.parse({
  meta: META,
  fields: [
    { fieldId: `${PAGE}.summary.current.temp-card.value`, transportKind: "udp-push", cadenceTier: null, producer: "sensorBlaster", producerRef: "agent/sensor.py::temp", updateMechanism: "2Hz push frame", notes: null },
    { fieldId: `${PAGE}.summary.current.wind-card.speed`, transportKind: "http-poll", cadenceTier: "medium-10-15s", producer: "windPoller", producerRef: "src/poll/wind.ts::speed", updateMechanism: "poll tick", notes: null },
    { fieldId: `${PAGE}.summary.current.wind-card.gust`, transportKind: "local-derived", cadenceTier: null, producer: "gustFromSpeed", producerRef: "src/derive/gust.ts", updateMechanism: "client compute", notes: null },
    { fieldId: `${PAGE}.charts.trends.temp-history.series`, transportKind: "database-query", cadenceTier: null, producer: "tempSeries", producerRef: "src/db/series.ts::temp", updateMechanism: "windowed query", notes: null },
  ],
});

const states = stateContractSchema.parse({
  meta: META,
  states: [
    { componentId: `${PAGE}.summary.current.temp-card`, state: "loading", trigger: "no data yet", presentation: "spinner" },
    { componentId: `${PAGE}.summary.current.temp-card`, state: "ready", trigger: "value present", presentation: "number" },
    { componentId: `${PAGE}.summary.current.temp-card`, state: "unavailable", trigger: "sensor offline", presentation: "Sensor offline" },
    { componentId: `${PAGE}.summary.current.wind-card`, state: "loading", trigger: "no data yet", presentation: "spinner" },
    { componentId: `${PAGE}.summary.current.wind-card`, state: "ready", trigger: "value present", presentation: "number" },
    { componentId: `${PAGE}.charts.trends.temp-history`, state: "loading", trigger: "no data yet", presentation: "spinner" },
    { componentId: `${PAGE}.charts.trends.temp-history`, state: "empty", trigger: "series empty", presentation: "No history yet" },
    { componentId: `${PAGE}.charts.trends.temp-history`, state: "ready", trigger: "series present", presentation: "line chart" },
  ],
});

const actions = actionContractSchema.parse({
  meta: META,
  actions: [
    { id: `${PAGE}.summary.current.refresh`, name: "Refresh", safety: "read-only", handlerRef: "actions/weather.ts::refresh", requiredRoles: ["viewer"], requiresConfirmation: false, expectedEffect: "re-fetch current conditions", rollback: null },
    { id: `${PAGE}.summary.current.recalibrate`, name: "Recalibrate", safety: "reversible-write", handlerRef: "actions/weather.ts::recalibrate", requiredRoles: ["admin"], requiresConfirmation: true, expectedEffect: "reset sensor offset", rollback: "restore prior offset" },
  ],
});

const matrix = traceabilityMatrixSchema.parse({
  meta: META,
  links: [
    { fieldId: `${PAGE}.summary.current.temp-card.value`, producerRef: "agent/sensor.py::temp", consumerRef: "components/weather/temp-card.tsx", verified: true },
    { fieldId: `${PAGE}.summary.current.wind-card.speed`, producerRef: "src/poll/wind.ts::speed", consumerRef: "components/weather/wind-card.tsx", verified: true },
    { fieldId: `${PAGE}.charts.trends.temp-history.series`, producerRef: "src/db/series.ts::temp", consumerRef: "components/weather/temp-history.tsx", verified: true },
  ],
});

describe("Phase 5.5 — schemas accept a non-Tdarr page shape", () => {
  it("all 7 artifacts parse with synthetic stable IDs rooted at the supplied slug", () => {
    expect(pageSpec.pageId).toBe(PAGE);
    // Stable IDs are generated from the page config, not hard-coded to any slug.
    expect(pageSpec.regions[0].id.startsWith(`${PAGE}.`)).toBe(true);
    expect(fields.fields.every((f) => f.id.startsWith(`${PAGE}.`))).toBe(true);
  });

  it("transport classification accepts every kind generically", () => {
    const kinds = new Set(data.fields.map((f) => f.transportKind));
    expect(kinds.has("udp-push")).toBe(true);
    expect(kinds.has("http-poll")).toBe(true);
    expect(kinds.has("local-derived")).toBe(true);
    expect(kinds.has("database-query")).toBe(true);
  });
});

describe("Phase 5.5 — validators pass the fully-covered synthetic page", () => {
  it("coverage/traceability/blocker gates are all green with no Tdarr config", () => {
    expect(checkFieldCoverage(fields, data).ok).toBe(true);
    expect(checkComponentCoverage(components, pageSpec).ok).toBe(true);
    expect(checkStateCoverage(components, states).ok).toBe(true);
    expect(checkActionCoverage(actions).ok).toBe(true);
    expect(checkTraceability(fields, data, matrix).ok).toBe(true);
    expect(checkNoUnknownProducer(fields, data).ok).toBe(true);
    expect(checkNoOmittedComponent(components, pageSpec).ok).toBe(true);
    // No forbidden-producer patterns supplied — the Tdarr trap is NOT baked in.
    expect(checkNoForbiddenProducer(data, []).ok).toBe(true);
  });
});

describe("Phase 5.5 — validators block omissions WITHOUT page-specific names", () => {
  it("blocks a required field with no data-contract mapping", () => {
    // Drop the temp-card.value mapping → field coverage must fail critical.
    const brokenData = dataContractSchema.parse({
      meta: META,
      fields: data.fields.filter((f) => !f.fieldId.endsWith("temp-card.value")),
    });
    const res = checkFieldCoverage(fields, brokenData);
    expect(res.ok).toBe(false);
    expect(res.findings.some((f) => f.severity === "critical")).toBe(true);
    expect(res.findings[0].message).toContain("no data-contract mapping");
  });

  it("blocks a required component omitted from the page-spec", () => {
    // A page-spec missing the required temp-history component.
    const brokenSpec = pageSpecSchema.parse({
      meta: META,
      pageId: PAGE,
      title: "Weather Station",
      regions: [pageSpec.regions[0]], // drops the charts region entirely
    });
    const res = checkNoOmittedComponent(components, brokenSpec);
    expect(res.ok).toBe(false);
    expect(res.findings.some((f) => f.rule === "no-omitted-component")).toBe(true);
    expect(res.findings.some((f) => f.ref === `${PAGE}.charts.trends.temp-history`)).toBe(true);
  });
});

describe("Phase 5.5 — command accepts a configurable page identifier", () => {
  it("accepts a safe slug and rejects empty/multi/malformed identifiers", () => {
    expect(validatePageId("weather-station").ok).toBe(true);
    expect(validatePageId("").ok).toBe(false);
    expect(validatePageId("weather station").ok).toBe(false); // space
    expect(validatePageId("a b").ok).toBe(false); // multiple tokens
    expect(validatePageId("Weather").ok).toBe(false); // uppercase not allowed
  });
});

describe("Phase 5.5 — leak check: no page-specific knowledge in apparatus logic", () => {
  // Walk the reusable apparatus source (schemas + validators + utilities) and
  // assert no Tdarr-specific identifier leaked into the reusable logic. Comments
  // that reference Tdarr as an EXAMPLE are allowed; identifiers/strings that
  // would only make sense for Tdarr are not.
  const APPARATUS_DIRS = ["schemas", "validators", "utilities"].map((d) =>
    join(process.cwd(), "scripts/workflow", d),
  );

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) out.push(...walk(p));
      else if (entry.endsWith(".ts")) out.push(p);
    }
    return out;
  }

  // Page-specific tokens that must NOT drive apparatus behavior. We strip line
  // comments first so an explanatory "e.g. the Tdarr write-back trap" comment
  // doesn't trip the check — only executable/identifier usage counts.
  const FORBIDDEN = [
    /\breplaceProgress\b/,
    /\bgovernor\b/i,
    /\btranscode/i,
    /\bwriteback\b/i,
    /"tdarr/i,
    /'tdarr/i,
    /\btdarrPanelSchema\b/,
  ];

  it("apparatus source contains no Tdarr-specific identifiers (comments stripped)", () => {
    const files = APPARATUS_DIRS.flatMap(walk);
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of files) {
      const raw = readFileSync(file, "utf8");
      const code = raw
        .split("\n")
        .map((line) => {
          const idx = line.indexOf("//");
          return idx >= 0 ? line.slice(0, idx) : line;
        })
        .join("\n")
        // strip block comments too
        .replace(/\/\*[\s\S]*?\*\//g, "");
      for (const rx of FORBIDDEN) {
        if (rx.test(code)) offenders.push(`${file} :: ${rx}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
