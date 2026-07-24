"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth";
import { loginRateLimiter } from "@/lib/rate-limit";
import { createSession, destroySession, getSession, writeAudit } from "@/lib/session";

export interface LoginState {
  error?: string;
}

const GENERIC_FAILURE = "Invalid username or password.";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: GENERIC_FAILURE };

  const ip = await clientIp();
  if (!loginRateLimiter.check(ip)) {
    await writeAudit({
      action: "auth.login",
      target: username,
      detail: { ip, reason: "rate-limited" },
      result: "denied",
    });
    return { error: "Too many attempts — try again in a minute." };
  }

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  const user = rows[0];

  const valid =
    user && !user.disabledAt
      ? await verifyPassword(password, user.passwordHash)
      : false;

  if (!valid || !user) {
    await writeAudit({
      userId: user?.id ?? null,
      action: "auth.login",
      target: username,
      detail: { ip },
      result: "denied",
    });
    return { error: GENERIC_FAILURE };
  }

  await createSession(user.id);
  await writeAudit({
    userId: user.id,
    action: "auth.login",
    target: username,
    detail: { ip },
    result: "ok",
  });
  redirect("/");
}

export async function logout(): Promise<void> {
  const session = await getSession();
  if (session) {
    await writeAudit({
      userId: session.user.id,
      action: "auth.logout",
      result: "ok",
    });
  }
  await destroySession();
  redirect("/login");
}
