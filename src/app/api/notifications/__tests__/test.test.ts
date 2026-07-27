import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const getUserSubscriptions = vi.fn();
const sendPushToUser = vi.fn();

vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/notifications/db", () => ({
  getUserSubscriptions: (id: string) => getUserSubscriptions(id),
}));
vi.mock("@/lib/notifications/send", () => ({
  sendPushToUser: (id: string, p: unknown) => sendPushToUser(id, p),
}));

const { POST } = await import("../test/route");

describe("/api/notifications/test POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: "usr_1" } });
  });

  it("401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns a message when the user has no subscriptions", async () => {
    getUserSubscriptions.mockResolvedValue([]);
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/no push subscriptions/i);
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("202 and sends when subscriptions exist", async () => {
    getUserSubscriptions.mockResolvedValue([{ endpoint: "e" }]);
    sendPushToUser.mockResolvedValue(1);
    const res = await POST();
    expect(res.status).toBe(202);
    expect(sendPushToUser).toHaveBeenCalledWith("usr_1", expect.objectContaining({ title: expect.any(String) }));
    const body = await res.json();
    expect(body.sent).toBe(1);
  });
});
