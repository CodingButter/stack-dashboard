"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, newId } from "@/lib/auth";
import { requireAdmin, writeAudit } from "@/lib/session";

export interface UserActionState {
  error?: string;
  ok?: boolean;
}

export async function createUser(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const admin = await requireAdmin();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "viewer");

  if (!/^[a-z0-9_-]{2,32}$/i.test(username)) {
    return { error: "Username must be 2-32 chars: letters, digits, - or _." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (role !== "admin" && role !== "viewer") {
    return { error: "Invalid role." };
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existing.length > 0) {
    return { error: "Username already exists." };
  }

  await db.insert(users).values({
    id: newId(),
    username,
    passwordHash: await hashPassword(password),
    role,
  });
  await writeAudit({
    userId: admin.user.id,
    action: "user.create",
    target: username,
    detail: { role },
    result: "ok",
  });
  revalidatePath("/settings/users");
  return { ok: true };
}

export async function setUserDisabled(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const disable = formData.get("disable") === "true";

  if (userId === admin.user.id) return; // never disable yourself

  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const target = rows[0];
  if (!target) return;

  await db
    .update(users)
    .set({ disabledAt: disable ? new Date() : null })
    .where(eq(users.id, userId));
  await writeAudit({
    userId: admin.user.id,
    action: disable ? "user.disable" : "user.enable",
    target: target.username,
    result: "ok",
  });
  revalidatePath("/settings/users");
}
