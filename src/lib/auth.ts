import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/** Format: scrypt:<salt hex>:<key hex> — per-user random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
  const actual = await scrypt(password, salt, KEY_LENGTH);
  return timingSafeEqual(actual, expected);
}

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Sliding expiry: extend when less than half the TTL remains. */
export const SESSION_RENEW_THRESHOLD_MS = SESSION_TTL_MS / 2;

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The DB stores only the sha256 of the token, never the token itself. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isSessionExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function shouldRenewSession(
  expiresAt: Date,
  now: Date = new Date(),
): boolean {
  return expiresAt.getTime() - now.getTime() < SESSION_RENEW_THRESHOLD_MS;
}

export function newId(): string {
  return crypto.randomUUID();
}
