import webpush from "web-push";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { settings } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import {
  getAllSubscriptions,
  getUserPreferences,
  getUserSubscriptions,
  removeSubscriptionByEndpoint,
  type StoredSubscription,
} from "./db";
import type { PushPayload } from "./payload";

const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@plexflex.tv";
const VAPID_PRIVATE_KEY_SETTING = "webpush.vapidPrivateKey";

let configured = false;

async function readVapidPrivateKey(): Promise<string | null> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, VAPID_PRIVATE_KEY_SETTING))
    .limit(1);
  if (!row) return null;
  return row.encrypted ? decryptSecret(row.value) : row.value;
}

/** Configure web-push with the VAPID keypair (public from env, private from vault). */
async function ensureConfigured(): Promise<boolean> {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = await readVapidPrivateKey();
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
  configured = true;
  return true;
}

function isDeadSubscription(err: unknown): boolean {
  const status = (err as { statusCode?: number })?.statusCode;
  return status === 404 || status === 410;
}

async function deliver(
  sub: StoredSubscription,
  payload: PushPayload,
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } },
      JSON.stringify(payload),
    );
    return true;
  } catch (err) {
    if (isDeadSubscription(err)) {
      // Browser expired the subscription — prune it silently.
      await removeSubscriptionByEndpoint(sub.endpoint);
      return false;
    }
    console.error("[push] send failed", sub.endpoint, err);
    return false;
  }
}

/**
 * Fan a payload out to every subscription whose owner has `eventType` enabled.
 * Prunes dead subscriptions (404/410). Returns the number of successful sends.
 */
export async function sendPush(eventType: string, payload: PushPayload): Promise<number> {
  if (!(await ensureConfigured())) return 0;
  const subs = await getAllSubscriptions();
  if (subs.length === 0) return 0;

  const prefCache = new Map<string, Record<string, boolean>>();
  let sent = 0;
  for (const sub of subs) {
    let prefs = prefCache.get(sub.userId);
    if (!prefs) {
      prefs = await getUserPreferences(sub.userId);
      prefCache.set(sub.userId, prefs);
    }
    if (prefs[eventType] === false) continue;
    if (await deliver(sub, payload)) sent++;
  }
  return sent;
}

/** Send a payload to one user's own devices, ignoring preferences (used by the test button). */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!(await ensureConfigured())) return 0;
  const subs = await getUserSubscriptions(userId);
  let sent = 0;
  for (const sub of subs) {
    if (await deliver(sub, payload)) sent++;
  }
  return sent;
}
