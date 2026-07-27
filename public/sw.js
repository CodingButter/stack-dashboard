/* Stack Dashboard service worker — Web Push.
 *
 * Served unauthenticated at /sw.js (proxy matcher excludes it) so it can
 * register from the login page during PWA install.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePayload(event) {
  // The push body is JSON: { title, body, url, icon, badge }.
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: "Stack Dashboard", body: event.data.text() };
    }
  }
  const title = data.title || "Stack Dashboard";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/favicon-32.png",
    data: { url: data.url || "/" },
  };
  return { title, options };
}

self.addEventListener("push", (event) => {
  const { title, options } = parsePayload(event);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Focus an existing dashboard tab if one is open.
        if ("focus" in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
