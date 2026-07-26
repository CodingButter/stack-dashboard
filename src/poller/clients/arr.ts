/**
 * Sonarr / Radarr / Prowlarr share the *arr v3 API family (X-Api-Key header,
 * /api/v3/queue, /api/v3/health, /api/v3/rootfolder). This module holds the
 * pure parsers for the shared endpoints plus a factory that builds a Poller for
 * a given service key + api version.
 */
import type { Poller } from "../registry";
import type { PollOutcome } from "../persist";
import type { ServiceConfig } from "../settings";
import { httpFetch } from "./http";

export interface ArrQueueSummary {
  total: number;
  downloading: number;
  paused: number;
  queued: number;
  stalled: number;
  importPending: number;
  errored: number;
}

export interface ArrRootFolder {
  path: string;
  freeSpace: number;
  accessible: boolean;
}

export interface ArrParsed {
  queue: ArrQueueSummary;
  health: { errors: number; warnings: number };
  rootFolders: ArrRootFolder[];
}

const EMPTY_QUEUE: ArrQueueSummary = {
  total: 0,
  downloading: 0,
  paused: 0,
  queued: 0,
  stalled: 0,
  importPending: 0,
  errored: 0,
};

interface ArrQueueRecord {
  status?: string;
  trackedDownloadStatus?: string;
  trackedDownloadState?: string;
  errorMessage?: string;
}

export function parseArrQueue(raw: unknown): ArrQueueSummary {
  const records = (raw as { records?: ArrQueueRecord[] })?.records;
  if (!Array.isArray(records)) {
    const total = Number((raw as { totalRecords?: number })?.totalRecords ?? 0);
    return { ...EMPTY_QUEUE, total };
  }
  const q = { ...EMPTY_QUEUE, total: records.length };
  for (const r of records) {
    const status = (r.status ?? "").toLowerCase();
    const tracked = (r.trackedDownloadStatus ?? "").toLowerCase();
    const state = (r.trackedDownloadState ?? "").toLowerCase();
    if (status === "downloading") q.downloading++;
    else if (status === "paused") q.paused++;
    else if (status === "queued" || status === "delay") q.queued++;
    if (tracked === "warning" && state.includes("stalled")) q.stalled++;
    if (state.includes("importpending") || state.includes("importblocked"))
      q.importPending++;
    if (tracked === "error" || r.errorMessage) q.errored++;
  }
  return q;
}

export function parseArrHealth(raw: unknown): { errors: number; warnings: number } {
  if (!Array.isArray(raw)) return { errors: 0, warnings: 0 };
  let errors = 0;
  let warnings = 0;
  for (const h of raw as Array<{ type?: string }>) {
    const t = (h.type ?? "").toLowerCase();
    if (t === "error") errors++;
    else if (t === "warning") warnings++;
  }
  return { errors, warnings };
}

export function parseArrRootFolders(raw: unknown): ArrRootFolder[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>).map((f) => ({
    path: String(f.path ?? ""),
    freeSpace: Number(f.freeSpace ?? 0),
    accessible: Boolean(f.accessible ?? true),
  }));
}

function arrHeaders(cfg: ServiceConfig): Record<string, string> {
  return { "X-Api-Key": cfg.apiKey ?? "", Accept: "application/json" };
}

export function makeArrPoller(service: "sonarr" | "radarr"): Poller {
  return {
    service,
    configured: (cfg) => Boolean(cfg.url && cfg.apiKey),
    async poll(cfg): Promise<Omit<PollOutcome, "service" | "latencyMs">> {
      const base = cfg.url!.replace(/\/$/, "");
      const headers = arrHeaders(cfg);
      const [queueRes, healthRes, rootRes] = await Promise.all([
        httpFetch(`${base}/api/v3/queue?pageSize=200`, { headers }),
        httpFetch(`${base}/api/v3/health`, { headers }),
        httpFetch(`${base}/api/v3/rootfolder`, { headers }),
      ]);
      if (!queueRes.ok) return { ok: false, error: queueRes.error };

      const queue = parseArrQueue(queueRes.data);
      const health = parseArrHealth(healthRes.data);
      const rootFolders = parseArrRootFolders(rootRes.data);

      return {
        ok: true,
        snapshots: [{ kind: "status", payload: { queue, health, rootFolders } }],
        metrics: [
          { box: service, metric: `${service}.queue.total`, value: queue.total },
          { box: service, metric: `${service}.queue.errored`, value: queue.errored },
          { box: service, metric: `${service}.queue.stalled`, value: queue.stalled },
          { box: service, metric: `${service}.health.errors`, value: health.errors },
        ],
      };
    },
  };
}
