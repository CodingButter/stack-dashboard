import { beforeAll, describe, expect, it } from "vitest";

// crypto.ts derives its key from SESSION_SECRET via env(); set it before import.
process.env.SESSION_SECRET = "test-session-secret-at-least-32-chars-long";
process.env.DATABASE_URL = "postgres://x";

let encryptSecret: (s: string) => string;
let decryptSecret: (s: string) => string;

beforeAll(async () => {
  const mod = await import("@/lib/crypto");
  encryptSecret = mod.encryptSecret;
  decryptSecret = mod.decryptSecret;
});

describe("secret vault", () => {
  it("roundtrips a value", () => {
    const plain = "abcdef0123456789abcdef0123456789"; // a 32-char api key
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("produces a different ciphertext each time (fresh salt+iv)", () => {
    const plain = "same-input";
    const a = encryptSecret(plain);
    const b = encryptSecret(plain);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(plain);
    expect(decryptSecret(b)).toBe(plain);
  });

  it("rejects tampered ciphertext (auth tag check)", () => {
    const enc = encryptSecret("secret");
    const buf = Buffer.from(enc, "base64");
    buf[buf.length - 1] ^= 0xff; // flip a ciphertext byte
    const tampered = buf.toString("base64");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects a truncated blob", () => {
    expect(() => decryptSecret(Buffer.from("short").toString("base64"))).toThrow(
      /too short/,
    );
  });
});
