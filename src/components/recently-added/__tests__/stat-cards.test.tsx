// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StatCards } from "../stat-cards";
import type { RecentStats } from "@/lib/panels/schemas";

afterEach(cleanup);

function stats(over: Partial<RecentStats> = {}): RecentStats {
  return {
    newMovies: { count: 24, trendPct: null },
    newShows: { count: 16, trendPct: null },
    animeAdded: { count: 8, trendPct: null },
    recentItems: { count: 48, trendPct: null },
    ...over,
  };
}

describe("StatCards", () => {
  it("renders the four cards with the honest labels and counts", () => {
    render(<StatCards stats={stats()} />);
    for (const label of ["New Movies", "New Shows", "Anime Added", "Recent Items"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("24")).toBeTruthy();
    expect(screen.getByText("16")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("48")).toBeTruthy();
  });

  it("shows a trend badge only when trendPct is non-null", () => {
    const { container } = render(
      <StatCards stats={stats({ newMovies: { count: 24, trendPct: 12 } })} />,
    );
    // one directional badge for the movies card
    const up = container.querySelector('[data-direction="up"]');
    expect(up?.textContent).toBe("+12%");
    // the three null-trend cards stay count-only (flat = no delta rendered)
    expect(container.querySelectorAll('[data-direction="up"]').length).toBe(1);
    expect(container.querySelectorAll('[data-direction="down"]').length).toBe(0);
  });

  it("renders a negative trend as a down badge", () => {
    const { container } = render(
      <StatCards stats={stats({ newShows: { count: 3, trendPct: -40 } })} />,
    );
    const down = container.querySelector('[data-direction="down"]');
    expect(down?.textContent).toBe("-40%");
  });
});
