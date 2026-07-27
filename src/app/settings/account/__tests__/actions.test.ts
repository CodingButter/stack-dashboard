import { beforeEach, describe, expect, it, vi } from "vitest";

// Boundary mocks so the action runs without a DB, cookies, or a real session.
const requireSession = vi.fn();
const writeAudit = vi.fn();
const verifyPassword = vi.fn();
const hashPassword = vi.fn();
const cookiesGet = vi.fn();

const usersWhere = vi.fn().mockResolvedValue(undefined);
const usersSet = vi.fn(() => ({ where: usersWhere }));
const dbUpdate = vi.fn(() => ({ set: usersSet }));
const sessionsWhere = vi.fn().mockResolvedValue(undefined);
const dbDelete = vi.fn(() => ({ where: sessionsWhere }));

vi.mock("@/db", () => ({ db: { update: () => dbUpdate(), delete: () => dbDelete() } }));
vi.mock("@/db/schema", () => ({ users: {}, sessions: {} }));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  ne: (...a: unknown[]) => a,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookiesGet }) }));
vi.mock("@/lib/auth", () => ({
  hashPassword: (p: string) => hashPassword(p),
  verifyPassword: (p: string, s: string) => verifyPassword(p, s),
  hashSessionToken: (t: string) => `hash:${t}`,
}));
vi.mock("@/lib/session", () => ({
  requireSession: () => requireSession(),
  writeAudit: (e: unknown) => writeAudit(e),
  SESSION_COOKIE: "stackdash_session",
}));

const { changePassword } = await import("../actions");

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const SESSION = {
  user: { id: "usr_1", username: "cookie", role: "admin", passwordHash: "scrypt:aa:bb" },
  expiresAt: new Date(),
};

describe("changePassword action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSession.mockResolvedValue(SESSION);
    verifyPassword.mockResolvedValue(true);
    hashPassword.mockResolvedValue("scrypt:cc:dd");
    cookiesGet.mockReturnValue({ value: "raw-token" });
  });

  it("rejects a new password shorter than 8 chars", async () => {
    const res = await changePassword({}, fd({ currentPassword: "oldpass12", newPassword: "short", confirmPassword: "short" }));
    expect(res.error).toMatch(/at least 8/);
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("rejects mismatched confirmation", async () => {
    const res = await changePassword({}, fd({ currentPassword: "oldpass12", newPassword: "newpass123", confirmPassword: "different1" }));
    expect(res.error).toMatch(/do not match/);
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("rejects a new password equal to the current one", async () => {
    const res = await changePassword({}, fd({ currentPassword: "samepass1", newPassword: "samepass1", confirmPassword: "samepass1" }));
    expect(res.error).toMatch(/differ/);
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("rejects a wrong current password and audits the denial", async () => {
    verifyPassword.mockResolvedValue(false);
    const res = await changePassword({}, fd({ currentPassword: "wrongpass", newPassword: "newpass123", confirmPassword: "newpass123" }));
    expect(res.error).toMatch(/incorrect/);
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "password.change", result: "denied" }),
    );
  });

  it("does not prune sessions when the cookie token is missing (never deletes the current session)", async () => {
    cookiesGet.mockReturnValue(undefined);
    const res = await changePassword({}, fd({ currentPassword: "oldpass12", newPassword: "newpass123", confirmPassword: "newpass123" }));
    expect(res).toEqual({ ok: true });
    expect(dbUpdate).toHaveBeenCalledTimes(1); // password still updated
    expect(dbDelete).not.toHaveBeenCalled(); // but no session prune
  });

  it("accepts a valid change: hashes, updates, prunes other sessions, audits ok", async () => {
    const res = await changePassword({}, fd({ currentPassword: "oldpass12", newPassword: "newpass123", confirmPassword: "newpass123" }));
    expect(res).toEqual({ ok: true });
    expect(hashPassword).toHaveBeenCalledWith("newpass123");
    expect(dbUpdate).toHaveBeenCalledTimes(1);
    expect(usersSet).toHaveBeenCalledWith({ passwordHash: "scrypt:cc:dd" });
    expect(dbDelete).toHaveBeenCalledTimes(1); // other-session invalidation
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "password.change", result: "ok" }),
    );
  });
});
