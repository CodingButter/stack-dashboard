import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";

// Cache the pool on globalThis so dev hot-reloads reuse it instead of
// leaking a new 5-connection pool per reload (exhausts Postgres slots).
const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

const client = globalForDb.pgClient ?? postgres(env().DATABASE_URL, { max: 5 });
globalForDb.pgClient = client;

export const db = drizzle(client);
