import { describe, expect, it } from "vitest";

import { mergeDownloads } from "../downloads-merge";
import type { Downloads } from "../schemas";
import type { TelemetryDownloads } from "@/server/telemetry-listener";

const http: Downloads = {
  generatedAt: "2026-07-26T06:00:00Z",
  uptime: {},
  sab: {
    paused: false,
    status: "Idle",
    speedBps: 0,
    mbLeft: 5000,
    queueSize: 2,
    timeLeft: "9:99:99",
    speedLimitPct: 100,
    diskFreeGb: 800,
    jobs: [
      { name: "Alpha", percent: 10, mbLeft: 900, timeLeft: "1:00:00", status: "Queued" },
      { name: "Beta", percent: 0, mbLeft: 4100, timeLeft: "2:00:00", status: "Queued" },
    ],
    totals: null,
  },
  qbit: {
    total: 100,
    downloading: 2,
    seeding: 90,
    stalled: 3,
    errored: 0,
    seedboost: 5,
    dlSpeed: 0,
    upSpeed: 0,
    byCategory: { tv: 40, movies: 60 },
  },
  series: { sabSpeedBps: [], qbitDlSpeed: [], qbitUpSpeed: [] },
};

const live: TelemetryDownloads = {
  sab: {
    status: "Downloading",
    speedBps: 42_000_000,
    mbLeft: 8000,
    eta: "1:42:11",
    count: 3,
    paused: false,
    items: [
      { name: "Alpha", pct: 63.2, mbLeft: 331, eta: "0:04:33", status: "Downloading" },
    ],
  },
  qbit: {
    dlBps: 27_000_000,
    upBps: 3_100_000,
    connection: "connected",
    count: 2,
    items: [],
  },
};

describe("mergeDownloads", () => {
  it("returns HTTP untouched when the feed is offline", () => {
    expect(mergeDownloads(false, live, http)).toBe(http);
  });

  it("returns HTTP untouched when there is no live block", () => {
    expect(mergeDownloads(true, null, http)).toBe(http);
  });

  it("passes null HTTP through", () => {
    expect(mergeDownloads(true, live, null)).toBeNull();
  });

  it("overlays live SAB speed/queue and per-item progress by name", () => {
    const m = mergeDownloads(true, live, http)!;
    expect(m.sab?.speedBps).toBe(42_000_000);
    expect(m.sab?.status).toBe("Downloading");
    expect(m.sab?.queueSize).toBe(3);
    // Matched job gets live progress; unmatched job keeps HTTP values.
    expect(m.sab?.jobs.find((j) => j.name === "Alpha")?.percent).toBe(63.2);
    expect(m.sab?.jobs.find((j) => j.name === "Beta")?.percent).toBe(0);
  });

  it("overlays live qBit speeds but preserves HTTP counts/categories", () => {
    const m = mergeDownloads(true, live, http)!;
    expect(m.qbit?.dlSpeed).toBe(27_000_000);
    expect(m.qbit?.upSpeed).toBe(3_100_000);
    expect(m.qbit?.seeding).toBe(90); // HTTP-only field survives
    expect(m.qbit?.byCategory).toEqual({ tv: 40, movies: 60 });
  });

  it("leaves a client's HTTP data in place when its live sub-block is null", () => {
    const m = mergeDownloads(true, { sab: null, qbit: live.qbit }, http)!;
    expect(m.sab?.status).toBe("Idle"); // HTTP retained
    expect(m.qbit?.dlSpeed).toBe(27_000_000); // qbit still overlaid
  });
});
