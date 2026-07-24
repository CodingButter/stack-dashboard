import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { settings } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";

/** Convention: `<service>.url` (plaintext) and `<service>.apikey` (encrypted). */
export interface ServiceConfig {
  url?: string;
  apiKey?: string;
  username?: string;
  password?: string;
}

export async function loadServiceConfig(
  service: string,
): Promise<ServiceConfig> {
  const keys = [
    `${service}.url`,
    `${service}.apikey`,
    `${service}.username`,
    `${service}.password`,
  ];
  const rows = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, keys));

  const cfg: ServiceConfig = {};
  for (const row of rows) {
    const value = row.encrypted ? decryptSecret(row.value) : row.value;
    if (row.key === `${service}.url`) cfg.url = value;
    else if (row.key === `${service}.apikey`) cfg.apiKey = value;
    else if (row.key === `${service}.username`) cfg.username = value;
    else if (row.key === `${service}.password`) cfg.password = value;
  }
  return cfg;
}
