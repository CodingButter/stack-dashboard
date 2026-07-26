import { describe, expect, it } from "vitest";

import {
  buildMachine,
  buildOverview,
  buildTdarrPanel,
  deriveAlertCount,
  FLEET,
  type SnapRow,
  type StatusRow,
} from "@/lib/panels/assemble";
import {
  machineSchema,
  overviewSchema,
  tdarrPanelSchema,
} from "@/lib/panels/schemas";

const NOW = new Date("2026-07-24T12:00:00Z");
const FRESH = new Date("2026-07-24T11:59:30Z");
const STALE = new Date("2026-07-24T11:00:00Z");

function agentStats(overrides: Record<string, unknown> = {}) {
  return {
    box: "nas",
    cpuBusy: 42.5,
    iowait: 1.3,
    load1: 6.1,
    memUsedPct: 25.7,
    swapUsedPct: 17.1,
    dstate: 0,
    netRxMbs: 2.9,
    netTxMbs: 8.8,
    bcacheHitPct: 57.9,
    failedUnits: 10,
    uptimeS: 45750,
    filesystems: [
      { path: "/volume1", usedPct: 35.4, totalBytes: 23858717671424, usedBytes: 8436793647104 },
      { path: "/volume2", usedPct: 2.6, totalBytes: 1951583748096, usedBytes: 50017701888 },
    ],
    disks: [{ device: "sda", utilPct: 7.6, awaitMs: 3.2 }],
    ...overrides,
  };
}

const seededStatuses: StatusRow[] = [
  { service: "agent", ok: true, latencyMs: 542, error: null, polledAt: FRESH },
  { service: "plex", ok: true, latencyMs: 112, error: null, polledAt: FRESH },
  { service: "sonarr", ok: true, latencyMs: 231, error: null, polledAt: FRESH },
  { service: "qbittorrent", ok: false, latencyMs: null, error: "403", polledAt: FRESH },
];

const seededSnaps: SnapRow[] = [
  { service: "agent", kind: "stats", payload: agentStats(), polledAt: FRESH },
  {
    service: "agent",
    kind: "smart",
    payload: {
      drives: [
        {
          device: "/dev/nvme0n1",
          healthy: true,
          temperatureC: 33,
          powerOnHours: 10133,
          model: "",
          sparePct: 100,
          mediaErrors: 0,
        },
      ],
    },
    polledAt: FRESH,
  },
  {
    service: "plex",
    kind: "sessions",
    payload: { count: 2, directPlay: 1, transcode: 1, totalBitrateKbps: 12000 },
    polledAt: FRESH,
  },
  {
    service: "sabnzbd",
    kind: "queue",
    payload: { paused: false, speedBps: 5_242_880, mbLeft: 900, queueSize: 3 },
    polledAt: FRESH,
  },
  {
    service: "sonarr",
    kind: "status",
    payload: { queue: { total: 4 }, health: { errors: 0, warnings: 1 }, rootFolders: [] },
    polledAt: FRESH,
  },
  {
    service: "tdarr",
    kind: "nodes",
    payload: {
      nodes: [
        {
          nodeName: "BigBeastNode",
          paused: false,
          workerCount: 1,
          workers: [{ file: "x", percent: 40, fps: 120, eta: "0:10", status: "running" }],
          queue: { transcode: 12, healthcheck: 0 },
        },
      ],
    },
    polledAt: FRESH,
  },
];

describe("buildOverview", () => {
  it("assembles KPIs from seeded snapshot rows and validates against the wire schema", () => {
    const overview = buildOverview(seededStatuses, seededSnaps, { "cpu.busy": [{ at: FRESH.toISOString(), v: 42.5 }] }, NOW);
    expect(() => overviewSchema.parse(overview)).not.toThrow();

    expect(overview.kpis.streams).toBe(2);
    expect(overview.kpis.transcodes).toBe(1);
    expect(overview.kpis.downloadSpeedBps).toBe(5_242_880);
    expect(overview.kpis.queueDepth).toBe(7); // 3 sab + 4 sonarr
    expect(overview.kpis.transcodeFps).toBe(120);
    expect(overview.tiers).toHaveLength(2);
    expect(overview.tiers[0].label).toContain("Cold");
    expect(overview.vitals?.cpuBusy).toBe(42.5);
    expect(overview.vitals?.cpuSeries).toHaveLength(1);
  });

  it("returns null vitals and empty tiers when the agent has never reported", () => {
    const overview = buildOverview(
      seededStatuses.filter((s) => s.service !== "agent"),
      seededSnaps.filter((s) => s.service !== "agent"),
      {},
      NOW,
    );
    expect(overview.vitals).toBeNull();
    expect(overview.tiers).toEqual([]);
    expect(() => overviewSchema.parse(overview)).not.toThrow();
  });

  it("zeroes live net rates when the agent snapshot is stale", () => {
    const staleSnaps = seededSnaps.map((s) =>
      s.service === "agent" && s.kind === "stats" ? { ...s, polledAt: STALE } : s,
    );
    const overview = buildOverview(seededStatuses, staleSnaps, {}, NOW);
    expect(overview.vitals?.netRxMbs).toBe(0);
    expect(overview.vitals?.netTxMbs).toBe(0);
  });
});

