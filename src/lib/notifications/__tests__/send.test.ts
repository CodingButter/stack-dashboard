import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
const getAllSubscriptions = vi.fn();
const getUserSubscriptions = vi.fn();
const getUserPreferences = vi.fn();
const removeSubscriptionByEndpoint = vi.fn().mockResolvedValue(undefined);

// VAPID config: public key from env, private key from the settings vault.
const selectLimit = vi.fn().mockResolvedValue([{ value: "priv", encrypted: false }]);
const selectWhere = vi.fn(() => ({ limit: selectLimit }));
const selectFrom = vi.fn(() => ({ where: selectWhere }));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...a: unknown[]) => setVapidDetails(...a),
    sendNotification: (...a: unknown[]) => sendNotification(...a),
  },
}));
vi.mock("@/db", () => ({ db: { select: () => ({ from: selectFrom }) } }));
vi.mock("@/db/schema", () => ({ settings: { key: "key" } }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: (v: string) => v }));
vi.mock("drizzle-orm", () => ({ eq: (...a: unknown[]) => a }));
vi.mock("../db", () => ({
  getAllSubscriptions: () => getAllSubscriptions(),
  getUserSubscriptions: (id: string) => getUserSubscriptions(id),
  getUserPreferences: (id: string) => getUserPreferences(id),
  removeSubscriptionByEndpoint: (e: string) => removeSubscriptionByEndpoint(e),
}));

const PAYLOAD = { title: "T", body: "B", url: "/alerts" };

function sub(userId: string, endpoint: string) {
  return { userId, endpoint, auth: "a", p256dh: "p" };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.VAPID_PUBLIC_KEY = "pub";
  sendNotification.mockResolvedValue(undefined);
  selectLimit.mockResolvedValue([{ value: "priv", encrypted: false }]);
});

describe("sendPush", () => {
  it("sends only to subscriptions whose user enabled the event type", async () => {
    const { sendPush } = await import("../send");
    getAllSubscriptions.mockResolvedValue([sub("u1", "e1"), sub("u2", "e2")]);
    getUserPreferences.mockImplementation(async (id: string) =>
      id === "u1" ? { plex_down: true } : { plex_down: false },
    );
    const sent = await sendPush("plex_down", PAYLOAD);
    expect(sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("prunes a subscription on a 410 from the push service", async () => {
    const { sendPush } = await import("../send");
    getAllSubscriptions.mockResolvedValue([sub("u1", "dead")]);
    getUserPreferences.mockResolvedValue({ plex_down: true });
    sendNotification.mockRejectedValue({ statusCode: 410 });
    const sent = await sendPush("plex_down", PAYLOAD);
    expect(sent).toBe(0);
    expect(removeSubscriptionByEndpoint).toHaveBeenCalledWith("dead");
  });

  it("does not throw when a send fails for a non-dead reason", async () => {
    const { sendPush } = await import("../send");
    getAllSubscriptions.mockResolvedValue([sub("u1", "e1")]);
    getUserPreferences.mockResolvedValue({ plex_down: true });
    sendNotification.mockRejectedValue({ statusCode: 500 });
    const sent = await sendPush("plex_down", PAYLOAD);
    expect(sent).toBe(0);
    expect(removeSubscriptionByEndpoint).not.toHaveBeenCalled();
  });

  it("returns 0 without configuring when VAPID keys are missing", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    const { sendPush } = await import("../send");
    getAllSubscriptions.mockResolvedValue([sub("u1", "e1")]);
    const sent = await sendPush("plex_down", PAYLOAD);
    expect(sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("sendPushToUser", () => {
  it("sends to the user's own devices ignoring preferences", async () => {
    const { sendPushToUser } = await import("../send");
    getUserSubscriptions.mockResolvedValue([sub("u1", "e1"), sub("u1", "e2")]);
    const sent = await sendPushToUser("u1", PAYLOAD);
    expect(sent).toBe(2);
    expect(getUserPreferences).not.toHaveBeenCalled();
  });
});
