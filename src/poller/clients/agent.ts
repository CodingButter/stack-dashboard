/**
 * NAS agent (and GPU-node variant) hardware stats. Bearer-token auth against the
 * agent's /stats endpoint. This is the box-level telemetry source: cpu/iowait,
 * memory+swap, per-device disk util/await, bcache hit ratio, filesystem tier
 * fill, network, D-state, failed units. The agent already did the /proc parsing
 * (Segment 02) — this client just normalizes its JSON into snapshot + metric
 * rows, scoped to `box` so multiple agents (nas, bigbeast, ...) coexist.
 */
import type { Poller } from "../registry";
import type { PollOutcome } from "../persist";
import { httpFetch } from "./http";

export interface AgentStats {
  box: string;
  cpuBusy: number;
  iowait: number;
  load1: number;
  memUsedPct: number;
  swapUsedPct: number;
  dstate: number;
  netRxMbs: number;
  netTxMbs: number;
  bcacheHitPct: number;
  failedUnits: number;
  uptimeS: number;
  filesystems: Array<{
    path: string;
    usedPct: number;
    totalBytes: number;
    usedBytes: number;
  }>;
  disks: Array<{ device: string; utilPct: number; awaitMs: number }>;
}

export function parseAgentStats(raw: unknown, box: string): AgentStats {
  const s = (raw ?? {}) as Record<string, any>;
  const disks = s.disks && typeof s.disks === "object" ? s.disks : {};
  const fs = Array.isArray(s.filesystems) ? s.filesystems : [];
  return {
    box,
    cpuBusy: Number(s.cpu?.busy_pct ?? 0),
    iowait: Number(s.cpu?.iowait_pct ?? 0),
    load1: Number(s.loadavg?.load1 ?? 0),
    memUsedPct: Number(s.memory?.mem_used_pct ?? 0),
    swapUsedPct: Number(s.memory?.swap_used_pct ?? 0),
    dstate: Number(s.dstate ?? 0),
    netRxMbs: Number(s.net?.rx_mbs ?? 0),
    netTxMbs: Number(s.net?.tx_mbs ?? 0),
    bcacheHitPct: Number(s.bcache?.hit_ratio_pct ?? 0),
    failedUnits: Number(s.failed_units?.count ?? 0),
    uptimeS: Number(s.uptime?.uptime_s ?? 0),
    filesystems: fs.map((f: Record<string, unknown>) => ({
      path: String(f.path ?? ""),
      usedPct: Number(f.used_pct ?? 0),
      totalBytes: Number(f.total_bytes ?? 0),
      usedBytes: Number(f.used_bytes ?? 0),
    })),
    disks: Object.entries(disks).map(([device, d]) => ({
      device,
      utilPct: Number((d as Record<string, unknown>).util_pct ?? 0),
      awaitMs: Number((d as Record<string, unknown>).await_ms ?? 0),
    })),
  };
}

export interface SmartDrive {
  device: string;
  healthy: boolean | null;
  temperatureC: number | null;
  powerOnHours: number | null;
  model: string;
  sparePct: number | null;
  mediaErrors: number | null;
}

export function parseAgentSmart(raw: unknown): SmartDrive[] {
  const devices = (raw as { devices?: Record<string, Record<string, any>> })
    ?.devices;
  if (!devices || typeof devices !== "object") return [];
  return Object.entries(devices).map(([device, d]) => ({
    device,
    healthy: typeof d.healthy === "boolean" ? d.healthy : null,
    temperatureC: d.temperature_c ?? null,
    powerOnHours: d.power_on_hours ?? null,
    model: String(d.model ?? ""),
    sparePct: d.nvme?.available_spare ?? null,
    mediaErrors: d.nvme?.media_errors ?? null,
  }));
}

export interface AgentGpu {
  mode: string;
  utilPct: number | null;
  encoderPct: number | null;
  decoderPct: number | null;
  vramUsedMb: number | null;
  vramTotalMb: number | null;
  tempC: number | null;
  powerW: number | null;
}

/**
 * Normalize the agent /gpu snapshot. Only the nvidia shape carries the scalar
 * fields the fleet Tdarr boxes report; intel/none/error return nulls (the
 * caller emits no gpu metrics in that case). Returns null when there is no
 * usable GPU reading at all.
 */
