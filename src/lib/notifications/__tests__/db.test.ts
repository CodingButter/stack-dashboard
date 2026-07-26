import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture the fluent drizzle chains so we can assert calls without a real DB.
const selectWhere = vi.fn();
const selectFrom = vi.fn(() => ({ where: selectWhere, limit: selectLimit }));
const selectLimit = vi.fn();
const dbSelect = vi.fn(() => ({ from: selectFrom }));

const insertOnConflict = vi.fn().mockResolvedValue(undefined);
const insertValues = vi.fn(() => ({ onConflictDoUpdate: insertOnConflict }));
const dbInsert = vi.fn(() => ({ values: insertValues }));

const deleteWhere = vi.fn().mockResolvedValue(undefined);
const dbDelete = vi.fn(() => ({ where: deleteWhere }));

// where(...) on a select needs to be awaitable AND chainable to limit().
function selectResult(rows: unknown[]) {
  const p = Promise.resolve(rows) as Promise<unknown[]> & { limit: typeof selectLimit };
  p.limit = selectLimit;
  return p;
}

vi.mock("@/db", () => ({
  db: {
    select: () => dbSelect(),
    insert: () => dbInsert(),
    delete: () => dbDelete(),
  },
}));
vi.mock("@/db/schema", () => ({
  pushSubscriptions: { userId: "userId", endpoint: "endpoint" },
  notificationPreferences: { userId: "userId" },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ["and", ...a],
  eq: (...a: unknown[]) => ["eq", ...a],
}));
vi.mock("@/lib/auth", () => ({ newId: () => "id_fixed" }));

const {
  addSubscription,
  removeSubscription,
  getUserSubscriptions,
  getAllSubscriptions,
  getUserPreferences,
  setUserPreferences,
  defaultPreferences,
} = await import("../db");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("subscriptions", () => {
  it("addSubscription upserts on (userId, endpoint)", async () => {
    await addSubscription("usr_1", {
      endpoint: "https://push.example/abc",
      keys: { auth: "A", p256dh: "P" },
    });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "usr_1",
        endpoint: "https://push.example/abc",
        auth: "A",
        p256dh: "P",
      }),
    );
    expect(insertOnConflict).toHaveBeenCalledWith(
      expect.objectContaining({ set: { auth: "A", p256dh: "P" } }),
    );
  });

  it("removeSubscription deletes the row", async () => {
    await removeSubscription("usr_1", "https://push.example/abc");
    expect(dbDelete).toHaveBeenCalled();
    expect(deleteWhere).toHaveBeenCalled();
  });

  it("getUserSubscriptions maps rows", async () => {
    selectWhere.mockReturnValue(
      selectResult([{ userId: "usr_1", endpoint: "e", auth: "a", p256dh: "p", id: "x" }]),
    );
    const subs = await getUserSubscriptions("usr_1");
    expect(subs).toEqual([{ userId: "usr_1", endpoint: "e", auth: "a", p256dh: "p" }]);
  });

  it("getAllSubscriptions maps every row", async () => {
    selectFrom.mockReturnValueOnce(
      Promise.resolve([
        { userId: "u1", endpoint: "e1", auth: "a1", p256dh: "p1", id: "1" },
        { userId: "u2", endpoint: "e2", auth: "a2", p256dh: "p2", id: "2" },
      ]) as never,
    );
    const subs = await getAllSubscriptions();
    expect(subs).toHaveLength(2);
    expect(subs[0]).toEqual({ userId: "u1", endpoint: "e1", auth: "a1", p256dh: "p1" });
  });
});

describe("preferences", () => {
  it("returns all-true defaults when no row exists", async () => {
    selectWhere.mockReturnValue(selectResult([]));
    selectLimit.mockResolvedValue([]);
    const prefs = await getUserPreferences("usr_1");
    expect(prefs).toEqual(defaultPreferences());
    expect(prefs.new_movies).toBe(true);
  });

  it("merges stored prefs over defaults", async () => {
    selectWhere.mockReturnValue(selectResult([]));
    selectLimit.mockResolvedValue([{ preferences: { new_movies: false } }]);
    const prefs = await getUserPreferences("usr_1");
    expect(prefs.new_movies).toBe(false);
    // a key not stored still defaults to enabled
    expect(prefs.plex_down).toBe(true);
  });

  it("setUserPreferences upserts on userId", async () => {
    await setUserPreferences("usr_1", { new_movies: false });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "usr_1", preferences: { new_movies: false } }),
    );
    expect(insertOnConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ preferences: { new_movies: false } }),
      }),
    );
  });
});
