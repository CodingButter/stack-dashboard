/**
 * Plex sessions. Plex speaks XML by default but honors `Accept: application/json`.
 * We only need the live session summary here (direct-play vs transcode +
 * bandwidth); library/section counts + recently-added are heavier and polled on
 * a slower tier via separate calls the UI can add later. Tautulli is preferred
 * for history, so this client stays deliberately small.
 */
import type { Poller } from "../registry";
import type { PollOutcome } from "../persist";
import { httpFetch } from "./http";

export interface PlexSessionDetail {
  sessionId: string;
  title: string;
  user: string;
  player: string;
  state: string;
  decision: "transcode" | "directplay";
  progressPct: number;
  bandwidthKbps: number;
}

export interface PlexSessions {
  count: number;
  directPlay: number;
  transcode: number;
  totalBitrateKbps: number;
  sessions: PlexSessionDetail[];
}

interface PlexSessionEntry {
  Media?: Array<{ Part?: Array<{ decision?: string }> }>;
  TranscodeSession?: unknown;
  Session?: { id?: string; bandwidth?: number };
  bitrate?: number;
  title?: string;
  grandparentTitle?: string;
  parentIndex?: number;
  index?: number;
  type?: string;
  viewOffset?: number;
  duration?: number;
  User?: { title?: string };
  Player?: { product?: string; title?: string; state?: string };
}

/** "Show · S04E02 — Episode" for episodes, plain title for movies. */
function sessionTitle(e: PlexSessionEntry): string {
  if (e.type === "episode" && e.grandparentTitle) {
    const s = String(e.parentIndex ?? "?").padStart(2, "0");
    const ep = String(e.index ?? "?").padStart(2, "0");
    return `${e.grandparentTitle} · S${s}E${ep}`;
  }
  return String(e.title ?? "Unknown");
}

export function parsePlexSessions(raw: unknown): PlexSessions {
  const mc = (raw as { MediaContainer?: { size?: number; Metadata?: PlexSessionEntry[] } })
    ?.MediaContainer;
  const entries = Array.isArray(mc?.Metadata) ? mc.Metadata : [];
  let directPlay = 0;
  let transcode = 0;
  let totalBitrateKbps = 0;
  const sessions: PlexSessionDetail[] = [];
  for (const e of entries) {
    if (e.TranscodeSession) transcode++;
    else directPlay++;
    const bandwidth = Number(e.Session?.bandwidth ?? e.bitrate ?? 0);
    totalBitrateKbps += bandwidth;
    const duration = Number(e.duration ?? 0);
    sessions.push({
      sessionId: String(e.Session?.id ?? ""),
      title: sessionTitle(e),
      user: String(e.User?.title ?? "unknown"),
      player: String(e.Player?.product ?? e.Player?.title ?? ""),
      state: String(e.Player?.state ?? "unknown"),
      decision: e.TranscodeSession ? "transcode" : "directplay",
      progressPct:
        duration > 0
          ? Math.round((Number(e.viewOffset ?? 0) / duration) * 1000) / 10
          : 0,
      bandwidthKbps: bandwidth,
    });
  }
  return {
    count: Number(mc?.size ?? entries.length),
    directPlay,
    transcode,
    totalBitrateKbps,
    sessions,
  };
}

export const plexPoller: Poller = {
  service: "plex",
  configured: (cfg) => Boolean(cfg.url && cfg.apiKey),
  async poll(cfg): Promise<Omit<PollOutcome, "service" | "latencyMs">> {
    const base = cfg.url!.replace(/\/$/, "");
    const token = encodeURIComponent(cfg.apiKey ?? "");
    const res = await httpFetch(`${base}/status/sessions?X-Plex-Token=${token}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, error: res.error };

    const sessions = parsePlexSessions(res.data);
    return {
      ok: true,
      snapshots: [{ kind: "sessions", payload: sessions }],
      metrics: [
        { box: "plex", metric: "plex.sessions", value: sessions.count },
        { box: "plex", metric: "plex.transcode", value: sessions.transcode },
        {
          box: "plex",
          metric: "plex.bitrate_kbps",
          value: sessions.totalBitrateKbps,
        },
      ],
    };
  },
};
