import { beforeEach, describe, expect, it, vi } from "vitest";

import { railSchema } from "@/lib/panels/schemas";

// Mock the session + query boundaries so the route runs without a DB.
const getSession = vi.fn();
const latestSnapshots = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => getSession(),
}));
vi.mock("@/lib/panels/queries", () => ({
  latestSnapshots: () => latestSnapshots(),
}));

const { GET } = await import("../rail/route");

describe("/api/panels/rail GET", () => {
  beforeEach(() => {
    getSession.mockReset();
    latestSnapshots.mockReset();
  });

  it("401s when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(latestSnapshots).not.toHaveBeenCalled();
  });

  it("returns a railSchema-valid body when authenticated", async () => {
    getSession.mockResolvedValue({ user: { id: "usr_1", role: "admin" } });
    latestSnapshots.mockResolvedValue([
      {
        service: "tdarr",
        kind: "nodes",
        payload: {
          nodes: [
            {
              nodeName: "BigBeast",
              paused: false,
              workers: [{ status: "Execute" }, { status: "idle" }],
              queue: { transcode: 4, healthcheck: 0 },
              limits: { transcodeCpu: 0, transcodeGpu: 2 },
            },
          ],
        },
        polledAt: new Date(),
      },
      {
        service: "plex",
        kind: "sessions",
        payload: { count: 2, directPlay: 1, transcode: 1, totalBitrateKbps: 12000 },
        polledAt: new Date(),
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => railSchema.parse(body)).not.toThrow();
    expect(body.ingestion.processing).toBe(1); // idle worker excluded
    expect(body.ingestion.queued).toBe(4);
    expect(body.ingestion.idleCapacity).toBe(1); // 2 - 1
    expect(body.streams.live).toBe(2);
    expect(body.streams.bandwidthMbps).toBe(12);
  });
});
