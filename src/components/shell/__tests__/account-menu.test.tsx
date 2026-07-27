// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/login/actions", () => ({ logout: vi.fn() }));

import { AccountMenu, AccountAvatarMenu } from "../account-menu";

afterEach(cleanup);

describe("AccountMenu", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a neutral 'Account' label before /api/me resolves", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // never resolves
    render(<AccountMenu />);
    expect(screen.getByRole("button", { name: /account menu/i })).toBeTruthy();
    expect(screen.getByText("Account")).toBeTruthy();
  });

  it("renders the username after /api/me resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ user: { id: "usr_1", username: "cookie", role: "admin" } }),
      })),
    );
    render(<AccountMenu />);
    await waitFor(() => expect(screen.getByText("cookie")).toBeTruthy());
  });

  it("stays anonymous when /api/me returns 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 })));
    render(<AccountMenu />);
    await waitFor(() => expect(screen.getByText("Account")).toBeTruthy());
  });
});

describe("AccountAvatarMenu (topbar / mobile entry point)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders an account-menu button (reachable on all viewports)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // never resolves
    render(<AccountAvatarMenu />);
    expect(screen.getByRole("button", { name: /account menu/i })).toBeTruthy();
  });

  it("opens the same Account / Notifications / Logout options and shows the username", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ user: { id: "usr_1", username: "cookie", role: "admin" } }),
      })),
    );
    render(<AccountAvatarMenu />);
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));
    await waitFor(() => expect(screen.getByText(/signed in as/i)).toBeTruthy());
    expect(screen.getByRole("link", { name: /account/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /notifications/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /logout/i })).toBeTruthy();
  });
});
