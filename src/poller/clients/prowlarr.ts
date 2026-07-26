/**
 * Prowlarr indexer health + rate-limit state. Two endpoints:
 *  - /api/v1/indexer        → the configured indexers (enable, priority, limits)
 *  - /api/v1/indexerstatus  → indexers currently disabled/backed-off (disabledTill,
 *                             mostRecentFailure) — this is where the IPTorrents
 *                             daily-cap state surfaces.
 */
import type { Poller } from "../registry";
import type { PollOutcome } from "../persist";
import { httpFetch } from "./http";

export interface ProwlarrIndexer {
  id: number;
  name: string;
  enabled: boolean;
  priority: number;
  protocol: string;
  privacy: string;
}

export interface ProwlarrStatusEntry {
  indexerId: number;
  disabledTill: string | null;
  mostRecentFailure: string | null;
}

export interface ProwlarrParsed {
  indexers: ProwlarrIndexer[];
  total: number;
  enabled: number;
  rateLimited: ProwlarrStatusEntry[];
}

export function parseProwlarrIndexers(raw: unknown): ProwlarrIndexer[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>).map((i) => ({
    id: Number(i.id ?? 0),
    name: String(i.name ?? ""),
    enabled: Boolean(i.enable ?? false),
    priority: Number(i.priority ?? 0),
    protocol: String(i.protocol ?? ""),
    privacy: String(i.privacy ?? ""),
  }));
}

export function parseProwlarrStatus(raw: unknown): ProwlarrStatusEntry[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>).map((s) => ({
    indexerId: Number(s.indexerId ?? 0),
    disabledTill: (s.disabledTill as string) ?? null,
    mostRecentFailure: (s.mostRecentFailure as string) ?? null,
  }));
}

export function parseProwlarr(indexersRaw: unknown, statusRaw: unknown): ProwlarrParsed {
  const indexers = parseProwlarrIndexers(indexersRaw);
  const rateLimited = parseProwlarrStatus(statusRaw);
  return {
    indexers,
    total: indexers.length,
    enabled: indexers.filter((i) => i.enabled).length,
    rateLimited,
  };
}

export const prowlarrPoller: Poller = {
  service: "prowlarr",
  configured: (cfg) => Boolean(cfg.url && cfg.apiKey),
  async poll(cfg): Promise<Omit<PollOutcome, "service" | "latencyMs">> {
    const base = cfg.url!.replace(/\/$/, "");
    const headers = { "X-Api-Key": cfg.apiKey ?? "", Accept: "application/json" };
    const [idxRes, statusRes] = await Promise.all([
      httpFetch(`${base}/api/v1/indexer`, { headers }),
      httpFetch(`${base}/api/v1/indexerstatus`, { headers }),
    ]);
    if (!idxRes.ok) return { ok: false, error: idxRes.error };

    const parsed = parseProwlarr(idxRes.data, statusRes.data);
    return {
      ok: true,
      snapshots: [{ kind: "indexers", payload: parsed }],
      metrics: [
        { box: "prowlarr", metric: "prowlarr.indexers.total", value: parsed.total },
        { box: "prowlarr", metric: "prowlarr.indexers.enabled", value: parsed.enabled },
        {
          box: "prowlarr",
          metric: "prowlarr.indexers.ratelimited",
          value: parsed.rateLimited.length,
        },
      ],
    };
  },
};
