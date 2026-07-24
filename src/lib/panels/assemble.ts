/**
 * Pure assembly: raw DB rows → panel wire payloads. No I/O here so the panel
 * contracts are testable against seeded rows (see __tests__/panels.test.ts);
 * the API routes do the querying and call these.
 */
import type { AgentStats, SmartDrive } from "@/poller/clients/agent";
import type { PlexSessions } from "@/poller/clients/plex";
import type { QbitParsed } from "@/poller/clients/qbittorrent";
import type { SabParsed } from "@/poller/clients/sabnzbd";
import type { ArrParsed } from "@/poller/clients/arr";
import type { TdarrNode } from "@/poller/clients/tdarr";
import type { Machine, Overview, Point, ServiceHealth } from "./schemas";

export interface SnapRow {
  service: string;
  kind: string;
  payload: unknown;
  polledAt: Date;
}

export interface StatusRow {
  service: string;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
  polledAt: Date;
}

export type SeriesMap = Record<string, Point[]>;

/** Hot tier fills at 80 % (valve) — cold tier only alarms at 90 %. */
export const TIER_THRESHOLDS: Record<string, { warn: number; danger: number }> = {
  "/volume2": { warn: 80, danger: 90 },
  "/volume1": { warn: 80, danger: 90 },
};

export const TIER_LABELS: Record<string, string> = {
  "/volume1": "Cold · RAID5+bcache",
  "/volume2": "Hot · NVMe",
};

const AGENT_STALE_MS = 5 * 60 * 1000;

function snap<T>(rows: SnapRow[], service: string, kind: string): { payload: T; polledAt: Date } | null {
  const row = rows.find((r) => r.service === service && r.kind === kind);
  return row ? { payload: row.payload as T, polledAt: row.polledAt } : null;
}

export function toServiceHealth(statuses: StatusRow[]): ServiceHealth[] {
  return statuses
    .slice()
    .sort((a, b) => a.service.localeCompare(b.service))
    .map((s) => ({
      service: s.service,
      ok: s.ok,
      latencyMs: s.latencyMs,
      error: s.error,
      polledAt: s.polledAt.toISOString(),
    }));
}

/**
 * Alert count for the KPI strip (the full alert engine is Segment 06 — this
 * derives the always-true ones): services down, tier valve breaches, D-state
 * processes.
 */
export function deriveAlertCount(
  statuses: StatusRow[],
  agent: AgentStats | null,
): number {
  let n = statuses.filter((s) => !s.ok).length;
  if (agent) {
    for (const fs of agent.filesystems) {
      const t = TIER_THRESHOLDS[fs.path];
      if (t && fs.usedPct >= t.warn) n++;
    }
    if (agent.dstate > 0) n++;
  }
  return n;
}

