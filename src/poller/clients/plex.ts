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

export interface PlexSessions {
  count: number;
  directPlay: number;
  transcode: number;
  totalBitrateKbps: number;
}

interface PlexSessionEntry {
  Media?: Array<{ Part?: Array<{ decision?: string }> }>;
  TranscodeSession?: unknown;
  Session?: { bandwidth?: number };
  bitrate?: number;
}

export function parsePlexSessions(raw: unknown): PlexSessions {
  const mc = (raw as { MediaContainer?: { size?: number; Metadata?: PlexSessionEntry[] } })
    ?.MediaContainer;
  const entries = Array.isArray(mc?.Metadata) ? mc.Metadata : [];
  let directPlay = 0;
  let transcode = 0;
  let totalBitrateKbps = 0;
  for (const e of entries) {
    if (e.TranscodeSession) transcode++;
    else directPlay++;
    totalBitrateKbps += Number(e.Session?.bandwidth ?? e.bitrate ?? 0);
  }
  return {
    count: Number(mc?.size ?? entries.length),
    directPlay,
    transcode,
    totalBitrateKbps,
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
