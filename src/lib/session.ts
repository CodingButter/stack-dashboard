import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { auditLog, sessions, users, type User } from "@/db/schema";
import {
  SESSION_TTL_MS,
  generateSessionToken,
  hashSessionToken,
  isSessionExpired,
  newId,
  shouldRenewSession,
} from "@/lib/auth";

export const SESSION_COOKIE = "stackdash_session";

/**
 * `secure` is on by default in production; COOKIE_SECURE=false opts out for
 * the tailnet plain-HTTP deployment (a Secure cookie would never be stored
 * over http://100.x.x.x and every login would silently fail).
 */
function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

export async function createSession(userId: string): Promise<void> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: hashSessionToken(token),
    userId,
    expiresAt,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashSessionToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export interface SessionInfo {
  user: User;
  expiresAt: Date;
}

/** Validate the cookie token against the DB. Cached per request. */
export const getSession = cache(async (): Promise<SessionInfo | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const id = hashSessionToken(token);
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  if (isSessionExpired(row.session.expiresAt) || row.user.disabledAt) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  let expiresAt = row.session.expiresAt;
  if (shouldRenewSession(expiresAt)) {
    expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
  }

  return { user: row.user, expiresAt };
});

export async function requireSession(): Promise<SessionInfo> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin(): Promise<SessionInfo> {
  const session = await requireSession();
  if (session.user.role !== "admin") redirect("/");
  return session;
}

export async function writeAudit(entry: {
  userId?: string | null;
  action: string;
  target?: string;
  detail?: unknown;
  result: "ok" | "denied" | "error";
}): Promise<void> {
  await db.insert(auditLog).values({
    id: newId(),
    userId: entry.userId ?? null,
    action: entry.action,
    target: entry.target,
    detail: entry.detail ?? null,
    result: entry.result,
  });
}
