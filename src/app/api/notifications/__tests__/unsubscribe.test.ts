import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const removeSubscription = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/notifications/db", () => ({
  removeSubscription: (...a: unknown[]) => removeSubscription(...a),
}));

const { POST } = await import("../unsubscribe/route");

function req(body: unknown): Request {
  return new Request("http://localhost/api/notifications/unsubscribe", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/notifications/unsubscribe POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: "usr_1" } });
  });

  it("401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(req({ endpoint: "https://push.example.com/abc" }));
    expect(res.status).toBe(401);
    expect(removeSubscription).not.toHaveBeenCalled();
  });

  it("400 on invalid body", async () => {
    const res = await POST(req({ endpoint: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("202 and removes subscription on valid body", async () => {
    const res = await POST(req({ endpoint: "https://push.example.com/abc" }));
    expect(res.status).toBe(202);
    expect(removeSubscription).toHaveBeenCalledWith("usr_1", "https://push.example.com/abc");
  });
});
