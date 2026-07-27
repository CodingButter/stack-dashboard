// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IngestionDonut, type DonutSegment } from "../ingestion-donut";
import { StreamsOverview } from "../streams-overview";
import { DashboardRail } from "../dashboard-rail";

afterEach(cleanup);

describe("IngestionDonut", () => {
  const segments: DonutSegment[] = [
    { key: "processing", label: "Processing", value: 2, strokeClass: "stroke-accent-tdarr", dotClass: "bg-accent-tdarr" },
    { key: "queued", label: "Queued", value: 5, strokeClass: "stroke-status-degraded", dotClass: "bg-status-degraded" },
    { key: "idle", label: "Idle capacity", value: 3, strokeClass: "stroke-muted-foreground/40", dotClass: "bg-muted-foreground/40" },
  ];

  it("renders three arc paths and a legend summing correctly", () => {
    const { container } = render(<IngestionDonut segments={segments} />);
    const arcs = container.querySelectorAll("circle[data-segment]");
    expect(arcs.length).toBe(3);
    const legend = container.querySelectorAll("li[data-legend]");
    expect(legend.length).toBe(3);
    expect(screen.getByText("Processing")).toBeTruthy();
    expect(screen.getByText("Queued")).toBeTruthy();
    expect(screen.getByText("Idle capacity")).toBeTruthy();
  });

  it("computes the busy percentage as the non-idle share of capacity", () => {
    // total 10, idle 3 → busy 7/10 = 70%
    render(<IngestionDonut segments={segments} />);
    expect(screen.getByText("70%")).toBeTruthy();
  });

  it("renders no arcs but a full legend and 0% when everything is zero", () => {
    const zero = segments.map((s) => ({ ...s, value: 0 }));
    const { container } = render(<IngestionDonut segments={zero} />);
    expect(container.querySelectorAll("circle[data-segment]").length).toBe(0);
    expect(container.querySelectorAll("li[data-legend]").length).toBe(3);
    expect(screen.getByText("0%")).toBeTruthy();
  });
});

describe("StreamsOverview", () => {
  it("renders live / transcodes / bandwidth values", () => {
    render(<StreamsOverview live={3} transcodes={1} bandwidthMbps={42.6} />);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("42.6")).toBeTruthy();
    expect(screen.getByText("Mbps")).toBeTruthy();
  });
});

describe("DashboardRail", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("fetches /api/panels/rail and renders both widgets with live values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          generatedAt: new Date().toISOString(),
          ingestion: { processing: 2, queued: 5, idleCapacity: 3, totalCapacity: 5 },
          streams: { live: 3, transcodes: 1, bandwidthMbps: 42.6 },
        }),
      })),
    );

    const { container } = render(<DashboardRail />);
    await waitFor(() => {
      // three donut arcs appear once data resolves
      expect(container.querySelectorAll("circle[data-segment]").length).toBe(3);
    });
    expect(screen.getByText("Processing")).toBeTruthy();
    expect(screen.getByText("Streams")).toBeTruthy();
    expect(screen.getByText("42.6")).toBeTruthy();
    expect(screen.getByText("70%")).toBeTruthy(); // busy share
  });
});
