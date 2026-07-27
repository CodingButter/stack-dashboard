// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/login/actions", () => ({ logout: vi.fn() }));

import { AccountMenu } from "../account-menu";

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
