import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DonutGauge } from "@/components/widgets/donut-gauge";
import { InfoDot } from "@/components/widgets/info-dot";
import { KpiCard } from "@/components/widgets/kpi-card";
import { PanelCard } from "@/components/widgets/panel-card";
import { StatusPill } from "@/components/widgets/status-pill";
import { TrackerStrip, type TrackerCell } from "@/components/widgets/tracker-strip";
import { GLOSSARY } from "@/lib/glossary";
import { ProgressBar } from '@/components/widgets/progress-bar';

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

describe("InfoDot", () => {
  it("renders a trigger labelled from the glossary entry", () => {
    render(<InfoDot term="queue-depth" />);
    const trigger = screen.getByRole("button", { name: `What is ${GLOSSARY["queue-depth"].title}?` });
    expect(trigger).toBeDefined();
  });

  it("prefers inline copy over the glossary lookup", () => {
    render(<InfoDot title="Custom" body="Custom body" />);
    expect(screen.getByRole("button", { name: "What is Custom?" })).toBeDefined();
  });

  it("renders nothing when there is no text to show", () => {
    const { container } = render(<InfoDot />);
    expect(container.querySelector("button")).toBeNull();
  });
});

describe("ProgressBar", () => {
  afterEach(cleanup);

  it("clamps the fill width to 0–100", () => {
    const { rerender, getByTestId } = render(<ProgressBar value={150} />);
    expect(getByTestId("progress-fill").style.width).toBe("100%");
    rerender(<ProgressBar value={-20} />);
    expect(getByTestId("progress-fill").style.width).toBe("0%");
  });

  it("eases forward motion but snaps a backward reset", () => {
    const { rerender, getByTestId } = render(<ProgressBar value={20} />);
    // Growing forward → transition on.
    rerender(<ProgressBar value={60} />);
    expect(getByTestId("progress-fill").getAttribute("data-eased")).toBe("true");
    // A reset/scrub-back must snap, not drain.
    rerender(<ProgressBar value={0} />);
    expect(getByTestId("progress-fill").getAttribute("data-eased")).toBe("false");
  });
});

describe("glossary integrity", () => {
  it("every entry has a non-empty title and body", () => {
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      expect(entry.title, `${key} title`).toBeTruthy();
      expect(entry.body, `${key} body`).toBeTruthy();
    }
  });
});
