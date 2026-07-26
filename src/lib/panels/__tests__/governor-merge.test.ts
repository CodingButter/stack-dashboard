import { describe, expect, it } from "vitest";

import { mergeGovernor, type PanelGovernor } from "../governor-merge";
import type { GovernorStatus } from "@/poller/clients/agent";

const liveGov: GovernorStatus = {
  running: true,
  ts: 1000,
  pollSecs: 20,
  mode: "governing",
  frozen: false,
  activeStreams: 1,
  streamKbps: 4000,
  sabLimitMbps: 50,
  laneMaxSecs: 900,
  laneHolder: "ZenBeastNode",
  heavyNodes: [],
  governorPausedNodes: [],
  nodes: [],
};

const httpGov: PanelGovernor = {
  ...liveGov,
  ts: 500,
  laneHolder: "BigBeastNode",
  ageSecs: 42,
};

describe("mergeGovernor", () => {
  it("prefers the live governor when the feed is connected", () => {
    // now = 1005s → ageSecs = 1005 - 1000 = 5
    const g = mergeGovernor(true, liveGov, httpGov, 1005 * 1000);
    expect(g?.laneHolder).toBe("ZenBeastNode");
    expect(g?.ageSecs).toBe(5);
  });

  it("falls back to the HTTP governor when the feed is offline", () => {
    const g = mergeGovernor(false, liveGov, httpGov);
    expect(g?.laneHolder).toBe("BigBeastNode");
    expect(g?.ageSecs).toBe(42);
  });

  it("falls back to HTTP when live is true but no live payload yet", () => {
    const g = mergeGovernor(true, null, httpGov);
    expect(g).toBe(httpGov);
  });

  it("returns null ageSecs when the live governor has no ts", () => {
    const g = mergeGovernor(true, { ...liveGov, ts: null }, httpGov, 2000 * 1000);
    expect(g?.ageSecs).toBeNull();
  });

  it("returns null when neither source has data", () => {
    expect(mergeGovernor(false, null, null)).toBeNull();
  });
});
