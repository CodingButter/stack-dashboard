import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

import { env } from "@/env";

/**
 * AES-256-GCM secret vault for API keys stored in the `settings` table.
 *
 * Tradeoff (documented in the segment plan): the key is derived from
 * SESSION_SECRET via scrypt, so this protects DB dumps/backups from casual
 * disclosure — it is NOT a full KMS. An attacker with both the DB and the
 * process env can still decrypt. That is an accepted posture for a
 * single-family, tailnet-only dashboard.
 *
 * Wire format (single base64 string): salt(16) | iv(12) | tag(16) | ciphertext.
 * A fresh random salt+iv per encryption means no IV reuse across values.
 */

const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

function deriveKey(salt: Buffer): Buffer {
  return scryptSync(env().SESSION_SECRET, salt, KEY_LEN);
}

export function encryptSecret(plaintext: string): string {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");
  if (buf.length < SALT_LEN + IV_LEN + TAG_LEN) {
    throw new Error("ciphertext too short");
  }
  const salt = buf.subarray(0, SALT_LEN);
  const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const key = deriveKey(salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  // .final() throws if the auth tag does not verify — tamper detection.
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