export function buildOverview(
  statuses: StatusRow[],
  snaps: SnapRow[],
  series: SeriesMap,
  now: Date = new Date(),
): Overview {
  const plex = snap<PlexSessions>(snaps, "plex", "sessions")?.payload ?? null;
  const sab = snap<SabParsed>(snaps, "sabnzbd", "queue")?.payload ?? null;
  const qbit = snap<QbitParsed>(snaps, "qbittorrent", "torrents")?.payload ?? null;
  const sonarr = snap<ArrParsed>(snaps, "sonarr", "status")?.payload ?? null;
  const radarr = snap<ArrParsed>(snaps, "radarr", "status")?.payload ?? null;
  const tdarr =
    snap<{ nodes: TdarrNode[] }>(snaps, "tdarr", "nodes")?.payload ?? null;
  const agentSnap = snap<AgentStats>(snaps, "agent", "stats");
  const agentFresh =
    agentSnap && now.getTime() - agentSnap.polledAt.getTime() < AGENT_STALE_MS;
  const agent = agentSnap?.payload ?? null;

  const transcodeFps = (tdarr?.nodes ?? []).reduce(
    (sum, n) => sum + n.workers.reduce((s, w) => s + w.fps, 0),
    0,
  );

  return {
    generatedAt: now.toISOString(),
    services: toServiceHealth(statuses),
    kpis: {
      streams: plex?.count ?? 0,
      transcodes: plex?.transcode ?? 0,
      downloadSpeedBps: (sab?.speedBps ?? 0) + (qbit?.dlSpeed ?? 0),
      uploadSpeedBps: qbit?.upSpeed ?? 0,
      queueDepth:
        (sab?.queueSize ?? 0) +
        (sonarr?.queue.total ?? 0) +
        (radarr?.queue.total ?? 0),
      transcodeFps: Math.round(transcodeFps),
      alerts: deriveAlertCount(statuses, agent),
    },
    tiers: (agent?.filesystems ?? []).map((fs) => ({
      path: fs.path,
      label: TIER_LABELS[fs.path] ?? fs.path,
      usedPct: fs.usedPct,
      totalBytes: fs.totalBytes,
      usedBytes: fs.usedBytes,
    })),
    vitals:
      agent && agentSnap
        ? {
            box: agent.box,
            cpuBusy: agent.cpuBusy,
            iowait: agent.iowait,
            load1: agent.load1,
            memUsedPct: agent.memUsedPct,
            swapUsedPct: agent.swapUsedPct,
            dstate: agent.dstate,
            bcacheHitPct: agent.bcacheHitPct,
            failedUnits: agent.failedUnits,
            uptimeS: agent.uptimeS,
            netRxMbs: agentFresh ? agent.netRxMbs : 0,
            netTxMbs: agentFresh ? agent.netTxMbs : 0,
            polledAt: agentSnap.polledAt.toISOString(),
            cpuSeries: series["cpu.busy"] ?? [],
            iowaitSeries: series["cpu.iowait"] ?? [],
            netRxSeries: series["net.rx_mbs"] ?? [],
            netTxSeries: series["net.tx_mbs"] ?? [],
          }
        : null,
  };
}

/** The fleet as the dashboard knows it; boxes without an agent render offline. */
export const FLEET = [
  { box: "nas", label: "NAS", service: "agent" },
  { box: "bigbeast", label: "bigbeast", service: "agent-bigbeast" },
  { box: "zenbeast", label: "zenbeast", service: "agent-zenbeast" },
  { box: "dev-beast", label: "dev-beast", service: "agent-devbeast" },
] as const;

export function buildMachine(
  def: (typeof FLEET)[number],
  statuses: StatusRow[],
  snaps: SnapRow[],
  series: SeriesMap,
  now: Date = new Date(),
): Machine {
  const statsSnap = snaps.find(
    (r) => r.kind === "stats" && (r.payload as AgentStats)?.box === def.box,
  );
  const smartSnap = snaps.find(
    (r) => r.service === def.service && r.kind === "smart",
  );
  const status = statuses.find((s) => s.service === def.service);
  const stats = (statsSnap?.payload as AgentStats) ?? null;
  const fresh =
    statsSnap && now.getTime() - statsSnap.polledAt.getTime() < AGENT_STALE_MS;

  const prefix = (m: string) => series[`${def.box}:${m}`] ?? [];

  return {
    box: def.box,
    label: def.label,
    online: Boolean(status?.ok && fresh),
    lastSeen: statsSnap ? statsSnap.polledAt.toISOString() : null,
    stats: stats
      ? {
          cpuBusy: stats.cpuBusy,
          iowait: stats.iowait,
          load1: stats.load1,
          memUsedPct: stats.memUsedPct,
          swapUsedPct: stats.swapUsedPct,
          dstate: stats.dstate,
          netRxMbs: stats.netRxMbs,
          netTxMbs: stats.netTxMbs,
          bcacheHitPct: stats.bcacheHitPct,
          failedUnits: stats.failedUnits,
          uptimeS: stats.uptimeS,
          filesystems: stats.filesystems,
          disks: stats.disks,
        }
      : null,
    smart: smartSnap
      ? ((smartSnap.payload as { drives: SmartDrive[] }).drives ?? [])
      : null,
    series: {
      cpu: prefix("cpu.busy"),
      mem: prefix("mem.used_pct"),
      netRx: prefix("net.rx_mbs"),
      netTx: prefix("net.tx_mbs"),
    },
  };
}
