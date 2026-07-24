import { describe, expect, it } from "vitest";

import {
  buildArr,
  buildDownloads,
  buildStorage,
  buildStreams,
  buildTdarrPanel,
  buildUptimeMap,
  nodeLimitViolation,
  toUptimeCells,
  type SnapRow,
  type StatusRow,
} from "@/lib/panels/assemble";
import {
  arrSchema,
  downloadsSchema,
  storageSchema,
  streamsSchema,
  tdarrPanelSchema,
} from "@/lib/panels/schemas";
import { parsePlexSessions } from "@/poller/clients/plex";
import { parseTdarrNodes } from "@/poller/clients/tdarr";

const NOW = new Date("2026-07-24T12:00:00Z");
const FRESH = new Date("2026-07-24T11:59:30Z");

function statusRow(service: string, ok = true, latencyMs = 100): StatusRow {
  return { service, ok, latencyMs: ok ? latencyMs : null, error: ok ? null : "boom", polledAt: FRESH };
}

describe("toUptimeCells", () => {
  it("maps ok/slow/down and pads to width", () => {
    const cells = toUptimeCells(
      [statusRow("plex"), statusRow("plex", true, 5000), statusRow("plex", false)],
      5,
    );
    expect(cells).toHaveLength(5);
    expect(cells.map((c) => c.state)).toEqual(["empty", "empty", "up", "degraded", "down"]);
  });

  it("buildUptimeMap fills every requested service", () => {
    const map = buildUptimeMap({ plex: [statusRow("plex")] }, ["plex", "tautulli"]);
    expect(Object.keys(map)).toEqual(["plex", "tautulli"]);
    expect(map.tautulli.every((c) => c.state === "empty")).toBe(true);
  });
});

describe("buildStreams", () => {
  const plexRaw = {
    MediaContainer: {
      size: 2,
      Metadata: [
        {
          type: "episode",
          grandparentTitle: "Example Series",
          parentIndex: 4,
          index: 2,
          title: "Pilot",
          viewOffset: 30_000,
          duration: 60_000,
          User: { title: "jamie" },
          Player: { product: "Plex Web", state: "playing" },
          Session: { bandwidth: 12_000 },
          TranscodeSession: { key: "x" },
        },
        {
          type: "movie",
          title: "Example Movie",
          viewOffset: 0,
          duration: 0,
          User: { title: "guest" },
          Player: { product: "Plex for TV", state: "paused" },
          bitrate: 8_000,
        },
      ],
    },
  };

  it("session detail flows parse → snapshot → panel", () => {
    const parsed = parsePlexSessions(plexRaw);
    expect(parsed.sessions[0]).toMatchObject({
      title: "Example Series · S04E02",
      user: "jamie",
      decision: "transcode",
      progressPct: 50,
    });

    const snaps: SnapRow[] = [
      { service: "plex", kind: "sessions", payload: parsed, polledAt: FRESH },
    ];
    const out = buildStreams(snaps, {}, buildUptimeMap({}, ["plex", "tautulli"]), NOW);
    expect(streamsSchema.parse(out).plex?.sessions).toHaveLength(2);
    expect(out.tautulli).toBeNull();
  });

  it("degrades pre-detail snapshots to an empty session list", () => {
    const snaps: SnapRow[] = [
      {
        service: "plex",
        kind: "sessions",
        // Old snapshot shape — no `sessions` key.
        payload: { count: 1, directPlay: 1, transcode: 0, totalBitrateKbps: 0 },
        polledAt: FRESH,
      },
    ];
    const out = buildStreams(snaps, {}, buildUptimeMap({}, ["plex"]), NOW);
    expect(streamsSchema.parse(out).plex?.sessions).toEqual([]);
  });
});

