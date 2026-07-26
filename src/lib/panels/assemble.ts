/**
 * Pure assembly: raw DB rows → panel wire payloads. No I/O here so the panel
 * contracts are testable against seeded rows (see __tests__/panels.test.ts);
 * the API routes do the querying and call these.
 */
import type {
  AgentStats,
  GovernorStatus,
  SmartDrive,
} from "@/poller/clients/agent";
import type { PlexSessions } from "@/poller/clients/plex";
import type { QbitParsed } from "@/poller/clients/qbittorrent";
import type { SabParsed, SabTotals } from "@/poller/clients/sabnzbd";
import type { ArrParsed } from "@/poller/clients/arr";
import type { ProwlarrParsed } from "@/poller/clients/prowlarr";
import type { SeerrCounts } from "@/poller/clients/seerr";
import type { TautulliActivity } from "@/poller/clients/tautulli";
import type { TdarrNode, TdarrStats } from "@/poller/clients/tdarr";
import type {
  Arr,
  Downloads,
  Machine,
  Overview,
  Point,
  ServiceHealth,
  Storage as StoragePanel,
  Streams,
  TdarrPanel,
  TrackerCellWire,
} from "./schemas";

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

/** Poll history → tracker cells (oldest → newest), padded to `cells` wide. */
export function toUptimeCells(
  history: StatusRow[],
  cells = 40,
): TrackerCellWire[] {
  const mapped: TrackerCellWire[] = history.slice(-cells).map((h) => ({
    state: h.ok ? ((h.latencyMs ?? 0) > 2000 ? "degraded" : "up") : "down",
    tooltip: `${h.polledAt.toISOString()} · ${h.ok ? `${h.latencyMs ?? 0} ms` : (h.error ?? "down")}`,
  }));
  while (mapped.length < cells) mapped.unshift({ state: "empty" });
  return mapped;
}

export function buildUptimeMap(
  historyByService: Record<string, StatusRow[]>,
  services: string[],
): Record<string, TrackerCellWire[]> {
  const out: Record<string, TrackerCellWire[]> = {};
  for (const s of services) out[s] = toUptimeCells(historyByService[s] ?? []);
  return out;
}

export function buildStreams(
  snaps: SnapRow[],
  series: SeriesMap,
  uptime: Record<string, TrackerCellWire[]>,
  now: Date = new Date(),
): Streams {
  const plex = snap<PlexSessions>(snaps, "plex", "sessions")?.payload ?? null;
  const tautulli =
    snap<TautulliActivity>(snaps, "tautulli", "activity")?.payload ?? null;
  return {
    generatedAt: now.toISOString(),
    uptime,
    plex: plex
      ? {
          count: plex.count,
          directPlay: plex.directPlay,
          transcode: plex.transcode,
          totalBitrateKbps: plex.totalBitrateKbps,
          // Older snapshots predate session detail — degrade to empty list.
          sessions: plex.sessions ?? [],
        }
      : null,
    tautulli,
    series: {
      sessions: series["plex.sessions"] ?? [],
      bitrateKbps: series["plex.bitrate_kbps"] ?? [],
    },
  };
}

export function buildDownloads(
  snaps: SnapRow[],
  series: SeriesMap,
  uptime: Record<string, TrackerCellWire[]>,
  now: Date = new Date(),
): Downloads {
  const sab =
    snap<SabParsed & { totals?: SabTotals }>(snaps, "sabnzbd", "queue")
      ?.payload ?? null;
  const qbit = snap<QbitParsed>(snaps, "qbittorrent", "torrents")?.payload ?? null;
  return {
    generatedAt: now.toISOString(),
    uptime,
    sab: sab
      ? {
          paused: sab.paused,
          status: sab.status,
          speedBps: sab.speedBps,
          mbLeft: sab.mbLeft,
          queueSize: sab.queueSize,
          timeLeft: sab.timeLeft,
          speedLimitPct: sab.speedLimitPct,
          diskFreeGb: sab.diskFreeGb,
          jobs: sab.jobs,
          totals: sab.totals ?? null,
        }
      : null,
    qbit,
    series: {
      sabSpeedBps: series["sabnzbd.speed_bps"] ?? [],
      qbitDlSpeed: series["qbittorrent.dl_speed"] ?? [],
      qbitUpSpeed: series["qbittorrent.up_speed"] ?? [],
    },
  };
}

export function buildArr(
  snaps: SnapRow[],
  uptime: Record<string, TrackerCellWire[]>,
  now: Date = new Date(),
): Arr {
  const prowlarr =
    snap<ProwlarrParsed>(snaps, "prowlarr", "indexers")?.payload ?? null;
  const statusById = new Map(
    (prowlarr?.rateLimited ?? []).map((s) => [s.indexerId, s]),
  );
  return {
    generatedAt: now.toISOString(),
    uptime,
    sonarr: snap<ArrParsed>(snaps, "sonarr", "status")?.payload ?? null,
    radarr: snap<ArrParsed>(snaps, "radarr", "status")?.payload ?? null,
    prowlarr: prowlarr
      ? {
          total: prowlarr.total,
          enabled: prowlarr.enabled,
          indexers: prowlarr.indexers.map((i) => ({
            ...i,
            disabledTill: statusById.get(i.id)?.disabledTill ?? null,
            failure: statusById.get(i.id)?.mostRecentFailure ?? null,
          })),
        }
      : null,
    seerr: snap<SeerrCounts>(snaps, "seerr", "requests")?.payload ?? null,
  };
}

