// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DonutGauge } from "@/components/widgets/donut-gauge";
import { IOWAIT_WARN_PCT, serviceToPill } from "../overview-panel";

afterEach(cleanup);

describe("tier gauge valve markers", () => {
  it("renders both 80 and 90 threshold ticks", () => {
    const { container } = render(
      <DonutGauge value={35} thresholds={[{ at: 80 }, { at: 90 }]} />,
    );
    expect(container.querySelector('[data-threshold="80"]')).not.toBeNull();
    expect(container.querySelector('[data-threshold="90"]')).not.toBeNull();
  });

  it("is ok below the valve, warn at 80+, danger at 90+", () => {
    const zones = [35, 83, 94].map((v) => {
      const { container } = render(
        <DonutGauge value={v} thresholds={[{ at: 80 }, { at: 90 }]} />,
      );
      return container.querySelector("[data-zone]")?.getAttribute("data-zone");
    });
    expect(zones).toEqual(["ok", "warn", "danger"]);
  });
});

describe("iowait warning threshold", () => {
  it("warns above 20% — the NAS incident canary", () => {
    expect(IOWAIT_WARN_PCT).toBe(20);
    expect(21 > IOWAIT_WARN_PCT).toBe(true);
    expect(19 > IOWAIT_WARN_PCT).toBe(false);
  });
});

describe("serviceToPill", () => {
  const base = { service: "plex", error: null, polledAt: "2026-07-24T12:00:00Z" };

  it("maps ok → up", () => {
    expect(serviceToPill({ ...base, ok: true, latencyMs: 100 })).toBe("up");
  });

  it("maps slow (>2s) → degraded", () => {
    expect(serviceToPill({ ...base, ok: true, latencyMs: 2500 })).toBe("degraded");
  });

  it("maps failed → down", () => {
    expect(serviceToPill({ ...base, ok: false, latencyMs: null })).toBe("down");
  });
});

describe("DonutGauge sublabel capacity", () => {
  it("shows the used/total sublabel", () => {
    render(
      <DonutGauge
        value={35.4}
        sublabel="7.7 TB / 21.7 TB"
        thresholds={[{ at: 80 }, { at: 90 }]}
      />,
    );
    expect(screen.getByText("7.7 TB / 21.7 TB")).toBeDefined();
  });
});
