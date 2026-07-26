import { z } from "zod";

/**
 * Wire contracts for the panel API routes. Route handlers parse their
 * response through these before sending, so the client and tests share one
 * source of truth.
 */

export const pointSchema = z.object({ at: z.string(), v: z.number() });
export type Point = z.infer<typeof pointSchema>;

export const serviceHealthSchema = z.object({
  service: z.string(),
  ok: z.boolean(),
  latencyMs: z.number().nullable(),
  error: z.string().nullable(),
  polledAt: z.string(),
});
export type ServiceHealth = z.infer<typeof serviceHealthSchema>;

export const tierSchema = z.object({
  path: z.string(),
  label: z.string(),
  usedPct: z.number(),
  totalBytes: z.number(),
  usedBytes: z.number(),
});
export type Tier = z.infer<typeof tierSchema>;

export const overviewSchema = z.object({
  generatedAt: z.string(),
  services: z.array(serviceHealthSchema),
  kpis: z.object({
    streams: z.number(),
    transcodes: z.number(),
    downloadSpeedBps: z.number(),
    uploadSpeedBps: z.number(),
    queueDepth: z.number(),
    transcodeFps: z.number(),
    alerts: z.number(),
  }),
  tiers: z.array(tierSchema),
  vitals: z
    .object({
      box: z.string(),
      cpuBusy: z.number(),
      iowait: z.number(),
      load1: z.number(),
      memUsedPct: z.number(),
      swapUsedPct: z.number(),
      dstate: z.number(),
      bcacheHitPct: z.number(),
      failedUnits: z.number(),
      uptimeS: z.number(),
      netRxMbs: z.number(),
      netTxMbs: z.number(),
      polledAt: z.string(),
      cpuSeries: z.array(pointSchema),
      iowaitSeries: z.array(pointSchema),
      netRxSeries: z.array(pointSchema),
      netTxSeries: z.array(pointSchema),
    })
    .nullable(),
});
export type Overview = z.infer<typeof overviewSchema>;

export const smartDriveSchema = z.object({
  device: z.string(),
  healthy: z.boolean().nullable(),
  temperatureC: z.number().nullable(),
  powerOnHours: z.number().nullable(),
  model: z.string(),
  sparePct: z.number().nullable(),
  mediaErrors: z.number().nullable(),
});
export type SmartDriveWire = z.infer<typeof smartDriveSchema>;

export const machineSchema = z.object({
  box: z.string(),
  label: z.string(),
  online: z.boolean(),
  lastSeen: z.string().nullable(),
  stats: z
    .object({
      cpuBusy: z.number(),
      iowait: z.number(),
      load1: z.number(),
      memUsedPct: z.number(),
      swapUsedPct: z.number(),
      dstate: z.number(),
      netRxMbs: z.number(),
      netTxMbs: z.number(),
      bcacheHitPct: z.number(),
      failedUnits: z.number(),
      uptimeS: z.number(),
      filesystems: z.array(
        z.object({
          path: z.string(),
          usedPct: z.number(),
          totalBytes: z.number(),
          usedBytes: z.number(),
        }),
      ),
      disks: z.array(
        z.object({ device: z.string(), utilPct: z.number(), awaitMs: z.number() }),
      ),
    })
    .nullable(),
  smart: z.array(smartDriveSchema).nullable(),
  series: z.object({
    cpu: z.array(pointSchema),
    mem: z.array(pointSchema),
    netRx: z.array(pointSchema),
    netTx: z.array(pointSchema),
  }),
});
export type Machine = z.infer<typeof machineSchema>;

export const machinesSchema = z.object({
  generatedAt: z.string(),
  boxes: z.array(machineSchema),
});
export type Machines = z.infer<typeof machinesSchema>;

/** One uptime-tracker cell per historical poll, oldest → newest. */
export const trackerCellSchema = z.object({
  state: z.enum(["up", "degraded", "down", "empty"]),
  tooltip: z.string().optional(),
});
export type TrackerCellWire = z.infer<typeof trackerCellSchema>;

export const uptimeMapSchema = z.record(z.string(), z.array(trackerCellSchema));

export const streamsSchema = z.object({
  generatedAt: z.string(),
  uptime: uptimeMapSchema,
  plex: z
    .object({
      count: z.number(),
      directPlay: z.number(),
      transcode: z.number(),
      totalBitrateKbps: z.number(),
      sessions: z.array(
        z.object({
          sessionId: z.string().default(""),
          title: z.string(),
          user: z.string(),
          player: z.string(),
          state: z.string(),
          decision: z.enum(["transcode", "directplay"]),
          progressPct: z.number(),
          bandwidthKbps: z.number(),
        }),
      ),
    })
    .nullable(),
  tautulli: z
    .object({
      streamCount: z.number(),
      directPlay: z.number(),
      directStream: z.number(),
      transcode: z.number(),
      totalBandwidth: z.number(),
      lanBandwidth: z.number(),
      wanBandwidth: z.number(),
    })
    .nullable(),
  series: z.object({
    sessions: z.array(pointSchema),
    bitrateKbps: z.array(pointSchema),
  }),
});
export type Streams = z.infer<typeof streamsSchema>;

