// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/app/login/actions", () => ({ logout: vi.fn() }));
// The rail's own data hook is not under test here; stub the child so this test
// stays a pure layout-contract check.
vi.mock("@/components/rail/dashboard-rail", () => ({
  DashboardRail: () => <div data-testid="rail-content" />,
}));

import { AppShell } from "../app-shell";

afterEach(cleanup);

describe("AppShell layout contract", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // AppShell children (account menu, alert count, action catalog) fetch on
    // mount; keep them pending so nothing throws.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });

  it("keeps <main> full-width (flex-1) and hides the rail below xl", () => {
    const { container } = render(
      <AppShell title="Test">
        <p>content</p>
      </AppShell>,
    );

    const main = container.querySelector("main");
    expect(main).toBeTruthy();
    expect(main?.className).toContain("flex-1");

    const rail = container.querySelector("#dashboard-rail");
    expect(rail).toBeTruthy();
    // The all-pages layout contract: the rail is an xl-only overlay.
    expect(rail?.className).toContain("hidden");
    expect(rail?.className).toContain("xl:block");
    // Overlay, not a flex sibling that reflows content.
    expect(rail?.className).toContain("absolute");
    // The base carries pointer-events-none so a closed rail never steals
    // clicks from the main content; the inner content re-enables when open.
    expect(rail?.className).toContain("pointer-events-none");
  });
});
