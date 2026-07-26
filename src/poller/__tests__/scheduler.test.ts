import { describe, expect, it } from "vitest";

import {
  BREAKER_BACKOFF_MS,
  BREAKER_THRESHOLD,
  POLL_INTERVALS_MS,
  effectiveInterval,
  initBreaker,
  intervalFor,
  isDue,
  recordResult,
  startJitter,
} from "../scheduler";

describe("poll interval tiers", () => {
  it("matches the stated tiers", () => {
    expect(POLL_INTERVALS_MS.agent).toBe(10_000);
    expect(POLL_INTERVALS_MS.plex).toBe(15_000);
    expect(POLL_INTERVALS_MS.tautulli).toBe(15_000);
    expect(POLL_INTERVALS_MS.sabnzbd).toBe(5_000);
    expect(POLL_INTERVALS_MS.qbittorrent).toBe(5_000);
    expect(POLL_INTERVALS_MS.tdarr).toBe(10_000);
    expect(POLL_INTERVALS_MS.sonarr).toBe(30_000);
    expect(POLL_INTERVALS_MS.radarr).toBe(30_000);
    expect(POLL_INTERVALS_MS["sonarr:library"]).toBe(300_000);
    expect(POLL_INTERVALS_MS.prowlarr).toBe(300_000);
    expect(POLL_INTERVALS_MS.smart).toBe(1_800_000);
  });

  it("falls back to the default for unknown services", () => {
    expect(intervalFor("mystery")).toBe(30_000);
  });
});

describe("circuit breaker", () => {
  it("stays healthy on success", () => {
    let s = initBreaker();
    s = recordResult(s, true, 1000);
    expect(s.tripped).toBe(false);
    expect(s.consecutiveFailures).toBe(0);
  });

  it("trips after the threshold of consecutive failures", () => {
    let s = initBreaker();
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) {
      s = recordResult(s, false, i);
      expect(s.tripped).toBe(false);
    }
    s = recordResult(s, false, 99);
    expect(s.tripped).toBe(true);
    expect(s.consecutiveFailures).toBe(BREAKER_THRESHOLD);
  });

  it("resets on a single success after failures", () => {
    let s = initBreaker();
    s = recordResult(s, false, 1);
    s = recordResult(s, false, 2);
    s = recordResult(s, false, 3);
    expect(s.tripped).toBe(true);
    s = recordResult(s, true, 4);
    expect(s.tripped).toBe(false);
    expect(s.consecutiveFailures).toBe(0);
  });

  it("backs off (never shortens) while tripped", () => {
    const healthy = { consecutiveFailures: 0, tripped: false, lastAttempt: 0 };
    const tripped = { consecutiveFailures: 3, tripped: true, lastAttempt: 0 };
    // A fast tier (agent, 10s) must slow to the 60s backoff when tripped.
    expect(effectiveInterval("agent", healthy)).toBe(10_000);
    expect(effectiveInterval("agent", tripped)).toBe(BREAKER_BACKOFF_MS);
    // A slow tier already above backoff keeps its own (longer) interval.
    expect(effectiveInterval("smart", tripped)).toBe(1_800_000);
  });
});

describe("isDue", () => {
  it("is due immediately when never polled", () => {
    expect(isDue("plex", initBreaker(), 5000)).toBe(true);
  });

  it("waits for the tier interval when healthy", () => {
    const s = { consecutiveFailures: 0, tripped: false, lastAttempt: 1000 };
    expect(isDue("plex", s, 1000 + 14_999)).toBe(false);
    expect(isDue("plex", s, 1000 + 15_000)).toBe(true);
  });

  it("waits for the backoff interval when tripped", () => {
    const s = { consecutiveFailures: 3, tripped: true, lastAttempt: 1000 };
    expect(isDue("plex", s, 1000 + 30_000)).toBe(false);
    expect(isDue("plex", s, 1000 + BREAKER_BACKOFF_MS)).toBe(true);
  });
});

describe("startJitter", () => {
  it("is deterministic and bounded", () => {
    const a = startJitter("plex");
    const b = startJitter("plex");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(5000);
  });
});
