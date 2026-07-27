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
  Rail,
  RecentStats,
  ServiceHealth,
  StatCard,
  Storage as StoragePanel,
  Streams,
  TdarrPanel,
  TrackerCellWire,
} from "./schemas";
import { workerStage } from "./tdarr-stage";

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
      writebackMbps: series["tdarr.writeback.mbps"] ?? [],
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

/** The bucket kinds the plex-recent poller emits, in carousel display order. */
const RECENT_KINDS: Array<{ kind: string; title: string }> = [
  { kind: "recent-movies", title: "Movies" },
  { kind: "recent-tv", title: "TV Shows" },
  { kind: "recent-anime-movies", title: "Anime Movies" },
  { kind: "recent-anime-tv", title: "Anime TV" },
];

interface RecentSnapPayload {
  machineId?: string;
  items?: Array<{
    ratingKey?: string;
    title?: string;
    thumb?: string;
    addedAt?: number;
    year?: number | null;
    episodeCount?: number;
  }>;
}

/** Plex web deep-link for a library item; "" when the server id is unknown. */
function plexDeepLink(machineId: string, ratingKey: string): string {
  if (!machineId || !ratingKey) return "";
  const key = encodeURIComponent(`/library/metadata/${ratingKey}`);
  return `https://app.plex.tv/desktop/#!/server/${machineId}/details?key=${key}`;
}

/** Route the token-bearing art fetch through our proxy; "" when no thumb. */
function artProxyUrl(thumb: string): string {
  if (!thumb) return "";
  return `/api/plex/art?path=${encodeURIComponent(thumb)}`;
}

/**
 * Map the plex-recent snapshots (one per library section) into the four
 * carousels. Missing sections render as empty carousels rather than vanishing,
 * so the page shape is stable. Items are sorted newest-first — a series with a
 * fresh episode bubbles to the front because Plex stamps its addedAt with the
 * newest leaf.
 */
export function buildRecentlyAdded(
  snaps: SnapRow[],
  now: Date = new Date(),
): {
  generatedAt: string;
  sections: Array<{
    kind: string;
    title: string;
    items: Array<{
      ratingKey: string;
      title: string;
      year: number | null;
      artUrl: string;
      plexUrl: string;
      episodeCount: number;
      addedAt: number;
    }>;
  }>;
} {
  const sections = RECENT_KINDS.map(({ kind, title }) => {
    const payload =
      snap<RecentSnapPayload>(snaps, "plex-recent", kind)?.payload ?? null;
    const machineId = payload?.machineId ?? "";
    const items = (payload?.items ?? [])
      .map((it) => {
        const ratingKey = String(it.ratingKey ?? "");
        return {
          ratingKey,
          title: String(it.title ?? "Untitled"),
          year: it.year != null ? Number(it.year) : null,
          artUrl: artProxyUrl(String(it.thumb ?? "")),
          plexUrl: plexDeepLink(machineId, ratingKey),
          episodeCount: Number(it.episodeCount ?? 0),
          addedAt: Number(it.addedAt ?? 0),
        };
      })
      .sort((a, b) => b.addedAt - a.addedAt);
    return { kind, title, items };
  });
  return { generatedAt: now.toISOString(), sections };
}

/**
 * Rail data: a truthful Ingestion breakdown from Tdarr + a Streams summary from
 * Plex sessions. Reuses the same snapshot rows the Tdarr/Streams panels read.
 *
 * Ingestion honesty rules (do NOT use `workerCount` / `tdarr.workers.active` —
 * those count idle worker slots as active):
 *  - `processing`   = workers whose stage is NOT Idle, across NON-PAUSED nodes.
 *  - `queued`       = sum of `queue.transcode` across non-paused nodes.
 *  - `totalCapacity`= sum of `limits.transcodeCpu + transcodeGpu` across
 *                     non-paused nodes only (a paused node's slots can't run, so
 *                     they must not appear as idle headroom).
 *  - `idleCapacity` = max(0, totalCapacity - processing).
 */