describe("buildDownloads", () => {
  it("assembles sab + qbit and validates", () => {
    const snaps: SnapRow[] = [
      {
        service: "sabnzbd",
        kind: "queue",
        payload: {
          paused: false,
          status: "Downloading",
          speedBps: 1_000_000,
          mbLeft: 512,
          queueSize: 2,
          timeLeft: "0:08:00",
          speedLimitPct: 100,
          diskFreeGb: 900,
          jobs: [{ name: "job-a", percent: 40, mbLeft: 300, timeLeft: "0:05:00", status: "Downloading" }],
          totals: { total: 1, month: 2, week: 3, day: 4 },
        },
        polledAt: FRESH,
      },
      {
        service: "qbittorrent",
        kind: "torrents",
        payload: {
          total: 10, downloading: 1, seeding: 8, stalled: 1, errored: 0,
          seedboost: 3, dlSpeed: 50_000, upSpeed: 200_000,
          byCategory: { seedboost: 3, tv: 7 },
        },
        polledAt: FRESH,
      },
    ];
    const out = buildDownloads(snaps, {}, buildUptimeMap({}, ["sabnzbd", "qbittorrent"]), NOW);
    const parsed = downloadsSchema.parse(out);
    expect(parsed.sab?.totals?.day).toBe(4);
    expect(parsed.qbit?.seedboost).toBe(3);
  });

  it("tolerates a queue snapshot without totals", () => {
    const snaps: SnapRow[] = [
      {
        service: "sabnzbd",
        kind: "queue",
        payload: {
          paused: true, status: "Paused", speedBps: 0, mbLeft: 0, queueSize: 0,
          timeLeft: "0:00:00", speedLimitPct: 55, diskFreeGb: 900, jobs: [],
        },
        polledAt: FRESH,
      },
    ];
    const out = buildDownloads(snaps, {}, buildUptimeMap({}, ["sabnzbd"]), NOW);
    expect(downloadsSchema.parse(out).sab?.totals).toBeNull();
  });
});

describe("buildArr", () => {
  it("joins prowlarr indexer status onto indexers", () => {
    const snaps: SnapRow[] = [
      {
        service: "prowlarr",
        kind: "indexers",
        payload: {
          total: 2,
          enabled: 2,
          indexers: [
            { id: 1, name: "IPTorrents", enabled: true, priority: 25, protocol: "torrent", privacy: "private" },
            { id: 2, name: "NZBgeek", enabled: true, priority: 25, protocol: "usenet", privacy: "private" },
          ],
          rateLimited: [
            { indexerId: 1, disabledTill: "2026-07-25T00:00:00Z", mostRecentFailure: "daily cap" },
          ],
        },
        polledAt: FRESH,
      },
    ];
    const out = buildArr(snaps, buildUptimeMap({}, ["sonarr", "radarr", "prowlarr", "seerr"]), NOW);
    const parsed = arrSchema.parse(out);
    const ipt = parsed.prowlarr?.indexers.find((i) => i.name === "IPTorrents");
    expect(ipt?.disabledTill).toBe("2026-07-25T00:00:00Z");
    expect(ipt?.failure).toBe("daily cap");
    expect(parsed.prowlarr?.indexers.find((i) => i.name === "NZBgeek")?.disabledTill).toBeNull();
    expect(parsed.sonarr).toBeNull();
  });
});

