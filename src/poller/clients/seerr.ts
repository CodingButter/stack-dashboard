/**
 * Overseerr/Jellyseerr ("seerr"): request pipeline counts. Status codes:
 * 1=pending, 2=approved, 3=declined, 4=processing, 5=available. We surface the
 * pipeline breakdown and the grand total (pageInfo.results) without persisting
 * per-user PII.
 */
import type { Poller } from "../registry";
import type { PollOutcome } from "../persist";
import { httpFetch } from "./http";

export interface SeerrCounts {
  total: number;
  pending: number;
  approved: number;
  declined: number;
  processing: number;
  available: number;
}

const STATUS_MAP: Record<number, keyof Omit<SeerrCounts, "total">> = {
  1: "pending",
  2: "approved",
  3: "declined",
  4: "processing",
  5: "available",
};

export function parseSeerrRequests(raw: unknown): SeerrCounts {
  const r = raw as {
    pageInfo?: { results?: number };
    results?: Array<{ status?: number }>;
  };
  const counts: SeerrCounts = {
    total: Number(r?.pageInfo?.results ?? 0),
    pending: 0,
    approved: 0,
    declined: 0,
    processing: 0,
    available: 0,
  };
  const results = Array.isArray(r?.results) ? r.results : [];
  for (const req of results) {
    const key = STATUS_MAP[Number(req.status ?? 0)];
    if (key) counts[key]++;
  }
  return counts;
}

export const seerrPoller: Poller = {
  service: "seerr",
  configured: (cfg) => Boolean(cfg.url && cfg.apiKey),
  async poll(cfg): Promise<Omit<PollOutcome, "service" | "latencyMs">> {
    const base = cfg.url!.replace(/\/$/, "");
    // filter=pending is cheaper for the actionable count; the take=100 window
    // samples recent pipeline state, and pageInfo.results gives the true total.
    const res = await httpFetch(`${base}/api/v1/request?take=100&sort=added`, {
      headers: { "X-Api-Key": cfg.apiKey ?? "", Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, error: res.error };

    const counts = parseSeerrRequests(res.data);
    return {
      ok: true,
      snapshots: [{ kind: "requests", payload: counts }],
      metrics: [
        { box: "seerr", metric: "seerr.requests.total", value: counts.total },
        { box: "seerr", metric: "seerr.requests.pending", value: counts.pending },
        {
          box: "seerr",
          metric: "seerr.requests.processing",
          value: counts.processing,
        },
      ],
    };
  },
};
