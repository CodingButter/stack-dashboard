import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseArrQueue, parseArrHealth, parseArrRootFolders } from "../arr";
import { parseProwlarr } from "../prowlarr";
import { parseSabQueue, parseSabTotals } from "../sabnzbd";
import { parseTautulliActivity, unwrapTautulli } from "../tautulli";
import { parsePlexSessions } from "../plex";
import { parseSeerrRequests } from "../seerr";
import { parseTdarrNodes, parseTdarrStats } from "../tdarr";
import { parseQbitTorrents } from "../qbittorrent";
import { parseAgentStats, parseAgentGpu, parseAgentGovernor } from "../agent";

const FIX = join(__dirname, "..", "__fixtures__");
const load = (name: string): unknown =>
  JSON.parse(readFileSync(join(FIX, name), "utf8"));

describe("arr client (sonarr/radarr)", () => {
  it("parses an empty queue to a zeroed summary with the reported total", () => {
    const q = parseArrQueue(load("sonarr_queue.json"));
    expect(q.total).toBe(0);
    expect(q.errored).toBe(0);
  });

  it("parses health array into error/warning counts", () => {
    expect(parseArrHealth(load("sonarr_health.json"))).toEqual({
      errors: 0,
      warnings: 0,
    });
  });

  it("parses root folders with free space per tier", () => {
    const folders = parseArrRootFolders(load("sonarr_rootfolder.json"));
    expect(folders.length).toBeGreaterThan(0);
    expect(folders[0].freeSpace).toBeGreaterThan(0);
    expect(folders[0].path).toContain("/data");
  });

  it("counts queue states when records are present", () => {
    const q = parseArrQueue({
      records: [
        { status: "downloading" },
        { status: "paused" },
        { trackedDownloadStatus: "error", errorMessage: "boom" },
        { trackedDownloadStatus: "warning", trackedDownloadState: "stalledDL" },
      ],
    });
    expect(q.total).toBe(4);
    expect(q.downloading).toBe(1);
    expect(q.paused).toBe(1);
    expect(q.errored).toBe(1);
    expect(q.stalled).toBe(1);
  });
});

describe("prowlarr client", () => {
  it("counts total + enabled indexers and surfaces rate-limit state", () => {
    const parsed = parseProwlarr(load("prowlarr_indexer.json"), load("prowlarr_status.json"));
    expect(parsed.total).toBeGreaterThan(0);
    expect(parsed.enabled).toBeLessThanOrEqual(parsed.total);
    expect(parsed.indexers.some((i) => i.name === "IPTorrents")).toBe(true);
    expect(Array.isArray(parsed.rateLimited)).toBe(true);
  });
});

describe("sabnzbd client", () => {
  it("parses queue state, speed, and disk free", () => {
    const q = parseSabQueue(load("sab_queue.json"));
    expect(q.paused).toBe(false);
    expect(q.status).toBe("Idle");
    expect(q.speedBps).toBe(0);
    expect(q.diskFreeGb).toBeGreaterThan(0);
  });

  it("parses lifetime totals", () => {
    const t = parseSabTotals(load("sab_stats.json"));
    expect(t.total).toBeGreaterThan(0);
    expect(t.day).toBeGreaterThanOrEqual(0);
  });
});

describe("tautulli client", () => {
  it("unwraps the envelope and parses activity", () => {
    const a = parseTautulliActivity(load("tautulli_activity.json"));
    expect("error" in a).toBe(false);
    if (!("error" in a)) {
      expect(a.streamCount).toBe(0);
      expect(a.transcode).toBe(0);
    }
  });

  it("reports a clean error when result !== success", () => {
    const r = unwrapTautulli({ response: { result: "error", message: "bad key" } });
    expect(r.error).toBe("bad key");
  });
});

describe("plex client", () => {
  it("parses zero-session container", () => {
    const s = parsePlexSessions(load("plex_sessions.json"));
    expect(s.count).toBe(0);
    expect(s.transcode).toBe(0);
  });

  it("splits direct-play vs transcode", () => {
    const s = parsePlexSessions({
      MediaContainer: {
        size: 2,
        Metadata: [{ TranscodeSession: {}, bitrate: 8000 }, { bitrate: 4000 }],
      },
    });
    expect(s.count).toBe(2);
    expect(s.transcode).toBe(1);
    expect(s.directPlay).toBe(1);
    expect(s.totalBitrateKbps).toBe(12000);
  });
});

describe("seerr client", () => {
  it("parses the request pipeline counts + grand total", () => {
    const c = parseSeerrRequests(load("seerr_request.json"));
    expect(c.total).toBe(403);
    expect(c.approved + c.available).toBeGreaterThan(0);
  });
});