export function buildRail(snaps: SnapRow[], now: Date = new Date()): Rail {
  const tdarr =
    snap<{ nodes: TdarrNode[] }>(snaps, "tdarr", "nodes")?.payload ?? null;
  const liveNodes = (tdarr?.nodes ?? []).filter((n) => !n.paused);

  let processing = 0;
  let queued = 0;
  let totalCapacity = 0;
  for (const n of liveNodes) {
    for (const w of n.workers ?? []) {
      if (workerStage(w.status).label !== "Idle") processing += 1;
    }
    queued += n.queue?.transcode ?? 0;
    const limits = n.limits ?? { transcodeCpu: 0, transcodeGpu: 0 };
    totalCapacity += limits.transcodeCpu + limits.transcodeGpu;
  }
  const idleCapacity = Math.max(0, totalCapacity - processing);

  const plex = snap<PlexSessions>(snaps, "plex", "sessions")?.payload ?? null;
  const bandwidthMbps = plex
    ? Math.round((plex.totalBitrateKbps / 1000) * 10) / 10
    : 0;

  return {
    generatedAt: now.toISOString(),
    ingestion: { processing, queued, idleCapacity, totalCapacity },
    streams: {
      live: plex?.count ?? 0,
      transcodes: plex?.transcode ?? 0,
      bandwidthMbps,
    },
  };
}

/** Poller caps each recent section to this many newest items. A current window
 * at/over this cap is "saturated" — older items may exist but aren't in the
 * snapshot, so a prior-window comparison is unreliable and the trend is hidden. */
const RECENT_SECTION_CAP = 15;
/** Default trend comparison window (seconds). 7 days, matching the mockup. */
const TREND_WINDOW_SECONDS = 7 * 24 * 60 * 60;

/**
 * Compute a stat card from a flat list of item `addedAt` values (unix seconds).
 * Returns `trendPct: null` (→ card shows count only) when the trend is not
 * meaningful: prior window empty, current window saturated at the section cap,
 * or too few items to be anything but noise. Never returns Infinity/NaN.
 */
function statCard(addedAts: number[], nowSeconds: number): StatCard {
  const count = addedAts.length;
  const currentStart = nowSeconds - TREND_WINDOW_SECONDS;
  const priorStart = nowSeconds - 2 * TREND_WINDOW_SECONDS;
  let current = 0;
  let prior = 0;
  for (const t of addedAts) {
    if (t >= currentStart) current += 1;
    else if (t >= priorStart) prior += 1;
  }
  // Meaningfulness gate — runs BEFORE any division.
  const saturated = current >= RECENT_SECTION_CAP;
  if (prior === 0 || saturated || current + prior < 2) {
    return { count, trendPct: null };
  }
  const trendPct = Math.round(((current - prior) / prior) * 100);
  return { count, trendPct };
}

/** unix-seconds addedAt list for one plex-recent section. */
function sectionAddedAts(snaps: SnapRow[], kind: string): number[] {
  const payload =
    snap<RecentSnapPayload>(snaps, "plex-recent", kind)?.payload ?? null;
  return (payload?.items ?? []).map((it) => Number(it.addedAt ?? 0));
}

/**
 * Four stat cards for the /recently-added header, read from the four separate
 * plex-recent snapshot rows (there is no unified items[] snapshot). Counts are
 * always exact; trends are conditional (see `statCard`).
 *
 * NOTE: TV/anime rows are series-level cards (one per series, each with an
 * episodeCount) — `newShows` counts series with recent activity, not episodes
 * added. `recentItems` is the count in the capped recent window (≤ 60), not a
 * full-library total; the fourth card is labeled "Recent Items" to stay honest.
 */
export function buildRecentStats(
  snaps: SnapRow[],
  now: Date = new Date(),
): RecentStats {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const movies = sectionAddedAts(snaps, "recent-movies");
  const tv = sectionAddedAts(snaps, "recent-tv");
  const animeMovies = sectionAddedAts(snaps, "recent-anime-movies");
  const animeTv = sectionAddedAts(snaps, "recent-anime-tv");
  const anime = [...animeMovies, ...animeTv];
  const all = [...movies, ...tv, ...animeMovies, ...animeTv];
  return {
    newMovies: statCard(movies, nowSeconds),
    newShows: statCard(tv, nowSeconds),
    animeAdded: statCard(anime, nowSeconds),
    recentItems: statCard(all, nowSeconds),
  };
}