export const downloadsSchema = z.object({
  generatedAt: z.string(),
  uptime: uptimeMapSchema,
  sab: z
    .object({
      paused: z.boolean(),
      status: z.string(),
      speedBps: z.number(),
      mbLeft: z.number(),
      queueSize: z.number(),
      timeLeft: z.string(),
      speedLimitPct: z.number(),
      diskFreeGb: z.number(),
      jobs: z.array(
        z.object({
          name: z.string(),
          percent: z.number(),
          mbLeft: z.number(),
          timeLeft: z.string(),
          status: z.string(),
        }),
      ),
      totals: z
        .object({
          total: z.number(),
          month: z.number(),
          week: z.number(),
          day: z.number(),
        })
        .nullable(),
    })
    .nullable(),
  qbit: z
    .object({
      total: z.number(),
      downloading: z.number(),
      seeding: z.number(),
      stalled: z.number(),
      errored: z.number(),
      seedboost: z.number(),
      dlSpeed: z.number(),
      upSpeed: z.number(),
      byCategory: z.record(z.string(), z.number()),
    })
    .nullable(),
  series: z.object({
    sabSpeedBps: z.array(pointSchema),
    qbitDlSpeed: z.array(pointSchema),
    qbitUpSpeed: z.array(pointSchema),
  }),
});
export type Downloads = z.infer<typeof downloadsSchema>;

const arrAppSchema = z
  .object({
    queue: z.object({
      total: z.number(),
      downloading: z.number(),
      paused: z.number(),
      queued: z.number(),
      stalled: z.number(),
      importPending: z.number(),
      errored: z.number(),
    }),
    health: z.object({ errors: z.number(), warnings: z.number() }),
    rootFolders: z.array(
      z.object({
        path: z.string(),
        freeSpace: z.number(),
        accessible: z.boolean(),
      }),
    ),
  })
  .nullable();

export const arrSchema = z.object({
  generatedAt: z.string(),
  uptime: uptimeMapSchema,
  sonarr: arrAppSchema,
  radarr: arrAppSchema,
  prowlarr: z
    .object({
      total: z.number(),
      enabled: z.number(),
      indexers: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          enabled: z.boolean(),
          priority: z.number(),
          protocol: z.string(),
          privacy: z.string(),
          /** From indexerstatus — set when backed off (IPTorrents daily cap). */
          disabledTill: z.string().nullable(),
          failure: z.string().nullable(),
        }),
      ),
    })
    .nullable(),
  seerr: z
    .object({
      total: z.number(),
      pending: z.number(),
      approved: z.number(),
      declined: z.number(),
      processing: z.number(),
      available: z.number(),
    })
    .nullable(),
});
export type Arr = z.infer<typeof arrSchema>;

export const tdarrPanelSchema = z.object({
  generatedAt: z.string(),
  uptime: uptimeMapSchema,
  stats: z
    .object({
      totalFiles: z.number(),
      totalTranscodes: z.number(),
      totalHealthChecks: z.number(),
      sizeDiffGb: z.number(),
      tdarrScore: z.number(),
      healthCheckScore: z.number(),
    })
    .nullable(),
  nodes: z.array(
    z.object({
      nodeName: z.string(),
      paused: z.boolean(),
      workerCount: z.number(),
      queue: z.object({ transcode: z.number(), healthcheck: z.number() }),
      limits: z.object({ transcodeCpu: z.number(), transcodeGpu: z.number() }),
      /** NAS node must never run >1 GPU or any CPU transcode worker. */
      limitViolation: z.boolean(),
      workers: z.array(
        z.object({
          file: z.string(),
          percent: z.number(),
          fps: z.number(),
          eta: z.string(),
          status: z.string(),
        }),
      ),
    }),
  ),
  series: z.object({
    queueDepth: z.array(pointSchema),
    workersActive: z.array(pointSchema),
  }),
  /**
   * Tdarr I/O governor state (from the NAS tdarr-gate service via the agent).
   * `null` = the dashboard has never received a governor snapshot (endpoint not
   * deployed yet / never polled). `running:false` = the snapshot exists but the
   * gate service is dead/stale — a distinct, first-class UI state.
   */
  governor: z
    .object({
      running: z.boolean(),
      ts: z.number().nullable(),
      ageSecs: z.number().nullable(),
      pollSecs: z.number(),
      mode: z.enum(["streaming", "governing", "idle"]),
      frozen: z.boolean(),
      activeStreams: z.number(),
      streamKbps: z.number(),
      sabLimitMbps: z.number().nullable(),
      laneMaxSecs: z.number(),
      laneHolder: z.string().nullable(),
      heavyNodes: z.array(z.string()),
      governorPausedNodes: z.array(z.string()),
      nodes: z.array(
        z.object({
          name: z.string(),
          exempt: z.boolean(),
          paused: z.boolean(),
          pausedByGovernor: z.boolean(),
          heavy: z.boolean(),
          writing: z.boolean(),
          laneHeldSecs: z.number().nullable(),
          workerCount: z.number(),
          workerStatuses: z.array(z.string()),
        }),
      ),
    })
    .nullable(),
});
export type TdarrPanel = z.infer<typeof tdarrPanelSchema>;

export const storageSchema = z.object({
  generatedAt: z.string(),
  uptime: uptimeMapSchema,
  tiers: z.array(tierSchema),
  disks: z.array(
    z.object({ device: z.string(), utilPct: z.number(), awaitMs: z.number() }),
  ),
  bcacheHitPct: z.number().nullable(),
  smart: z.array(smartDriveSchema),
  rootFolders: z.array(
    z.object({
      app: z.string(),
      path: z.string(),
      freeSpace: z.number(),
      accessible: z.boolean(),
    }),
  ),
  series: z.object({
    vol1UsedPct: z.array(pointSchema),
    vol2UsedPct: z.array(pointSchema),
    bcacheHitPct: z.array(pointSchema),
  }),
});
export type Storage = z.infer<typeof storageSchema>;
