/**
 * Seed a poller service's vault entry: `<service>.url` (plaintext) and
 * `<service>.apikey` (AES-256-GCM encrypted). URL and token come ONLY from env
 * vars — never hardcoded, never committed.
 *
 *   SERVICE=agent-devbeast \
 *   SERVICE_URL='http://100.107.144.64:9101' \
 *   SERVICE_TOKEN='…' \
 *   pnpm exec tsx scripts/seed-service.ts
 *
 * Token is optional (omit for URL-only services). Existing rows are updated in
 * place; a blank value leaves the existing entry untouched.
 */
import { db } from "../src/db";
import { settings } from "../src/db/schema";
import { encryptSecret } from "../src/lib/crypto";

async function upsert(key: string, value: string, encrypted: boolean) {
  await db
    .insert(settings)
    .values({ key, value, encrypted, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, encrypted, updatedAt: new Date() },
    });
}

async function main() {
  const service = process.env.SERVICE;
  const url = process.env.SERVICE_URL;
  const token = process.env.SERVICE_TOKEN;

  if (!service) {
    console.error("SERVICE env var is required");
    process.exit(1);
  }

  if (url) {
    await upsert(`${service}.url`, url, false);
    console.log(`set ${service}.url`);
  }
  if (token) {
    await upsert(`${service}.apikey`, encryptSecret(token), true);
    console.log(`set ${service}.apikey (encrypted)`);
  }
  if (!url && !token) {
    console.error("nothing to do: set SERVICE_URL and/or SERVICE_TOKEN");
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
