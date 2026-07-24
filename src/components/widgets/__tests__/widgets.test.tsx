import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DonutGauge } from "@/components/widgets/donut-gauge";
import { KpiCard } from "@/components/widgets/kpi-card";
import { PanelCard } from "@/components/widgets/panel-card";
import { StatusPill } from "@/components/widgets/status-pill";
import { TrackerStrip, type TrackerCell } from "@/components/widgets/tracker-strip";

describe("KpiCard", () => {
  it("renders label, value, unit and delta", () => {
    render(
      <KpiCard label="Download speed" value="84.2" unit="MB/s" delta="+12%" deltaDirection="up" />,
    );
    expect(screen.getByText("Download speed")).toBeDefined();
    expect(screen.getByText("84.2")).toBeDefined();
    expect(screen.getByText("MB/s")).toBeDefined();
    const delta = screen.getByText("+12%");
    expect(delta.getAttribute("data-direction")).toBe("up");
  });
});

describe("StatusPill", () => {
  it("renders status label and data attribute", () => {
    render(<StatusPill status="degraded" label="Prowlarr" />);
    const pill = screen.getByText("Prowlarr");
    expect(pill.getAttribute("data-status")).toBe("degraded");
  });

  it("falls back to the status name when no label given", () => {
    render(<StatusPill status="down" />);
    expect(screen.getByText("Down")).toBeDefined();
  });
});

describe("TrackerStrip", () => {
  it("renders one cell per datum and the uptime percentage", () => {
    const data: TrackerCell[] = [
      { state: "up" },
      { state: "up" },
      { state: "down" },
      { state: "degraded" },
    ];
    const { container } = render(<TrackerStrip label="Plex" data={data} />);
    expect(container.querySelectorAll("[data-state]").length).toBe(4);
    // 2 of 4 up → 50%
    expect(screen.getByText("50%")).toBeDefined();
  });
});

describe("DonutGauge", () => {
  it("stays in the ok zone below all thresholds", () => {
    const { container } = render(
      <DonutGauge value={64} thresholds={[{ at: 80 }, { at: 90 }]} />,
    );
    expect(container.querySelector("[data-zone]")?.getAttribute("data-zone")).toBe("ok");
  });

  it("switches to the warning zone when crossing 80%", () => {
    const { container } = render(
      <DonutGauge value={83} thresholds={[{ at: 80 }, { at: 90 }]} />,
    );
    expect(container.querySelector("[data-zone]")?.getAttribute("data-zone")).toBe("warn");
    // Both threshold tick marks render
    expect(container.querySelectorAll("[data-threshold]").length).toBe(2);
  });

  it("switches to the danger zone when crossing the last threshold", () => {
    const { container } = render(
      <DonutGauge value={94} thresholds={[{ at: 80 }, { at: 90 }]} />,
    );
    expect(container.querySelector("[data-zone]")?.getAttribute("data-zone")).toBe("danger");
  });

  it("clamps the displayed value to 0-100", () => {
    render(<DonutGauge value={140} />);
    expect(screen.getByText("100%")).toBeDefined();
  });
});

describe("PanelCard", () => {
  it("renders title and children", () => {
    render(
      <PanelCard title="Storage tiers" subsystem="storage">
        <span>gauge here</span>
      </PanelCard>,
    );
    expect(screen.getByText("Storage tiers")).toBeDefined();
    expect(screen.getByText("gauge here")).toBeDefined();
  });
});
