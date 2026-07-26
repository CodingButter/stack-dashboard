"use client";

import { useEffect } from "react";

/**
 * Registers the Web Push service worker once on mount. No-ops when the browser
 * lacks service-worker support (e.g. non-HTTPS dev or older browsers).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures are non-fatal — push simply stays unavailable.
    });
  }, []);

  return null;
}