describe("tdarr client (node-id footgun)", () => {
  it("keys nodes by nodeName, never the ephemeral _id", () => {
    const nodes = parseTdarrNodes(load("tdarr_nodes.json"));
    expect(nodes.length).toBe(4);
    const names = nodes.map((n) => n.nodeName).sort();
    expect(names).toContain("NasTNode");
    expect(names).toContain("BigBeastNode");
    // no field named _id survives into the normalized node
    for (const n of nodes) {
      expect(Object.keys(n)).not.toContain("_id");
      expect(n.workerCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("parses global stats", () => {
    const s = parseTdarrStats(load("tdarr_stats.json"));
    expect(s.totalFiles).toBeGreaterThan(0);
    expect(s.tdarrScore).toBeGreaterThan(0);
  });
});

describe("qbittorrent client", () => {
  it("categorizes torrents incl. seedboost and sums speeds", () => {
    const p = parseQbitTorrents([
      { state: "uploading", category: "seedboost", upspeed: 100, ratio: 2 },
      { state: "downloading", category: "tv-sonarr", dlspeed: 500 },
      { state: "error", category: "" },
      { state: "stalledDL", category: "movies-radarr" },
    ]);
    expect(p.total).toBe(4);
    expect(p.seedboost).toBe(1);
    expect(p.errored).toBe(1);
    expect(p.stalled).toBe(1);
    expect(p.dlSpeed).toBe(500);
    expect(p.upSpeed).toBe(100);
  });
});

describe("agent client", () => {
  it("normalizes /proc stats into box-scoped fields", () => {
    const s = parseAgentStats(load("agent_stats.json"), "nas");
    expect(s.box).toBe("nas");
    expect(s.iowait).toBeGreaterThanOrEqual(0);
    expect(s.filesystems.some((f) => f.path === "/volume1")).toBe(true);
    expect(s.disks.length).toBeGreaterThan(0);
  });

  it("parses an nvidia /gpu snapshot into scalar fields", () => {
    const g = parseAgentGpu({
      mode: "nvidia",
      util_pct: 42,
      encoder_pct: 88,
      decoder_pct: 0,
      vram_used_mb: 2048,
      vram_total_mb: 12288,
      temp_c: 61,
      power_w: 120.5,
    });
    expect(g?.utilPct).toBe(42);
    expect(g?.encoderPct).toBe(88);
    expect(g?.tempC).toBe(61);
    expect(g?.powerW).toBe(120.5);
  });

  it("returns null for non-nvidia / error / garbage gpu bodies", () => {
    expect(parseAgentGpu({ mode: "none" })).toBeNull();
    expect(parseAgentGpu({ mode: "nvidia", error: "nvidia-smi failed" })).toBeNull();
    expect(parseAgentGpu(null)).toBeNull();
    expect(parseAgentGpu("garbage")).toBeNull();
  });
});

describe("agent governor (tdarr-gate)", () => {
  const TS = 1_785_000_000; // unix seconds — the emitter's `ts`
  const nowFresh = TS * 1000 + 10_000; // 10s after emit — fresh
  const govStatus = (over: Record<string, unknown> = {}) => ({
    schema: 1,
    ts: TS,
    poll_secs: 20,
    mode: "governing",
    frozen: false,
    active_streams: 0,
    stream_kbps: 0,
    sab_limit_mbps: null,
    lane_max_secs: 600,
    lane_holder: "BigBeastNode",
    heavy_nodes: ["BigBeastNode"],
    governor_paused_nodes: ["DevBeastNode", "ZenBeastNode"],
    stream_paused_node_ids: [],
    nodes: [
      {
        name: "BigBeastNode",
        exempt: false,
        paused: false,
        paused_by_governor: false,
        heavy: true,
        writing: true,
        lane_held_secs: 42,
        worker_count: 1,
        worker_statuses: ["Transcode Replace"],
      },
      {
        name: "DevBeastNode",
        exempt: false,
        paused: true,
        paused_by_governor: true,
        heavy: false,
        writing: false,
        lane_held_secs: null,
        worker_count: 0,
        worker_statuses: [],
      },
    ],
    ...over,
  });

  it("normalizes a fresh governing snapshot into camelCase", () => {
    const g = parseAgentGovernor(govStatus(), nowFresh)!;
    expect(g.running).toBe(true);
    expect(g.mode).toBe("governing");
    expect(g.laneHolder).toBe("BigBeastNode");
    expect(g.governorPausedNodes).toEqual(["DevBeastNode", "ZenBeastNode"]);
    expect(g.nodes[0]).toMatchObject({
      name: "BigBeastNode",
      writing: true,
      laneHeldSecs: 42,
    });
    expect(g.nodes[1]).toMatchObject({
      pausedByGovernor: true,
      laneHeldSecs: null,
    });
    // v1 payloads (no schema:2 fields) default the new booleans to false.
    expect(g.nodes[0].activelyWorking).toBe(false);
    expect(g.nodes[0].replaceDeferred).toBe(false);
  });

  it("captures schema:2 per-node actively_working / replace_deferred flags", () => {
    const g = parseAgentGovernor(
      govStatus({
        schema: 2,
        lane_holder: "DevBeastNode",
        nodes: [
          {
            // lane holder: transcoding AND owns the write lane
            name: "DevBeastNode",
            exempt: false,
            paused: false,
            paused_by_governor: false,
            heavy: true,
            writing: true,
            actively_working: true,
            replace_deferred: false,
            lane_held_secs: 42,
            worker_count: 1,
            worker_statuses: ["Transcode Replace"],
          },
          {
            // transcoding now, write-back queued behind the holder — NOT stopped
            name: "ZenBeastNode",
            exempt: false,
            paused: true,
            paused_by_governor: true,
            heavy: false,
            writing: false,
            actively_working: true,
            replace_deferred: true,
            lane_held_secs: null,
            worker_count: 1,
            worker_statuses: ["Transcode Execute"],
          },
          {
            // genuinely held: paused by governor with no live worker
            name: "BigBeastNode",
            exempt: false,
            paused: true,
            paused_by_governor: true,
            heavy: false,
            writing: false,
            actively_working: false,
            replace_deferred: false,
            lane_held_secs: null,
            worker_count: 0,
            worker_statuses: [],
          },
        ],
      }),
      nowFresh,
    )!;
    const byName = Object.fromEntries(g.nodes.map((n) => [n.name, n]));
    expect(byName.ZenBeastNode).toMatchObject({
      replaceDeferred: true,
      activelyWorking: true,
    });
    expect(byName.BigBeastNode).toMatchObject({
      pausedByGovernor: true,
      replaceDeferred: false,
      activelyWorking: false,
    });
    // The lane holder must never read as replace-deferred.
    expect(byName.DevBeastNode.replaceDeferred).toBe(false);
  });

  it("defaults replaceProgress to null on pre-schema-3 payloads", () => {
    const g = parseAgentGovernor(govStatus(), nowFresh)!;
    expect(g.nodes[0].replaceProgress).toBeNull();
  });

  it("captures schema:3 per-node replace_progress (pct + mbps write-back)", () => {
    const g = parseAgentGovernor(
      govStatus({
        schema: 3,
        nodes: [
          {
            name: "ZenBeastNode",
            exempt: false,
            paused: false,
            paused_by_governor: false,
            heavy: false,
            writing: true,
            actively_working: true,
            replace_deferred: false,
            lane_held_secs: null,
            worker_count: 1,
            worker_statuses: ["Transcode Replace"],
            replace_progress: {
              pct: 61.3,
              mbps: 0.8,
              written_bytes: 123,
              final_bytes: 456,
            },
          },
          {
            name: "DevBeastNode",
            exempt: false,
            paused: false,
            paused_by_governor: false,
            heavy: false,
            writing: false,
            actively_working: false,
            replace_deferred: false,
            lane_held_secs: null,
            worker_count: 0,
            worker_statuses: [],
            replace_progress: null,
          },
        ],
      }),
      nowFresh,
    )!;
    const byName = Object.fromEntries(g.nodes.map((n) => [n.name, n]));
    expect(byName.ZenBeastNode.replaceProgress).toMatchObject({
      pct: 61.3,
      mbps: 0.8,
      writtenBytes: 123,
      finalBytes: 456,
    });
    // A non-writing node carries no write-back progress.
    expect(byName.DevBeastNode.replaceProgress).toBeNull();
  });

  it("treats a stale ts (> 3x poll_secs) as NOT RUNNING even without a flag", () => {
    // 61s > 3 * 20s window — the whole reason this feature exists.
    const nowStale = TS * 1000 + 61_000;
    const g = parseAgentGovernor(govStatus(), nowStale)!;
    expect(g.running).toBe(false);
    expect(g.ts).toBe(TS);
  });

  it("honors the agent's running:false / error signal", () => {
    expect(parseAgentGovernor({ running: false })!.running).toBe(false);
    expect(
      parseAgentGovernor({ error: "no governor status", running: false })!
        .running,
    ).toBe(false);
  });

  it("returns null for a body that is not a governor payload at all", () => {
    expect(parseAgentGovernor(null)).toBeNull();
    expect(parseAgentGovernor("garbage")).toBeNull();
    expect(parseAgentGovernor({ some: "other json" })).toBeNull();
  });
});

describe("error shapes degrade cleanly (no throw)", () => {
  it("arr queue tolerates an HTML error page shape", () => {
    expect(() => parseArrQueue("<html>502</html>")).not.toThrow();
    expect(parseArrQueue("<html>").total).toBe(0);
  });
  it("prowlarr tolerates a non-array body", () => {
    expect(() => parseProwlarr(null, null)).not.toThrow();
    expect(parseProwlarr(null, null).total).toBe(0);
  });
  it("sab tolerates a missing queue key", () => {
    expect(() => parseSabQueue({})).not.toThrow();
  });
  it("tdarr tolerates a non-object body", () => {
    expect(parseTdarrNodes("nope")).toEqual([]);
  });
  it("tautulli reports error on a garbage body", () => {
    expect("error" in parseTautulliActivity("garbage")).toBe(true);
  });
});