describe("buildTdarrPanel", () => {
  const rawNodes = {
    ephemeralId1: {
      nodeName: "NasTNode",
      nodePaused: false,
      workers: {},
      queueLengths: { transcodegpu: 5 },
      workerLimits: { transcodecpu: 0, transcodegpu: 1, healthcheckcpu: 0, healthcheckgpu: 0 },
    },
    ephemeralId2: {
      nodeName: "BigBeastNode",
      nodePaused: true,
      workers: {
        w1: { file: "/cache/example.mkv", percentage: 42.5, fps: 120, ETA: "0:10:00", status: "processing" },
      },
      queueLengths: {},
      workerLimits: { transcodecpu: 2, transcodegpu: 2 },
    },
  };

  it("flags the NAS node only when its limits are violated", () => {
    const nodes = parseTdarrNodes(rawNodes);
    const nas = nodes.find((n) => n.nodeName === "NasTNode")!;
    const big = nodes.find((n) => n.nodeName === "BigBeastNode")!;
    expect(nodeLimitViolation(nas)).toBe(false);
    expect(nodeLimitViolation(big)).toBe(false); // rule is NAS-only
    expect(nodeLimitViolation({ ...nas, limits: { transcodeCpu: 1, transcodeGpu: 1 } })).toBe(true);
    expect(nodeLimitViolation({ ...nas, limits: { transcodeCpu: 0, transcodeGpu: 2 } })).toBe(true);
  });

  it("assembles nodes sorted by name and validates", () => {
    const snaps: SnapRow[] = [
      {
        service: "tdarr",
        kind: "nodes",
        payload: {
          nodes: parseTdarrNodes(rawNodes),
          stats: { totalFiles: 3135, totalTranscodes: 729, totalHealthChecks: 3482, sizeDiffGb: 1499.35, tdarrScore: 92, healthCheckScore: 99 },
        },
        polledAt: FRESH,
      },
    ];
    const out = buildTdarrPanel(snaps, {}, buildUptimeMap({}, ["tdarr"]), NOW);
    const parsed = tdarrPanelSchema.parse(out);
    expect(parsed.nodes.map((n) => n.nodeName)).toEqual(["BigBeastNode", "NasTNode"]);
    expect(parsed.nodes[1].limitViolation).toBe(false);
    expect(parsed.stats?.totalFiles).toBe(3135);
  });

  it("degrades pre-limits node snapshots without flagging", () => {
    const snaps: SnapRow[] = [
      {
        service: "tdarr",
        kind: "nodes",
        payload: {
          // Old snapshot shape — nodes without `limits`.
          nodes: [{ nodeName: "NasTNode", paused: false, workerCount: 0, workers: [], queue: { transcode: 0, healthcheck: 0 } }],
          stats: null,
        },
        polledAt: FRESH,
      },
    ];
    const out = buildTdarrPanel(snaps, {}, buildUptimeMap({}, ["tdarr"]), NOW);
    const parsed = tdarrPanelSchema.parse(out);
    expect(parsed.nodes[0].limits).toEqual({ transcodeCpu: 0, transcodeGpu: 0 });
    expect(parsed.nodes[0].limitViolation).toBe(false);
  });
});

describe("buildStorage", () => {
  it("assembles tiers, disks, smart, and arr root folders", () => {
    const snaps: SnapRow[] = [
      {
        service: "agent",
        kind: "stats",
        payload: {
          box: "nas", cpuBusy: 50, iowait: 1, load1: 5, memUsedPct: 25,
          swapUsedPct: 17, dstate: 0, netRxMbs: 1, netTxMbs: 2,
          bcacheHitPct: 57.6, failedUnits: 10, uptimeS: 1000,
          filesystems: [
            { path: "/volume1", usedPct: 35.4, totalBytes: 100, usedBytes: 35 },
            { path: "/volume2", usedPct: 2.6, totalBytes: 50, usedBytes: 1 },
          ],
          disks: [{ device: "bcache0", utilPct: 12.1, awaitMs: 8.3 }],
        },
        polledAt: FRESH,
      },
      {
        service: "agent",
        kind: "smart",
        payload: {
          drives: [{ device: "/dev/nvme0n1", healthy: true, temperatureC: 33, powerOnHours: 10133, model: "Example NVMe", sparePct: 100, mediaErrors: 0 }],
        },
        polledAt: FRESH,
      },
      {
        service: "sonarr",
        kind: "status",
        payload: {
          queue: { total: 0, downloading: 0, paused: 0, queued: 0, stalled: 0, importPending: 0, errored: 0 },
          health: { errors: 0, warnings: 0 },
          rootFolders: [{ path: "/data/media/tv", freeSpace: 123456789, accessible: true }],
        },
        polledAt: FRESH,
      },
    ];
    const out = buildStorage(snaps, {}, buildUptimeMap({}, ["agent"]), NOW);
    const parsed = storageSchema.parse(out);
    expect(parsed.tiers).toHaveLength(2);
    expect(parsed.tiers[0].label).toContain("Cold");
    expect(parsed.bcacheHitPct).toBe(57.6);
    expect(parsed.smart[0].healthy).toBe(true);
    expect(parsed.rootFolders).toEqual([
      { app: "sonarr", path: "/data/media/tv", freeSpace: 123456789, accessible: true },
    ]);
  });

  it("renders empty on no agent data", () => {
    const out = buildStorage([], {}, buildUptimeMap({}, ["agent"]), NOW);
    const parsed = storageSchema.parse(out);
    expect(parsed.tiers).toEqual([]);
    expect(parsed.bcacheHitPct).toBeNull();
  });
});
