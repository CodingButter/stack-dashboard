import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const getUserPreferences = vi.fn();
const setUserPreferences = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/notifications/db", () => ({
  getUserPreferences: (...a: unknown[]) => getUserPreferences(...a),
  setUserPreferences: (...a: unknown[]) => setUserPreferences(...a),
}));

const { GET, POST } = await import("../preferences/route");

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/notifications/preferences", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/notifications/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: "usr_1" } });
  });

  it("GET 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("GET returns preferences", async () => {
    getUserPreferences.mockResolvedValue({ new_movies: true, plex_down: false });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ preferences: { new_movies: true, plex_down: false } });
    expect(getUserPreferences).toHaveBeenCalledWith("usr_1");
  });

  it("POST 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(postReq({ preferences: { new_movies: false } }));
    expect(res.status).toBe(401);
    expect(setUserPreferences).not.toHaveBeenCalled();
  });

  it("POST 400 on invalid body", async () => {
    const res = await POST(postReq({ preferences: { new_movies: "yes" } }));
    expect(res.status).toBe(400);
  });

  it("POST updates preferences", async () => {
    const res = await POST(postReq({ preferences: { new_movies: false, plex_down: true } }));
    expect(res.status).toBe(200);
    expect(setUserPreferences).toHaveBeenCalledWith("usr_1", {
      new_movies: false,
      plex_down: true,
    });
  });
});
