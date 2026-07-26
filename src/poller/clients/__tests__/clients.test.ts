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
import { parseAgentStats } from "../agent";

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
