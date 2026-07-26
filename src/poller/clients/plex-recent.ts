/**
 * Plex recently-added, per library section. Separate from the sessions client
 * (plex.ts) because it's heavier and belongs on a slow tier: it walks the
 * server's library sections and pulls each one's recently-added feed so the UI
 * can render Netflix-style carousels (one per section).
 *
 * The service is registered as "plex-recent" for its own slow poll tier, but it
 * reuses the "plex" vault credentials — it calls loadServiceConfig("plex")
 * itself rather than relying on the empty cfg the runtime passes for
 * "plex-recent" (there is no plex-recent.* vault entry, and duplicating the
 * token there would be a second copy of a secret). Consequently `configured`
 * returns true unconditionally; a missing/unset Plex simply yields ok:false.
 *
 * Plex speaks XML by default but honors `Accept: application/json`. Shows appear
 * in a section's recentlyAdded feed grouped at the series level (type "show"
 * with leafCount episodes and addedAt reflecting the newest episode add), which
 * is exactly what makes a series bubble to the front when a new episode lands —
 * no client-side dedup needed.
 */
import type { Poller } from "../registry";
import type { PollOutcome } from "../persist";
import { httpFetch } from "./http";

export interface RecentItem {
  ratingKey: string;
  title: string;
  type: string;
  thumb: string;
  addedAt: number;
  year: number | null;
  episodeCount: number;
}

/** One carousel bucket → its Plex library section title. Overridable via env. */
export interface SectionMap {
  kind: string;
  title: string;
}

/** Default section-title → bucket mapping. Order defines carousel order. */
export const DEFAULT_SECTIONS: SectionMap[] = [
  { kind: "recent-movies", title: "Movies" },
  { kind: "recent-tv", title: "TV Shows" },
  { kind: "recent-anime-movies", title: "Anime Movies" },
  { kind: "recent-anime-tv", title: "Anime TV" },
];

/**
 * Resolve the bucket→title mapping. `PLEX_RECENT_SECTIONS` overrides the titles
 * (pipe-separated, positional against DEFAULT_SECTIONS' kinds) so a library
 * rename needs no code change. Malformed/short overrides fall back per-slot.
 */
export function resolveSections(
  env: Record<string, string | undefined> = process.env,
): SectionMap[] {
  const raw = env.PLEX_RECENT_SECTIONS;
  if (!raw) return DEFAULT_SECTIONS;
  const titles = raw.split("|").map((t) => t.trim());
  return DEFAULT_SECTIONS.map((s, i) => ({
    kind: s.kind,
    title: titles[i] && titles[i].length > 0 ? titles[i] : s.title,
  }));
}

interface PlexRecentEntry {
  ratingKey?: string | number;
  title?: string;
  type?: string;
  thumb?: string;
  addedAt?: number;
  year?: number;
  leafCount?: number;
  childCount?: number;
}

/** Parse a section's recentlyAdded feed. Never throws; missing fields default. */
export function parseRecentlyAdded(raw: unknown): RecentItem[] {
  const mc = (raw as { MediaContainer?: { Metadata?: PlexRecentEntry[] } })
    ?.MediaContainer;
  const entries = Array.isArray(mc?.Metadata) ? mc.Metadata : [];
  return entries.map((e) => ({
    ratingKey: String(e.ratingKey ?? ""),
    title: String(e.title ?? "Untitled"),
    type: String(e.type ?? "unknown"),
    thumb: String(e.thumb ?? ""),
    addedAt: Number(e.addedAt ?? 0),
    year: e.year != null ? Number(e.year) : null,
    episodeCount:
      e.type === "show" ? Number(e.leafCount ?? e.childCount ?? 0) : 0,
  }));
}

/** Parse `/library/sections` into {key,title} entries. Never throws. */
export function parseSections(
  raw: unknown,
): Array<{ key: string; title: string }> {
  const mc = (
    raw as {
      MediaContainer?: { Directory?: Array<{ key?: string; title?: string }> };
    }
  )?.MediaContainer;
  const dirs = Array.isArray(mc?.Directory) ? mc.Directory : [];
  return dirs.map((d) => ({
    key: String(d.key ?? ""),
    title: String(d.title ?? ""),
  }));
}

/** Parse the Plex identity endpoint → server machineIdentifier. "" if absent. */
export function parseMachineId(raw: unknown): string {
  const mc = (raw as { MediaContainer?: { machineIdentifier?: string } })
    ?.MediaContainer;
  return String(mc?.machineIdentifier ?? "");
}

export const plexRecentPoller: Poller = {
  service: "plex-recent",
  // Reuses the "plex" vault config loaded inside poll(); the cfg the runtime
  // passes for "plex-recent" is empty, so gating on it would skip the poll.
  configured: () => true,
  async poll(): Promise<Omit<PollOutcome, "service" | "latencyMs">> {
    // Lazy import keeps the pure parsers importable in tests without pulling in
    // settings → db (which parses env at import time).
    const { loadServiceConfig } = await import("../settings");
    const cfg = await loadServiceConfig("plex");
    if (!cfg.url || !cfg.apiKey) {
      return { ok: false, error: "plex not configured" };
    }
    const base = cfg.url.replace(/\/$/, "");
    const token = encodeURIComponent(cfg.apiKey);
    const accept = { Accept: "application/json" };

    // Identity (best-effort — deep-links degrade gracefully without it).
    const idRes = await httpFetch(`${base}/?X-Plex-Token=${token}`, {
      headers: accept,
    });
    const machineId = idRes.ok ? parseMachineId(idRes.data) : "";

    // Sections — the primary call. If this fails the whole poll is a failure so
    // the breaker can back off (mirrors plexPoller's ok:false on primary fetch).
    const secRes = await httpFetch(`${base}/library/sections?X-Plex-Token=${token}`, {
      headers: accept,
    });
    if (!secRes.ok) return { ok: false, error: secRes.error };
    const sections = parseSections(secRes.data);
    const byTitle = new Map(sections.map((s) => [s.title, s.key]));

    const wanted = resolveSections();
    const snapshots: Array<{ kind: string; payload: unknown }> = [];
    for (const { kind, title } of wanted) {
      const key = byTitle.get(title);
      if (!key) {
        // Unmatched section title → empty bucket, never a throw.
        snapshots.push({ kind, payload: { machineId, items: [] } });
        continue;
      }
      const res = await httpFetch(
        `${base}/library/sections/${encodeURIComponent(key)}/recentlyAdded` +
          `?X-Plex-Token=${token}&X-Plex-Container-Start=0&X-Plex-Container-Size=15`,
        { headers: accept },
      );
      // Fail-soft per section: a single down section shouldn't blank the page.
      const items = res.ok ? parseRecentlyAdded(res.data) : [];
      snapshots.push({ kind, payload: { machineId, items } });
    }

    return { ok: true, snapshots };
  },
};
