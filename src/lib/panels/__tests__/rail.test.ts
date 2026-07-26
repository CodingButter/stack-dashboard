import { describe, expect, it } from "vitest";

import { buildRail, buildRecentStats, type SnapRow } from "@/lib/panels/assemble";
import { railSchema, recentStatsSchema } from "@/lib/panels/schemas";

const NOW = new Date("2026-07-26T12:00:00Z");
const NOW_S = Math.floor(NOW.getTime() / 1000);
const DAY = 24 * 60 * 60;

function tdarrSnap(nodes: unknown[]): SnapRow {
  return { service: "tdarr", kind: "nodes", payload: { nodes }, polledAt: NOW };
}

function plexSnap(payload: unknown): SnapRow {
  return { service: "plex", kind: "sessions", payload, polledAt: NOW };
}

function recentSnap(kind: string, addedAts: number[]): SnapRow {
  return {
    service: "plex-recent",
    kind,
    payload: { machineId: "m1", items: addedAts.map((addedAt, i) => ({ ratingKey: String(i), title: "t", addedAt })) },
    polledAt: NOW,
  };
}

describe("buildRail — ingestion", () => {
  it("counts only non-idle workers on non-paused nodes; paused node adds 0 processing AND 0 capacity", () => {
    const rail = buildRail([
      tdarrSnap([
        {
          nodeName: "BigBeast",
          paused: false,
          workers: [
            { status: "Execute" }, // processing
            { status: "idle" }, // NOT counted
          ],
          queue: { transcode: 5, healthcheck: 0 },
          limits: { transcodeCpu: 0, transcodeGpu: 3 },
        },
        {
          nodeName: "Paused",
          paused: true, // contributes nothing
          workers: [{ status: "Execute" }],
          queue: { transcode: 99, healthcheck: 0 },
          limits: { transcodeCpu: 8, transcodeGpu: 8 },
        },
      ]),
    ], NOW);

    expect(rail.ingestion.processing).toBe(1); // only the Execute worker on the live node
    expect(rail.ingestion.queued).toBe(5); // paused node's 99 excluded
    expect(rail.ingestion.totalCapacity).toBe(3); // paused node's slots excluded
    expect(rail.ingestion.idleCapacity).toBe(2); // max(0, 3 - 1)
    expect(() => railSchema.parse(rail)).not.toThrow();
  });

  it("clamps idleCapacity to 0 when processing exceeds capacity", () => {
    const rail = buildRail([
      tdarrSnap([
        {
          nodeName: "Over",
          paused: false,
          workers: [{ status: "Execute" }, { status: "Execute" }],
          queue: { transcode: 0, healthcheck: 0 },
          limits: { transcodeCpu: 0, transcodeGpu: 1 },
        },
      ]),
    ], NOW);
    expect(rail.ingestion.processing).toBe(2);
    expect(rail.ingestion.totalCapacity).toBe(1);
    expect(rail.ingestion.idleCapacity).toBe(0);
  });
});

describe("buildRail — streams", () => {
  it("derives live/transcodes/bandwidth from the plex sessions snapshot", () => {
    const rail = buildRail([
      plexSnap({ count: 3, directPlay: 2, transcode: 1, totalBitrateKbps: 42600 }),
    ], NOW);
    expect(rail.streams.live).toBe(3);
    expect(rail.streams.transcodes).toBe(1);
    expect(rail.streams.bandwidthMbps).toBe(42.6); // 42600/1000, 1 decimal
  });
});

describe("buildRail — missing snapshots", () => {
  it("returns zeros and never throws when neither Tdarr nor Plex data exists", () => {
    const rail = buildRail([], NOW);
    expect(rail.ingestion).toEqual({ processing: 0, queued: 0, idleCapacity: 0, totalCapacity: 0 });
    expect(rail.streams).toEqual({ live: 0, transcodes: 0, bandwidthMbps: 0 });
    expect(() => railSchema.parse(rail)).not.toThrow();
  });
});

describe("buildRecentStats — counts", () => {
  it("buckets the four snapshot rows into per-card counts", () => {
    const stats = buildRecentStats([
      recentSnap("recent-movies", [NOW_S - DAY, NOW_S - 2 * DAY]),
      recentSnap("recent-tv", [NOW_S - DAY]),
      recentSnap("recent-anime-movies", [NOW_S - DAY]),
      recentSnap("recent-anime-tv", [NOW_S - DAY, NOW_S - DAY]),
    ], NOW);
    expect(stats.newMovies.count).toBe(2);
    expect(stats.newShows.count).toBe(1);
    expect(stats.animeAdded.count).toBe(3); // 1 anime-movie + 2 anime-tv
    expect(stats.recentItems.count).toBe(6); // all four rows
    expect(() => recentStatsSchema.parse(stats)).not.toThrow();
  });

  it("returns zeros without throwing when rows are missing", () => {
    const stats = buildRecentStats([], NOW);
    expect(stats.newMovies).toEqual({ count: 0, trendPct: null });
    expect(stats.recentItems).toEqual({ count: 0, trendPct: null });
  });
});

describe("buildRecentStats — conditional trend (never Infinity/NaN)", () => {
  it("hides the trend (null) when the prior window is empty", () => {
    // all in current window, prior window empty → would be +Infinity
    const stats = buildRecentStats([
      recentSnap("recent-movies", [NOW_S - DAY, NOW_S - 2 * DAY, NOW_S - 3 * DAY]),
    ], NOW);
    expect(stats.newMovies.count).toBe(3);
    expect(stats.newMovies.trendPct).toBeNull();
  });

  it("hides the trend when the current window is saturated at the section cap", () => {
    // 15 items all in the current window → saturated
    const current = Array.from({ length: 15 }, (_, i) => NOW_S - (i + 1) * 3600);
    const prior = [NOW_S - 8 * DAY]; // a real prior item exists
    const stats = buildRecentStats([
      recentSnap("recent-movies", [...current, ...prior]),
    ], NOW);
    expect(stats.newMovies.trendPct).toBeNull();
  });

  it("hides the trend when total counts are too small to be meaningful", () => {
    const stats = buildRecentStats([
      recentSnap("recent-movies", [NOW_S - 8 * DAY]), // 1 prior, 0 current
    ], NOW);
    expect(stats.newMovies.trendPct).toBeNull();
  });

  it("shows a finite trend for a clean current>prior>0 non-saturated case", () => {
    // current window: 4 items; prior window: 2 items → +100%
    const current = [NOW_S - DAY, NOW_S - 2 * DAY, NOW_S - 3 * DAY, NOW_S - 4 * DAY];
    const prior = [NOW_S - 8 * DAY, NOW_S - 9 * DAY];
    const stats = buildRecentStats([
      recentSnap("recent-movies", [...current, ...prior]),
    ], NOW);
    expect(stats.newMovies.trendPct).toBe(100);
    expect(Number.isFinite(stats.newMovies.trendPct as number)).toBe(true);
  });
});
