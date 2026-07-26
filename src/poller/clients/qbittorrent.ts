/**
 * qBittorrent WebUI API (v2). Auth is a cookie flow: POST /auth/login with a
 * Referer header matching the WebUI origin returns an SID cookie which every
 * subsequent request must carry. Until the Segment 03 subnet-whitelist fix,
 * remote requests get 403 — the client must degrade to a clean `ok: false`,
 * never throw.
 */
import type { Poller } from "../registry";
import type { PollOutcome } from "../persist";
import { httpFetch } from "./http";

export interface QbitTorrent {
  name: string;
  category: string;
  state: string;
  ratio: number;
  progress: number;
}

export interface QbitParsed {
  total: number;
  downloading: number;
  seeding: number;
  stalled: number;
  errored: number;
  seedboost: number;
  dlSpeed: number;
  upSpeed: number;
  byCategory: Record<string, number>;
}

interface QbitRawTorrent {
  name?: string;
  category?: string;
  state?: string;
  ratio?: number;
  progress?: number;
  dlspeed?: number;
  upspeed?: number;
}

export function parseQbitTorrents(raw: unknown): QbitParsed {
  const list = Array.isArray(raw) ? (raw as QbitRawTorrent[]) : [];
  const out: QbitParsed = {
    total: list.length,
    downloading: 0,
    seeding: 0,
    stalled: 0,
    errored: 0,
    seedboost: 0,
    dlSpeed: 0,
    upSpeed: 0,
    byCategory: {},
  };
  for (const t of list) {
    const state = (t.state ?? "").toLowerCase();
    const category = t.category ?? "";
    out.dlSpeed += Number(t.dlspeed ?? 0);
    out.upSpeed += Number(t.upspeed ?? 0);
    out.byCategory[category] = (out.byCategory[category] ?? 0) + 1;
    if (category === "seedboost") out.seedboost++;
    if (state.includes("error") || state.includes("missingfiles")) out.errored++;
    else if (state.startsWith("stalled")) out.stalled++;
    else if (state.includes("dl") || state === "downloading") out.downloading++;
    else if (state.includes("up") || state === "uploading" || state === "stalledup")
      out.seeding++;
  }
  return out;
}

/** Login → SID cookie. Returns the cookie string or null on failure. */
export async function qbitLogin(
  base: string,
  username: string,
  password: string,
): Promise<string | null> {
  const body = new URLSearchParams({ username, password }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${base}/api/v2/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: base,
        Origin: base,
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const sid = setCookie.split(";")[0];
      return sid;
    }
    // Some deployments accept the login without issuing a fresh cookie header
    // (e.g. LocalHostAuth); "Ok." body means authenticated.
    const text = await res.text();
    return text.trim() === "Ok." ? "" : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const qbittorrentPoller: Poller = {
  service: "qbittorrent",
  configured: (cfg) => Boolean(cfg.url && cfg.username && cfg.password),
  async poll(cfg): Promise<Omit<PollOutcome, "service" | "latencyMs">> {
    const base = cfg.url!.replace(/\/$/, "");
    const cookie = await qbitLogin(base, cfg.username ?? "", cfg.password ?? "");
    if (cookie === null) return { ok: false, error: "qbit auth failed (403/whitelist?)" };

    const headers: Record<string, string> = { Referer: base };
    if (cookie) headers.Cookie = cookie;
    const res = await httpFetch(`${base}/api/v2/torrents/info`, { headers });
    if (!res.ok) return { ok: false, error: res.error };

    const parsed = parseQbitTorrents(res.data);
    return {
      ok: true,
      snapshots: [{ kind: "torrents", payload: parsed }],
      metrics: [
        { box: "qbittorrent", metric: "qbittorrent.total", value: parsed.total },
        { box: "qbittorrent", metric: "qbittorrent.seeding", value: parsed.seeding },
        { box: "qbittorrent", metric: "qbittorrent.errored", value: parsed.errored },
        { box: "qbittorrent", metric: "qbittorrent.dl_speed", value: parsed.dlSpeed },
        { box: "qbittorrent", metric: "qbittorrent.up_speed", value: parsed.upSpeed },
      ],
    };
  },
};