/** The NAS Tdarr node must stay ≤1 GPU worker and 0 CPU workers (I/O box). */
export const NAS_TDARR_NODE = "NasTNode";

export function nodeLimitViolation(n: TdarrNode): boolean {
  if (n.nodeName !== NAS_TDARR_NODE) return false;
  return n.limits.transcodeGpu > 1 || n.limits.transcodeCpu > 0;
}

export function buildTdarrPanel(
  snaps: SnapRow[],
  series: SeriesMap,
  uptime: Record<string, TrackerCellWire[]>,
  now: Date = new Date(),
): TdarrPanel {
  const payload =
    snap<{ nodes: TdarrNode[]; stats: TdarrStats }>(snaps, "tdarr", "nodes")
      ?.payload ?? null;
  return {
    generatedAt: now.toISOString(),
    uptime,
    stats: payload?.stats ?? null,
    nodes: (payload?.nodes ?? [])
      .slice()
      .sort((a, b) => a.nodeName.localeCompare(b.nodeName))
      .map((n) => ({
        nodeName: n.nodeName,
        paused: n.paused,
        workerCount: n.workerCount,
        queue: n.queue,
        // Pre-limits snapshots degrade to zeros (no violation flagged).
        limits: n.limits ?? { transcodeCpu: 0, transcodeGpu: 0 },
        limitViolation: n.limits ? nodeLimitViolation(n) : false,
        workers: n.workers,
      })),
    series: {
      queueDepth: series["tdarr.queue.depth"] ?? [],
      workersActive: series["tdarr.workers.active"] ?? [],
    },
    governor: buildGovernor(snaps, now),
  };
}

/**
 * Governor block for the Tdarr panel. `null` = never received a snapshot
 * (endpoint not deployed / never polled) → UI shows "governor unavailable".
 * Otherwise carry `running` through (false = gate dead/stale). `ageSecs` is the
 * live age of the emitter's `ts` for the UI's staleness readout. As a second
 * guard, if the *snapshot row itself* is older than the agent-stale window (the
 * poller stopped persisting governor rows), force running:false — a wedged
 * poller must not render a frozen "running" governor as live.
 */
function buildGovernor(
  snaps: SnapRow[],
  now: Date,
): TdarrPanel["governor"] {
  const row = snap<GovernorStatus>(snaps, "agent", "governor");
  if (!row) return null;
  const g = row.payload;
  const ageSecs = g.ts == null ? null : Math.round(now.getTime() / 1000 - g.ts);
  const rowStale = now.getTime() - row.polledAt.getTime() > AGENT_STALE_MS;
  const running = g.running && !rowStale;
  return {
    running,
    ts: g.ts,
    ageSecs,
    pollSecs: g.pollSecs,
    mode: g.mode,
    frozen: g.frozen,
    activeStreams: g.activeStreams,
    streamKbps: g.streamKbps,
    sabLimitMbps: g.sabLimitMbps,
    laneMaxSecs: g.laneMaxSecs,
    laneHolder: g.laneHolder,
    heavyNodes: g.heavyNodes,
    governorPausedNodes: g.governorPausedNodes,
    nodes: g.nodes,
  };
}

export function buildStorage(
  snaps: SnapRow[],
  series: SeriesMap,
  uptime: Record<string, TrackerCellWire[]>,
  now: Date = new Date(),
): StoragePanel {
  const agent = snap<AgentStats>(snaps, "agent", "stats")?.payload ?? null;
  const smart =
    snap<{ drives: SmartDrive[] }>(snaps, "agent", "smart")?.payload.drives ??
    [];
  const rootFolders = (["sonarr", "radarr"] as const).flatMap((app) =>
    (snap<ArrParsed>(snaps, app, "status")?.payload.rootFolders ?? []).map(
      (rf) => ({ app, ...rf }),
    ),
  );
  return {
    generatedAt: now.toISOString(),
    uptime,
    tiers: (agent?.filesystems ?? []).map((fs) => ({
      path: fs.path,
      label: TIER_LABELS[fs.path] ?? fs.path,
      usedPct: fs.usedPct,
      totalBytes: fs.totalBytes,
      usedBytes: fs.usedBytes,
    })),
    disks: agent?.disks ?? [],
    bcacheHitPct: agent?.bcacheHitPct ?? null,
    smart,
    rootFolders,
    series: {
      vol1UsedPct: series["fs.used_pct/volume1"] ?? [],
      vol2UsedPct: series["fs.used_pct/volume2"] ?? [],
      bcacheHitPct: series["bcache.hit_pct"] ?? [],
    },
  };
}
