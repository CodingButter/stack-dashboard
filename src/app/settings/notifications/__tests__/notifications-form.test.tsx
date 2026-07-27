import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationsForm } from "../notifications-form";

const VAPID = "BJ63M8Wi79VJ2vKq4t8Rv9Jte0Fx3ryg0Sw12TGYjF051TUWdY7peFFaDXTFUKyaTV6e-3fUi7tM21uxCTF06vs";

function mockFetchPrefs(prefs: Record<string, boolean>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/notifications/preferences" && (!init || init.method !== "POST")) {
      return { ok: true, json: async () => ({ preferences: prefs }) } as Response;
    }
    return { ok: true, json: async () => ({ success: true }) } as Response;
  });
}

describe("NotificationsForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetchPrefs({ new_movies: true, plex_down: false }));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders a toggle for each event type", async () => {
    render(<NotificationsForm vapidPublicKey={VAPID} />);
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "New Movies" })).toBeTruthy(),
    );
    expect(screen.getByRole("checkbox", { name: "Plex Down / Restore" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Tdarr Node Failure" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "SMART Health" })).toBeTruthy();
  });

  it("reflects stored preference state", async () => {
    render(<NotificationsForm vapidPublicKey={VAPID} />);
    const plex = (await screen.findByRole("checkbox", {
      name: "Plex Down / Restore",
    })) as HTMLInputElement;
    expect(plex.checked).toBe(false);
    const movies = screen.getByRole("checkbox", { name: "New Movies" }) as HTMLInputElement;
    expect(movies.checked).toBe(true);
  });

  it("POSTs updated preferences when a toggle is flipped", async () => {
    const fetchMock = mockFetchPrefs({ new_movies: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<NotificationsForm vapidPublicKey={VAPID} />);
    const movies = (await screen.findByRole("checkbox", {
      name: "New Movies",
    })) as HTMLInputElement;
    fireEvent.click(movies);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notifications/preferences",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("test button calls the test endpoint", async () => {
    const fetchMock = mockFetchPrefs({ new_movies: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<NotificationsForm vapidPublicKey={VAPID} />);
    await screen.findByRole("checkbox", { name: "New Movies" });
    fireEvent.click(screen.getByText("Send test notification"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notifications/test",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});