describe("deriveAlertCount", () => {
  it("counts down services", () => {
    expect(deriveAlertCount(seededStatuses, null)).toBe(1); // qbittorrent down
  });

  it("counts tier valve breaches at 80%+", () => {
    const agent = agentStats({
      filesystems: [
        { path: "/volume2", usedPct: 83, totalBytes: 1, usedBytes: 1 },
        { path: "/volume1", usedPct: 35, totalBytes: 1, usedBytes: 1 },
      ],
    });
    // 1 down service + 1 valve breach
    expect(deriveAlertCount(seededStatuses, agent as never)).toBe(2);
  });

  it("counts D-state processes as an alert", () => {
    const agent = agentStats({ dstate: 3 });
    expect(deriveAlertCount([], agent as never)).toBe(1);
  });
});

describe("buildMachine", () => {
  const nasDef = FLEET[0];

  it("marks the box online with fresh stats and carries SMART drives", () => {
    const m = buildMachine(
      nasDef,
      seededStatuses,
      seededSnaps,
      { "nas:cpu.busy": [{ at: FRESH.toISOString(), v: 42.5 }] },
      NOW,
    );
    expect(() => machineSchema.parse(m)).not.toThrow();
    expect(m.online).toBe(true);
    expect(m.stats?.uptimeS).toBe(45750);
    expect(m.smart?.[0].device).toBe("/dev/nvme0n1");
    expect(m.series.cpu).toHaveLength(1);
  });

  it("marks the box offline when the last snapshot is stale", () => {
    const staleSnaps = seededSnaps.map((s) =>
      s.service === "agent" ? { ...s, polledAt: STALE } : s,
    );
    const m = buildMachine(nasDef, seededStatuses, staleSnaps, {}, NOW);
    expect(m.online).toBe(false);
    expect(m.lastSeen).toBe(STALE.toISOString());
    expect(m.stats).not.toBeNull(); // still shows last-known stats
  });

  it("renders a no-agent box as unknown with null stats", () => {
    const m = buildMachine(FLEET[1], seededStatuses, seededSnaps, {}, NOW);
    expect(m.online).toBe(false);
    expect(m.stats).toBeNull();
    expect(m.smart).toBeNull();
    expect(() => machineSchema.parse(m)).not.toThrow();
  });
});

describe("buildTdarrPanel governor block", () => {
  // camelCased payload, as parseAgentGovernor produces it.
  const governorPayload = (over: Record<string, unknown> = {}) => ({
    running: true,
    ts: Math.round(FRESH.getTime() / 1000),
    pollSecs: 20,
    mode: "governing",
    frozen: false,
    activeStreams: 0,
    streamKbps: 0,
    sabLimitMbps: null,
    laneMaxSecs: 600,
    laneHolder: "BigBeastNode",
    heavyNodes: ["BigBeastNode"],
    governorPausedNodes: ["DevBeastNode"],
    nodes: [],
    ...over,
  });

  it("is null when no governor snapshot has ever landed", () => {
    const panel = buildTdarrPanel([], {}, {}, NOW);
    expect(panel.governor).toBeNull();
    expect(() => tdarrPanelSchema.parse(panel)).not.toThrow();
  });

  it("passes a fresh running snapshot through with a computed ageSecs", () => {
    const snaps: SnapRow[] = [
      { service: "agent", kind: "governor", payload: governorPayload(), polledAt: FRESH },
    ];
    const panel = buildTdarrPanel(snaps, {}, {}, NOW);
    expect(panel.governor?.running).toBe(true);
    expect(panel.governor?.mode).toBe("governing");
    // NOW - FRESH = 30s.
    expect(panel.governor?.ageSecs).toBe(30);
    expect(() => tdarrPanelSchema.parse(panel)).not.toThrow();
  });

  it("forces running:false when the snapshot row itself is stale", () => {
    // Poller stopped persisting governor rows — must not render as live.
    const snaps: SnapRow[] = [
      { service: "agent", kind: "governor", payload: governorPayload(), polledAt: STALE },
    ];
    const panel = buildTdarrPanel(snaps, {}, {}, NOW);
    expect(panel.governor).not.toBeNull();
    expect(panel.governor?.running).toBe(false);
  });
});
