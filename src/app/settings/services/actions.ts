"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { settings } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { requireAdmin, writeAudit } from "@/lib/session";
import { serviceDef } from "@/poller/services";
import { sql } from "drizzle-orm";

export interface ServiceActionState {
  error?: string;
  ok?: boolean;
  message?: string;
}

async function upsertSetting(key: string, value: string, encrypted: boolean) {
  await db
    .insert(settings)
    .values({ key, value, encrypted, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, encrypted, updatedAt: new Date() },
    });
}

export async function saveService(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("service") ?? "");
  const def = serviceDef(id);
  if (!def) return { error: "Unknown service." };

  const url = String(formData.get("url") ?? "").trim();
  const apiKey = String(formData.get("apikey") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (url && !/^https?:\/\//.test(url)) {
    return { error: "URL must start with http:// or https://" };
  }

  if (url) await upsertSetting(`${id}.url`, url, false);
  // Secrets: only overwrite when a new value is provided (blank = keep existing).
  if (apiKey) await upsertSetting(`${id}.apikey`, encryptSecret(apiKey), true);
  if (username) await upsertSetting(`${id}.username`, username, false);
  if (password) await upsertSetting(`${id}.password`, encryptSecret(password), true);

  await writeAudit({
    userId: admin.user.id,
    action: "service.configure",
    target: id,
    detail: { url: url || undefined, keyChanged: Boolean(apiKey || password) },
    result: "ok",
  });
  revalidatePath("/settings/services");
  return { ok: true, message: `Saved ${def.label}.` };
}

export async function deleteServiceKey(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("service") ?? "");
  if (!serviceDef(id)) return;
  await db.delete(settings).where(sql`${settings.key} like ${id + ".%"}`);
  await writeAudit({
    userId: admin.user.id,
    action: "service.clear",
    target: id,
    result: "ok",
  });
  revalidatePath("/settings/services");
}
