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
