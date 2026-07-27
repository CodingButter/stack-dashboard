/**
 * A notifying decorator around an AlertStore. It delegates every method to the
 * wrapped store unchanged, and additionally fires a Web Push notification when a
 * *new* alert opens (`open()`) — never on `refresh()` (an existing alert
 * re-observed) or `resolve()`. This is the fire-once seam for infra push:
 * without it, every 15 s poll that re-observes a still-breaching alert would
 * re-notify.
 *
 * Mapping a ruleId → notification event type is a small hardcoded table; rules
 * with no mapping (e.g. tls.cert-expiry, host.failed-units) simply don't push.
 * Delivery is preference-gated and dead-subscription-pruned inside sendPush.
 */
import type { AlertStore, OpenAlert } from "./engine";
import type { Breach } from "./types";
import type { PushPayload } from "@/lib/notifications/payload";

export type SendPush = (eventType: string, payload: PushPayload) => Promise<number>;

/** Resolve the notification event type for a breach, or null to skip pushing. */
export function eventTypeForBreach(b: Breach): string | null {
  switch (b.ruleId) {
    case "service.down":
      // The Plex service gets its own toggle; everything else is "service down".
      return b.target.toLowerCase() === "plex" ? "plex_down" : "service_down";
    case "tdarr.node":
      return "tdarr_node_failure";
    case "smart.health":
      return "smart_health";
    case "storage.tier-fill":
    case "storage.array-util":
      return "storage";
    case "host.dstate":
    case "poller.breaker-open":
      return "io_overload";
    case "auth.ssh-burst":
      return "ssh_burst";
    default:
      // host.failed-units, tls.cert-expiry, and any future rule: no push.
      return null;
  }
}

const SEVERITY_ICON: Record<string, string> = {
  critical: "🔴",
  warning: "⚠️",
  info: "ℹ️",
};

export function buildAlertPayload(b: Breach): PushPayload {
  const icon = SEVERITY_ICON[b.severity] ?? "";
  const title = `${icon} ${b.target}`.trim();
  return {
    title,
    body: b.message,
    url: "/alerts",
    icon: "/icons/icon-192.png",
    badge: "/icons/favicon-32.png",
  };
}

export function makeNotifyingStore(inner: AlertStore, sendPush: SendPush): AlertStore {
  return {
    listOpen(): Promise<OpenAlert[]> {
      return inner.listOpen();
    },

    async open(b: Breach, now: Date): Promise<void> {
      // Persist first — a push failure must never block the alert from opening.
      await inner.open(b, now);
      const eventType = eventTypeForBreach(b);
      if (!eventType) return;
      try {
        await sendPush(eventType, buildAlertPayload(b));
      } catch (err) {
        console.error("[push] alert dispatch failed", b.ruleId, b.target, err);
      }
    },

    refresh(id: string, b: Breach, now: Date): Promise<void> {
      // Re-observing an existing alert never re-notifies.
      return inner.refresh(id, b, now);
    },

    resolve(ids: string[], now: Date): Promise<void> {
      return inner.resolve(ids, now);
    },
  };
}
