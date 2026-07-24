import { describe, expect, it } from "vitest";

import {
  SESSION_TTL_MS,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  isSessionExpired,
  shouldRenewSession,
  verifyPassword,
} from "@/lib/auth";
import { RateLimiter } from "@/lib/rate-limit";

describe("password hashing", () => {
  it("roundtrips: hash then verify succeeds", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt:")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("right-password");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces a different hash per call (random salt)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
  });

  it("rejects malformed stored hashes without throwing", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "scrypt:zz:zz")).toBe(false);
  });
});

describe("session tokens", () => {
  it("generates unique tokens and stable hashes", () => {
    const t1 = generateSessionToken();
    const t2 = generateSessionToken();
    expect(t1).not.toBe(t2);
    expect(hashSessionToken(t1)).toBe(hashSessionToken(t1));
    expect(hashSessionToken(t1)).not.toBe(hashSessionToken(t2));
    // sha256 hex
    expect(hashSessionToken(t1)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("session expiry", () => {
  const now = new Date("2026-07-24T12:00:00Z");

  it("expired when expiresAt is in the past", () => {
    expect(isSessionExpired(new Date(now.getTime() - 1000), now)).toBe(true);
    expect(isSessionExpired(new Date(now.getTime() + 1000), now)).toBe(false);
  });

  it("renews when less than half the TTL remains", () => {
    const fresh = new Date(now.getTime() + SESSION_TTL_MS);
    const stale = new Date(now.getTime() + SESSION_TTL_MS / 2 - 1000);
    expect(shouldRenewSession(fresh, now)).toBe(false);
    expect(shouldRenewSession(stale, now)).toBe(true);
  });
});

describe("RateLimiter", () => {
  it("allows up to the limit then denies within the window", () => {
    const rl = new RateLimiter(3, 60_000);
    const t = 1_000_000;
    expect(rl.check("ip", t)).toBe(true);
    expect(rl.check("ip", t + 1)).toBe(true);
    expect(rl.check("ip", t + 2)).toBe(true);
    expect(rl.check("ip", t + 3)).toBe(false);
  });

  it("frees slots after the window slides", () => {
    const rl = new RateLimiter(2, 60_000);
    const t = 1_000_000;
    expect(rl.check("ip", t)).toBe(true);
    expect(rl.check("ip", t + 1)).toBe(true);
    expect(rl.check("ip", t + 2)).toBe(false);
    expect(rl.check("ip", t + 60_002)).toBe(true);
  });

  it("tracks keys independently", () => {
    const rl = new RateLimiter(1, 60_000);
    expect(rl.check("a", 0)).toBe(true);
    expect(rl.check("b", 0)).toBe(true);
    expect(rl.check("a", 1)).toBe(false);
  });
});
