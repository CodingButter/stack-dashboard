// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TdarrPanel as TdarrData } from "@/lib/panels/schemas";
import { tdarrPanelSchema } from "@/lib/panels/schemas";

/**
 * Phase 5 runtime-render verification (jsdom).
 *
 * Drives the real <TdarrPanel/> through every required state from
 * state-contract.json and asserts each renders a concrete, non-empty
 * presentation — no contracted component silently disappears. usePanelData is
 * driven by a mocked global fetch; useGovernorTelemetry is mocked per case.
 *
 * The base fixture mirrors the LIVE payload shape confirmed against the prod DB
 * (4 nodes, stats present, governor running, queue/workers series populated).
 */

// ── mock the live governor push hook (default: feed offline → HTTP fallback) ──
const mockGovTelemetry = vi.fn(() => ({ live: false, governor: null }));
vi.mock("@/components/telemetry/telemetry-provider", () => ({
  useGovernorTelemetry: () => mockGovTelemetry(),
}));

import { TdarrPanel } from "../tdarr-panel";

const NOW = new Date().toISOString();
const MIN_AGO = new Date(Date.now() - 60_000).toISOString();

function baseData(): TdarrData {
  return tdarrPanelSchema.parse({
    generatedAt: NOW,
    uptime: { tdarr: [{ state: "up" }, { state: "up" }] },
    stats: {
      totalFiles: 3365,
      totalTranscodes: 915,
      totalHealthChecks: 3482,
      sizeDiffGb: 1983,
      tdarrScore: 99,
      healthCheckScore: 98,
    },
    nodes: [
      {
        nodeName: "ZenBeastNode",
        paused: false,
        workerCount: 2,
        queue: { transcode: 120, healthcheck: 40 },
        limits: { transcodeCpu: 0, transcodeGpu: 1 },
        limitViolation: false,
        workers: [
          { file: "/media/movie.mkv", percent: 42, fps: 120, eta: "00:03:10", status: "Execute" },
        ],
      },
    ],
    series: {
      queueDepth: [{ at: MIN_AGO, v: 160 }, { at: NOW, v: 160 }],
      workersActive: [{ at: MIN_AGO, v: 4 }, { at: NOW, v: 4 }],
      writebackMbps: [{ at: MIN_AGO, v: 1.1 }, { at: NOW, v: 1.2 }],
    },
    governor: {
      running: true,
      ts: Date.now(),
      ageSecs: 3,
      pollSecs: 2,
      mode: "governing",
      frozen: false,
      activeStreams: 1,
      streamKbps: 8000,
      sabLimitMbps: 40,
      laneMaxSecs: 120,
      laneHolder: "ZenBeastNode",
      heavyNodes: [],
      governorPausedNodes: [],
      nodes: [
        {
          name: "ZenBeastNode",
          exempt: false,
          paused: false,
          pausedByGovernor: false,
          heavy: false,
          writing: true,
          activelyWorking: true,
          replaceDeferred: false,
          replaceProgress: { writtenBytes: 500, finalBytes: 1000, pct: 50, mbps: 1.2 },
          laneHeldSecs: 12,
          workerCount: 1,
          workerStatuses: ["Execute"],
        },
      ],
    },
  });
}

/** Point global fetch at a fixed payload so usePanelData resolves to it. */
function mockFetch(payload: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  }) as unknown as typeof fetch;
}

async function renderPanel() {
  const utils = render(<TdarrPanel />);
  await waitFor(() => expect(screen.queryByText("Loading Tdarr…")).toBeNull());
  return utils;
}

beforeEach(() => {
  mockGovTelemetry.mockReturnValue({ live: false, governor: null });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TdarrPanel — required states render (Phase 5 runtime verification)", () => {
  it("loading: shows the loading placeholder before data resolves", () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<TdarrPanel />);
    expect(screen.queryByText("Loading Tdarr…")).not.toBeNull();
  });

  it("error: surfaces the failure message when the fetch is not ok", async () => {
    mockFetch({}, false);
    render(<TdarrPanel />);
    await waitFor(() => expect(screen.queryByText(/Failed to load/)).not.toBeNull());
  });

  it("ready: renders the 6-KPI strip with live-shaped numbers", async () => {
    mockFetch(baseData());
    await renderPanel();
    expect(screen.queryByText("Library files")).not.toBeNull();
    expect(screen.queryByText("3365")).not.toBeNull(); // totalFiles
    expect(screen.queryByText("915")).not.toBeNull(); // transcodes
    expect(screen.queryByText("Active workers")).not.toBeNull();
    // "1 / 2" renders in both the KPI card and the analytics load card.
    expect(screen.getAllByText("1 / 2").length).toBeGreaterThan(0); // activeWorkers / totalWorkers
  });

  it("ready: renders the throughput chart with the aggregate value when history exists", async () => {
    mockFetch(baseData());
    await renderPanel();
    expect(screen.queryByText("Write-back throughput (total)")).not.toBeNull();
    expect(screen.queryByText("1.2")).not.toBeNull(); // latest writebackMbps
    expect(screen.queryByText("No throughput history yet")).toBeNull();
  });

  it("empty (throughput): renders the explicit empty state when the series is empty", async () => {
    const d = baseData();
    d.series.writebackMbps = [];
    mockFetch(d);
    await renderPanel();
    expect(screen.queryByText("No throughput history yet")).not.toBeNull();
  });

  it("empty (queue chart): renders 'No data yet' when the queue series is empty", async () => {
    const d = baseData();
    d.series.queueDepth = [];
    mockFetch(d);
    await renderPanel();
    expect(screen.queryByText("No data yet")).not.toBeNull();
  });

  it("empty (nodes): renders 'No nodes connected' rather than a blank grid", async () => {
    const d = baseData();
    d.nodes = [];
    mockFetch(d);
    await renderPanel();
    expect(screen.getAllByText("No nodes connected").length).toBeGreaterThan(0);
  });

  it("unavailable (governor null): renders the governor-unavailable message, not a blank card", async () => {
    const d = baseData();
    d.governor = null;
    mockFetch(d);
    await renderPanel();
    expect(screen.queryByText(/Governor status unavailable/)).not.toBeNull();
  });

  it("stale (governor running:false): renders a distinct dead/stale governor state", async () => {
    const d = baseData();
    d.governor = { ...d.governor!, running: false };
    mockFetch(d);
    await renderPanel();
    // GovernorCard renders a loud dead/stale branch when running is false — not the live "Governing" headline.
    expect(screen.queryByText(/Governing/)).toBeNull();
  });

  it("service-health unavailable: renders 'Health unknown' when no uptime samples exist", async () => {
    const d = baseData();
    d.uptime = {};
    mockFetch(d);
    await renderPanel();
    expect(screen.queryByText(/Health unknown/)).not.toBeNull();
  });

  it("partial (node paused, no workers): still renders the node card, not a blank slot", async () => {
    const d = baseData();
    d.nodes[0].paused = true;
    d.nodes[0].workers = [];
    mockFetch(d);
    await renderPanel();
    expect(screen.getAllByText("ZenBeastNode").length).toBeGreaterThan(0);
  });
});
