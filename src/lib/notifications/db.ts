import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { notificationPreferences, pushSubscriptions } from "@/db/schema";
import { newId } from "@/lib/auth";

export interface WebPushKeys {
  auth: string;
  p256dh: string;
}

export interface WebPushSubscription {
  endpoint: string;
  keys: WebPushKeys;
}

export interface StoredSubscription {
  userId: string;
  endpoint: string;
  auth: string;
  p256dh: string;
}

/** Every notification event type, with its default (all enabled). */
export const NOTIFICATION_EVENT_TYPES = [
  "new_movies",
  "new_tv",
  "new_anime_movies",
  "new_anime_tv",
  "plex_down",
  "tdarr_node_failure",
  "io_overload",
  "smart_health",
  "storage",
  "service_down",
  "ssh_burst",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export function defaultPreferences(): Record<string, boolean> {
  return Object.fromEntries(NOTIFICATION_EVENT_TYPES.map((t) => [t, true]));
}

export async function getUserSubscriptions(userId: string): Promise<StoredSubscription[]> {
  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  return rows.map((r) => ({
    userId: r.userId,
    endpoint: r.endpoint,
    auth: r.auth,
    p256dh: r.p256dh,
  }));
}

export async function getAllSubscriptions(): Promise<StoredSubscription[]> {
  const rows = await db.select().from(pushSubscriptions);
  return rows.map((r) => ({
    userId: r.userId,
    endpoint: r.endpoint,
    auth: r.auth,
    p256dh: r.p256dh,
  }));
}

/** Upsert: re-subscribing the same (user, endpoint) refreshes the keys. */
export async function addSubscription(
  userId: string,
  subscription: WebPushSubscription,
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      id: newId(),
      userId,
      endpoint: subscription.endpoint,
      auth: subscription.keys.auth,
      p256dh: subscription.keys.p256dh,
    })
    .onConflictDoUpdate({
      target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
      set: { auth: subscription.keys.auth, p256dh: subscription.keys.p256dh },
    });
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)),
    );
}

/** Prune a dead endpoint regardless of owner (used on 404/410 from the push service). */
export async function removeSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function getUserPreferences(userId: string): Promise<Record<string, boolean>> {
  const [row] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  if (!row) return defaultPreferences();
  return { ...defaultPreferences(), ...(row.preferences as Record<string, boolean>) };
}

export async function setUserPreferences(
  userId: string,
  prefs: Record<string, boolean>,
): Promise<void> {
  await db
    .insert(notificationPreferences)
    .values({ id: newId(), userId, preferences: prefs })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { preferences: prefs, updatedAt: new Date() },
    });
}