export function parseAgentGpu(raw: unknown): AgentGpu | null {
  const g = raw as Record<string, any> | null;
  if (!g || typeof g !== "object") return null;
  const mode = String(g.mode ?? "none");
  if (mode !== "nvidia") return null; // intel/none/error carry no scalar util
  if (g.error) return null;
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    mode,
    utilPct: num(g.util_pct),
    encoderPct: num(g.encoder_pct),
    decoderPct: num(g.decoder_pct),
    vramUsedMb: num(g.vram_used_mb),
    vramTotalMb: num(g.vram_total_mb),
    tempC: num(g.temp_c),
    powerW: num(g.power_w),
  };
}

/** Build an agent poller for a given box (nas, bigbeast, ...). */
export function makeAgentPoller(service: string, box: string): Poller {
  return {
    service,
    configured: (cfg) => Boolean(cfg.url && cfg.apiKey),
    async poll(cfg): Promise<Omit<PollOutcome, "service" | "latencyMs">> {
      const base = cfg.url!.replace(/\/$/, "");
      const headers = { Authorization: `Bearer ${cfg.apiKey ?? ""}` };
      const res = await httpFetch(`${base}/stats`, { headers });
      if (!res.ok) return { ok: false, error: res.error };

      // Best-effort: the agent caches SMART for 30 min, so this is a cheap
      // local read. A SMART failure never fails the stats poll.
      const smartRes = await httpFetch(`${base}/smart`, { headers });
      // Container inventory — the log puller discovers docker log sources
      // from this snapshot, so it must be persisted every cycle.
      const dockerRes = await httpFetch(`${base}/docker`, { headers });
      // GPU telemetry (nvidia on the fleet Tdarr boxes; "none" on the NAS —
      // harmless, yields no gpu metrics). Cached 10 s agent-side; cheap.
      const gpuRes = await httpFetch(`${base}/gpu`, { headers });

      const stats = parseAgentStats(res.data, box);
      const metrics = [
        { box, metric: "cpu.busy", value: stats.cpuBusy },
        { box, metric: "cpu.iowait", value: stats.iowait },
        { box, metric: "load1", value: stats.load1 },
        { box, metric: "mem.used_pct", value: stats.memUsedPct },
        { box, metric: "swap.used_pct", value: stats.swapUsedPct },
        { box, metric: "dstate", value: stats.dstate },
        { box, metric: "net.rx_mbs", value: stats.netRxMbs },
        { box, metric: "net.tx_mbs", value: stats.netTxMbs },
        { box, metric: "bcache.hit_pct", value: stats.bcacheHitPct },
        { box, metric: "failed_units", value: stats.failedUnits },
        ...stats.filesystems.map((f) => ({
          box,
          metric: `fs.used_pct${f.path}`,
          value: f.usedPct,
        })),
        ...stats.disks.map((d) => ({
          box,
          metric: `disk.util.${d.device}`,
          value: d.utilPct,
        })),
      ];
      const snapshotRows: Array<{ kind: string; payload: unknown }> = [
        { kind: "stats", payload: stats },
      ];
      if (smartRes.ok) {
        snapshotRows.push({
          kind: "smart",
          payload: { drives: parseAgentSmart(smartRes.data) },
        });
      }
      if (dockerRes.ok && dockerRes.data && typeof dockerRes.data === "object") {
        snapshotRows.push({ kind: "docker", payload: dockerRes.data });
      }
      if (gpuRes.ok) {
        const gpu = parseAgentGpu(gpuRes.data);
        if (gpu) {
          snapshotRows.push({ kind: "gpu", payload: gpu });
          const gpuMetric = (metric: string, value: number | null) =>
            value == null ? [] : [{ box, metric, value }];
          metrics.push(
            ...gpuMetric("gpu_util", gpu.utilPct),
            ...gpuMetric("gpu.encoder_pct", gpu.encoderPct),
            ...gpuMetric("gpu.decoder_pct", gpu.decoderPct),
            ...gpuMetric("gpu.vram_used_mb", gpu.vramUsedMb),
            ...gpuMetric("gpu.temp_c", gpu.tempC),
            ...gpuMetric("gpu.power_w", gpu.powerW),
          );
        }
      }
      return { ok: true, snapshots: snapshotRows, metrics };
    },
  };
}
