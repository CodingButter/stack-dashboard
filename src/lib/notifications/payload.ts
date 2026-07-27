export interface PushPayload {
  title: string;
  body: string;
  url: string;
  icon?: string;
  badge?: string;
}

export interface NotificationView {
  title: string;
  options: {
    body: string;
    icon: string;
    badge: string;
    data: { url: string };
  };
}

const DEFAULT_ICON = "/icons/icon-192.png";
const DEFAULT_BADGE = "/icons/favicon-32.png";

/**
 * Shape a push payload into the arguments for showNotification(). Kept as a
 * pure function so it is testable in Node — the service worker (public/sw.js)
 * mirrors this logic but runs in a worker environment vitest can't simulate.
 */
export function buildNotificationView(payload: Partial<PushPayload>): NotificationView {
  return {
    title: payload.title || "Stack Dashboard",
    options: {
      body: payload.body || "",
      icon: payload.icon || DEFAULT_ICON,
      badge: payload.badge || DEFAULT_BADGE,
      data: { url: payload.url || "/" },
    },
  };
}
