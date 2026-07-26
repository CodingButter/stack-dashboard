/**
 * Tdarr. Two GET endpoints (x-api-key header, port 8266):
 *  - /api/v2/get-nodes  → object keyed by EPHEMERAL node _id; the stable handle
 *    is `nodeName`. Node IDs regenerate on every reconnect, so this client keys
 *    everything by nodeName and never persists an _id (the node-ID footgun,
 *    proven on this stack). Node-targeted *actions* live in Segment 05 and must
 *    re-resolve the id from this endpoint at execution time.
 *  - global statistics (cruddb StatisticsJSONDB) → totals + tdarr score.
 */
import type { Poller } from "../registry";
import type { PollOutcome } from "../persist";
import { httpFetch } from "./http";

export interface TdarrWorker {
  file: string;
  percent: number;
  fps: number;
  eta: string;
  status: string;
}

export interface TdarrNode {
  nodeName: string;
  paused: boolean;
  workerCount: number;
  workers: TdarrWorker[];
  queue: { transcode: number; healthcheck: number };
}

export interface TdarrStats {
  totalFiles: number;
  totalTranscodes: number;
  totalHealthChecks: number;
  sizeDiffGb: number;
  tdarrScore: number;
  healthCheckScore: number;
}

/** Key by nodeName — never by the ephemeral `_id`. */
export function parseTdarrNodes(raw: unknown): TdarrNode[] {
  if (!raw || typeof raw !== "object") return [];
  const nodes: TdarrNode[] = [];
  for (const entry of Object.values(raw as Record<string, unknown>)) {
    const n = entry as Record<string, unknown>;
    if (!n || typeof n !== "object" || !n.nodeName) continue;
    const workersRaw = (n.workers ?? {}) as Record<string, Record<string, unknown>>;
    const workers: TdarrWorker[] = Object.values(workersRaw).map((w) => ({
      file: String(w.file ?? ""),
      percent: Number(w.percentage ?? 0),
      fps: Number(w.fps ?? 0),
      eta: String(w.ETA ?? ""),
      status: String(w.status ?? ""),
    }));
    const ql = (n.queueLengths ?? {}) as Record<string, number>;
    nodes.push({
      nodeName: String(n.nodeName),
      paused: Boolean(n.nodePaused ?? false),
      workerCount: workers.length,
      workers,
      queue: {
        transcode: Number(ql.transcodecpu ?? 0) + Number(ql.transcodegpu ?? 0),
        healthcheck: Number(ql.healthcheckcpu ?? 0) + Number(ql.healthcheckgpu ?? 0),
      },
    });
  }
  return nodes;
}

export function parseTdarrStats(raw: unknown): TdarrStats {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    totalFiles: Number(s.totalFileCount ?? 0),
    totalTranscodes: Number(s.totalTranscodeCount ?? 0),
    totalHealthChecks: Number(s.totalHealthCheckCount ?? 0),
    sizeDiffGb: Number(s.sizeDiff ?? 0),
    tdarrScore: Number(s.tdarrScore ?? 0),
    healthCheckScore: Number(s.healthCheckScore ?? 0),
  };
}

export const tdarrPoller: Poller = {
  service: "tdarr",
  configured: (cfg) => Boolean(cfg.url && cfg.apiKey),
  async poll(cfg): Promise<Omit<PollOutcome, "service" | "latencyMs">> {
    const base = cfg.url!.replace(/\/$/, "");
    const headers = { "x-api-key": cfg.apiKey ?? "", Accept: "application/json" };
    const nodesRes = await httpFetch(`${base}/api/v2/get-nodes`, { headers });
    if (!nodesRes.ok) return { ok: false, error: nodesRes.error };

    const statsRes = await httpFetch(`${base}/api/v2/cruddb`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        data: { collection: "StatisticsJSONDB", mode: "getById", docID: "statistics" },
      }),
    });

    const nodes = parseTdarrNodes(nodesRes.data);
    const stats = parseTdarrStats(statsRes.data);
    const activeWorkers = nodes.reduce((n, x) => n + x.workerCount, 0);
    const queueDepth = nodes.reduce((n, x) => n + x.queue.transcode, 0);

    return {
      ok: true,
      snapshots: [{ kind: "nodes", payload: { nodes, stats } }],
      metrics: [
        { box: "tdarr", metric: "tdarr.nodes.online", value: nodes.filter((n) => !n.paused).length },
        { box: "tdarr", metric: "tdarr.workers.active", value: activeWorkers },
        { box: "tdarr", metric: "tdarr.queue.depth", value: queueDepth },
        { box: "tdarr", metric: "tdarr.score", value: stats.tdarrScore },
      ],
    };
  },
};
