import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const addSubscription = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/notifications/db", () => ({
  addSubscription: (...a: unknown[]) => addSubscription(...a),
}));

const { POST } = await import("../subscribe/route");

function req(body: unknown): Request {
  return new Request("http://localhost/api/notifications/subscribe", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const VALID = {
  endpoint: "https://push.example.com/abc",
  keys: { auth: "aaa", p256dh: "ppp" },
};

describe("/api/notifications/subscribe POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: "usr_1" } });
  });

  it("401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(req(VALID));
    expect(res.status).toBe(401);
    expect(addSubscription).not.toHaveBeenCalled();
  });

  it("400 on invalid body (missing keys)", async () => {
    const res = await POST(req({ endpoint: "https://push.example.com/abc" }));
    expect(res.status).toBe(400);
    expect(addSubscription).not.toHaveBeenCalled();
  });

  it("400 on non-URL endpoint", async () => {
    const res = await POST(req({ endpoint: "not-a-url", keys: { auth: "a", p256dh: "p" } }));
    expect(res.status).toBe(400);
  });

  it("202 and stores subscription on valid body", async () => {
    const res = await POST(req(VALID));
    expect(res.status).toBe(202);
    expect(addSubscription).toHaveBeenCalledWith("usr_1", VALID);
  });
});
