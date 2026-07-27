import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the session boundary so the route runs without a DB. @/lib/session
// pulls in @/db (env parsing at import) — the art-proxy precedent.
const getSession = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => getSession(),
}));

const { GET } = await import("../route");

describe("/api/me GET", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("401s when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns id, username, role and never leaks passwordHash", async () => {
    getSession.mockResolvedValue({
      user: {
        id: "usr_1",
        username: "cookie",
        role: "admin",
        passwordHash: "scrypt$deadbeef",
        disabledAt: null,
        createdAt: new Date(),
      },
      expiresAt: new Date(),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ user: { id: "usr_1", username: "cookie", role: "admin" } });
    expect(JSON.stringify(body)).not.toContain("passwordHash");
    expect(JSON.stringify(body)).not.toContain("scrypt");
  });
});
