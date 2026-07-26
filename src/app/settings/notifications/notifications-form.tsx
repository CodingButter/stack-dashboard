"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

const EVENT_LABELS: Array<{ key: string; label: string }> = [
  { key: "new_movies", label: "New Movies" },
  { key: "new_tv", label: "New TV Shows" },
  { key: "new_anime_movies", label: "New Anime Movies" },
  { key: "new_anime_tv", label: "New Anime TV" },
  { key: "plex_down", label: "Plex Down / Restore" },
  { key: "tdarr_node_failure", label: "Tdarr Node Failure" },
  { key: "io_overload", label: "I/O Overload" },
  { key: "smart_health", label: "SMART Health" },
  { key: "storage", label: "Storage Fill" },
  { key: "service_down", label: "Service Down" },
  { key: "ssh_burst", label: "SSH Burst" },
];

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function NotificationsForm({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [prefs, setPrefs] = React.useState<Record<string, boolean> | null>(null);
  const [status, setStatus] = React.useState<string>("");
  const [pushEnabled, setPushEnabled] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/notifications/preferences")
      .then((r) => r.json())
      .then((d) => setPrefs(d.preferences ?? {}))
      .catch(() => setPrefs({}));
  }, []);

  async function toggle(key: string) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    await fetch("/api/notifications/preferences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferences: next }),
    }).catch(() => setStatus("Failed to save preference."));
  }

  async function enablePush() {
    setStatus("");
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("This browser does not support push notifications.");
      return;
    }
    if (!vapidPublicKey) {
      setStatus("Server is missing a VAPID public key.");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("Notification permission was denied.");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const json = sub.toJSON();
      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (res.ok) {
        setPushEnabled(true);
        setStatus("Push notifications enabled on this device.");
      } else {
        setStatus("Failed to register subscription with the server.");
      }
    } catch {
      setStatus("Could not enable push notifications.");
    }
  }

  async function testPush() {
    setStatus("");
    const res = await fetch("/api/notifications/test", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setStatus(data.message ?? (res.ok ? "Test notification sent." : "Test failed."));
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button type="button" size="sm" onClick={enablePush}>
          {pushEnabled ? "Push enabled ✓" : "Enable push notifications on this device"}
        </Button>{" "}
        <Button type="button" size="sm" variant="secondary" onClick={testPush}>
          Send test notification
        </Button>
        {status ? (
          <p role="status" className="text-sm text-muted-foreground">
            {status}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        {prefs === null ? (
          <p className="text-sm text-muted-foreground">Loading preferences…</p>
        ) : (
          EVENT_LABELS.map(({ key, label }) => (
            <label
              key={key}
              htmlFor={`notif-${key}`}
              className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2"
            >
              <span className="text-sm">{label}</span>
              <input
                id={`notif-${key}`}
                type="checkbox"
                aria-label={label}
                className="h-4 w-4"
                checked={prefs[key] ?? true}
                onChange={() => toggle(key)}
              />
            </label>
          ))
        )}
      </div>
    </div>
  );
}
