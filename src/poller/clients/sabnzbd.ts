/**
 * SABnzbd: current speed, queue depth + ETA, per-job progress, paused state,
 * speed-limit governor, and lifetime totals. Uses the ?mode=queue and
 * ?mode=server_stats JSON endpoints (apikey query param).
 */
import type { Poller } from "../registry";
import type { PollOutcome } from "../persist";
import { httpFetch } from "./http";

export interface SabJob {
  name: string;
  percent: number;
  mbLeft: number;
  timeLeft: string;
  status: string;
}

export interface SabParsed {
  paused: boolean;
  status: string;
  speedBps: number;
  mbLeft: number;
  queueSize: number;
  timeLeft: string;
  speedLimitPct: number;
  diskFreeGb: number;
  jobs: SabJob[];
}

export interface SabTotals {
  total: number;
  month: number;
  week: number;
  day: number;
}

/** SAB reports kbpersec as a string; speed is a human string. Normalize to bytes/s. */
function kbpersecToBps(raw: unknown): number {
  const kb = Number(raw ?? 0);
  return Number.isFinite(kb) ? Math.round(kb * 1024) : 0;
}

export function parseSabQueue(raw: unknown): SabParsed {
  const q = (raw as { queue?: Record<string, unknown> })?.queue ?? {};
  const slots = Array.isArray(q.slots) ? (q.slots as Array<Record<string, unknown>>) : [];
  return {
    paused: Boolean(q.paused ?? false),
    status: String(q.status ?? "Unknown"),
    speedBps: kbpersecToBps(q.kbpersec),
    mbLeft: Number(q.mbleft ?? 0),
    queueSize: slots.length,
    timeLeft: String(q.timeleft ?? "0:00:00"),
    speedLimitPct: Number(q.speedlimit ?? 100),
    diskFreeGb: Number(q.diskspace1 ?? 0),
    jobs: slots.map((s) => ({
      name: String(s.filename ?? s.name ?? ""),
      percent: Number(s.percentage ?? 0),
      mbLeft: Number(s.mbleft ?? 0),
      timeLeft: String(s.timeleft ?? "0:00:00"),
      status: String(s.status ?? ""),
    })),
  };
}

export function parseSabTotals(raw: unknown): SabTotals {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    total: Number(r.total ?? 0),
    month: Number(r.month ?? 0),
    week: Number(r.week ?? 0),
    day: Number(r.day ?? 0),
  };
}

export const sabnzbdPoller: Poller = {
  service: "sabnzbd",
  configured: (cfg) => Boolean(cfg.url && cfg.apiKey),
  async poll(cfg): Promise<Omit<PollOutcome, "service" | "latencyMs">> {
    const base = cfg.url!.replace(/\/$/, "");
    const key = encodeURIComponent(cfg.apiKey ?? "");
    const [queueRes, statsRes] = await Promise.all([
      httpFetch(`${base}/api?mode=queue&output=json&apikey=${key}`),
      httpFetch(`${base}/api?mode=server_stats&output=json&apikey=${key}`),
    ]);
    if (!queueRes.ok) return { ok: false, error: queueRes.error };

    const q = parseSabQueue(queueRes.data);
    const totals = parseSabTotals(statsRes.data);
    return {
      ok: true,
      snapshots: [{ kind: "queue", payload: { ...q, totals } }],
      metrics: [
        { box: "sabnzbd", metric: "sabnzbd.speed_bps", value: q.speedBps },
        { box: "sabnzbd", metric: "sabnzbd.queue.size", value: q.queueSize },
        { box: "sabnzbd", metric: "sabnzbd.queue.mb_left", value: q.mbLeft },
        { box: "sabnzbd", metric: "sabnzbd.disk_free_gb", value: q.diskFreeGb },
      ],
    };
  },
};
