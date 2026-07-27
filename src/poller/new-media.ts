/**
 * New-media detection for push notifications (Segment 3). The plex-recent
 * poller stores one snapshot per section each cycle; a title that appears in the
 * newest snapshot but was absent from what we last saw is "newly added". This
 * lives poller-side (that's the process producing the snapshots) and reads only
 * the already-parsed snapshot payloads — it does NOT touch the poller's
 * fetch/parse code.
 *
 * State is in-memory: a set of seen ratingKeys per section kind. The FIRST time
 * we observe a kind we seed the set without firing (a poller restart must not
 * blast a notification for every currently-recent title). Diffing keys strictly
 * on ratingKey — titles repeat and are not stable identifiers.
 */
import type { RecentItem } from "./clients/plex-recent";
import type { PushPayload } from "@/lib/notifications/payload";
import type { SendPush } from "@/alerts/notifying-store";

interface KindMeta {
  eventType: string;
  section: string;
  emoji: string;
}

/** section kind → notification event type + human section label. */
const KIND_META: Record<string, KindMeta> = {
  "recent-movies": { eventType: "new_movies", section: "Movies", emoji: "🎬" },
  "recent-tv": { eventType: "new_tv", section: "TV Shows", emoji: "📺" },
  "recent-anime-movies": {
    eventType: "new_anime_movies",
    section: "Anime Movies",
    emoji: "🎬",
  },
  "recent-anime-tv": {
    eventType: "new_anime_tv",
    section: "Anime TV Shows",
    emoji: "📺",
  },
};

interface SnapshotPayload {
  machineId?: string;
  items?: RecentItem[];
}

export interface NewMediaEvent {
  eventType: string;
  payload: PushPayload;
}

/** Build the Plex deep-link for a rating key (blank machineId → app root). */
function plexUrl(machineId: string, ratingKey: string): string {
  if (!machineId) return "https://app.plex.tv/desktop";
  const key = encodeURIComponent(`/library/metadata/${ratingKey}`);
  return `https://app.plex.tv/desktop/#!/server/${machineId}/details?key=${key}`;
}

/**
 * Stateful new-media detector. Feed it the snapshots a plex-recent poll
 * produced; it returns the push-worthy events (new titles) and updates its
 * seen-set. First observation of a kind seeds silently.
 */
export class NewMediaDetector {
  private readonly seen = new Map<string, Set<string>>();

  /** Diff one poll's snapshots against prior state; returns events to push. */
  detect(
    snapshots: Array<{ kind: string; payload: unknown }>,
  ): NewMediaEvent[] {
    const events: NewMediaEvent[] = [];

    for (const snap of snapshots) {
      const meta = KIND_META[snap.kind];
      if (!meta) continue; // not a recent-media section

      const payload = (snap.payload ?? {}) as SnapshotPayload;
      const items = Array.isArray(payload.items) ? payload.items : [];
      const machineId = String(payload.machineId ?? "");

      const priorSeen = this.seen.get(snap.kind);
      const currentKeys = new Set(items.map((i) => i.ratingKey).filter(Boolean));

      if (priorSeen === undefined) {
        // First time we see this kind: seed silently, fire nothing.
        this.seen.set(snap.kind, currentKeys);
        continue;
      }

      for (const item of items) {
        if (!item.ratingKey || priorSeen.has(item.ratingKey)) continue;
        events.push({
          eventType: meta.eventType,
          payload: {
            title: `${meta.emoji} New ${meta.section.replace(/s$/, "")}: ${item.title}`,
            body: meta.section,
            url: plexUrl(machineId, item.ratingKey),
            icon: "/icons/icon-192.png",
            badge: "/icons/favicon-32.png",
          },
        });
      }

      this.seen.set(snap.kind, currentKeys);
    }

    return events;
  }
}

/**
 * Diff snapshots and dispatch each new-media event through sendPush (preference
 * gated + dead-sub pruned inside sendPush). Errors are swallowed per-event so
 * one failed push never blocks the poll loop.
 */
export async function dispatchNewMedia(
  detector: NewMediaDetector,
  snapshots: Array<{ kind: string; payload: unknown }>,
  sendPush: SendPush,
): Promise<void> {
  const events = detector.detect(snapshots);
  for (const ev of events) {
    try {
      await sendPush(ev.eventType, ev.payload);
    } catch (err) {
      console.error("[push] new-media dispatch failed", ev.eventType, err);
    }
  }
}
