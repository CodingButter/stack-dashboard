"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { hashPassword, hashSessionToken, verifyPassword } from "@/lib/auth";
import { requireSession, writeAudit, SESSION_COOKIE } from "@/lib/session";

export interface AccountActionState {
  error?: string;
  ok?: boolean;
}

export async function changePassword(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const session = await requireSession();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "New password and confirmation do not match." };
  }
  if (newPassword === currentPassword) {
    return { error: "New password must differ from the current one." };
  }

  const ok = await verifyPassword(currentPassword, session.user.passwordHash);
  if (!ok) {
    await writeAudit({
      userId: session.user.id,
      action: "password.change",
      result: "denied",
      detail: { reason: "wrong current password" },
    });
    return { error: "Current password is incorrect." };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(users.id, session.user.id));

  // Invalidate every OTHER session for this user (keep the one making the change).
  // requireSession() above guarantees a valid cookie; guard anyway so a missing
  // token skips the prune rather than deleting the current session too.
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const currentSessionId = hashSessionToken(token);
    await db
      .delete(sessions)
      .where(
        and(eq(sessions.userId, session.user.id), ne(sessions.id, currentSessionId)),
      );
  }

  await writeAudit({
    userId: session.user.id,
    action: "password.change",
    result: "ok",
  });
  revalidatePath("/settings/account");
  return { ok: true };
}
