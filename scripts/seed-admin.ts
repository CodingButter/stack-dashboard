/**
 * Seed the first admin user. Password comes ONLY from the ADMIN_PASSWORD env
 * var — never hardcoded, never committed.
 *
 *   ADMIN_PASSWORD='…' pnpm exec tsx scripts/seed-admin.ts
 */
import { eq } from "drizzle-orm";

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { hashPassword, newId } from "../src/lib/auth";

async function main() {
  const username = process.env.ADMIN_USERNAME ?? "codingbutter";
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.error("ADMIN_PASSWORD env var is required");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(users)
      .set({ passwordHash, role: "admin", disabledAt: null })
      .where(eq(users.username, username));
    console.log(`updated admin '${username}' (id ${existing[0].id})`);
  } else {
    const id = newId();
    await db.insert(users).values({ id, username, passwordHash, role: "admin" });
    console.log(`created admin '${username}' (id ${id})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
