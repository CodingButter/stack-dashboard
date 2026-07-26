/**
 * Seed the Web Push VAPID private key into the encrypted settings vault under
 * `webpush.vapidPrivateKey`. The key comes ONLY from an env var — never
 * hardcoded, never committed. Run once per environment after generating the
 * keypair with `node scripts/generate-vapid-keys.mjs`.
 *
 *   VAPID_PRIVATE_KEY='…' pnpm exec tsx scripts/seed-vapid.ts
 *
 * The public half goes in the VAPID_PUBLIC_KEY env var (not here). Existing
 * rows are updated in place.
 */
import { db } from "../src/db";
import { settings } from "../src/db/schema";
import { encryptSecret } from "../src/lib/crypto";

const KEY = "webpush.vapidPrivateKey";

async function main() {
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) {
    console.error("VAPID_PRIVATE_KEY env var is required");
    process.exit(1);
  }

  await db
    .insert(settings)
    .values({ key: KEY, value: encryptSecret(priv), encrypted: true, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: encryptSecret(priv), encrypted: true, updatedAt: new Date() },
    });

  console.log(`set ${KEY} (encrypted)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
