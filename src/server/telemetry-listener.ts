/**
 * UDP live-telemetry listener (see AGENT_HANDOFF_udp-telemetry.md, envelope schema 1).
 *
 * A daemon on the NAS blasts one complete self-contained JSON snapshot per UDP
 * datagram at ~2 Hz. This listener binds the socket, keeps only the freshest
 * snapshot (highest `seq`), and notifies subscribers (the WS fan-out) on every
 * accepted update — including the transition to `disconnected` when the feed
 * goes silent past its staleness window.
 *
 * Design notes:
 * - Latest-wins. A datagram with a lower `seq` than the one we hold is a
 *   late/reordered packet and is dropped. On daemon restart `seq` resets to 0;
 *   we detect that (seq dropped a lot AND sent_ts moved forward) and adopt the
 *   new run rather than ignoring it forever.
 * - Staleness is time-based off `sent_ts`, re-checked on a timer so the UI flips
 *   to disconnected even if no new datagram ever arrives.
 * - Malformed datagrams are ignored (never throw) — a bad packet must not take
 *   down the socket.
 * - No secrets ride this path; nothing is logged from the payload body.
 */
import dgram from "node:dgram";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { parseAgentGovernor, type GovernorStatus } from "@/poller/clients/agent";

/**
 * Datagrams may be gzip'd: raw JSON (1.7–2.3KB for a multi-node governor) exceeds
 * the ~1280-byte WireGuard MTU, so the blaster gzips to ~600B. Detection is
 * self-describing via the gzip magic bytes (0x1f 0x8b) — plain-JSON senders stay
 * supported. Returns UTF-8 JSON text either way.
 */
function decodeDatagram(msg: Buffer): string {
  if (msg.length >= 2 && msg[0] === 0x1f && msg[1] === 0x8b) {
    return gunzipSync(msg).toString("utf8");
  }
  return msg.toString("utf8");
}

/** Envelope schema 1 — the blast wrapper. `governor` stays raw here and is run
 * through the existing parseAgentGovernor() so we reuse the schema-3 logic. */
const netSchema = z.object({
  rx_bytes: z.number(),
  tx_bytes: z.number(),
});
const vitalsSchema = z.object({
  load1: z.number(),
  mem_avail_gb: z.number(),
  net: netSchema,
});
const streamsSchema = z.object({
  active: z.number(),
  kbps: z.number(),
});

/** kind:"nas-telemetry" — the NAS blaster (governor + NAS vitals + streams). */
const nasEnvelopeSchema = z.object({
  schema: z.literal(1),
  kind: z.literal("nas-telemetry"),
  seq: z.number(),
  sent_ts: z.number(),
  interval_ms: z.number(),
  host: z.string(),
  governor: z.unknown().nullable(),
  vitals: vitalsSchema,
  streams: streamsSchema,
});

/** kind:"machine-stats" — a per-box blaster (any fleet machine). `box` keys the
 * snapshot so a machine can join the feed without a schema change. GPU block is
 * optional so GPU-less boxes (dev-beast) simply omit it. */
const machineVitalsSchema = z.object({
  cpu_pct: z.number(),
  mem_used_pct: z.number(),
  load1: z.number(),
  net: netSchema,
});
const machineGpuSchema = z
  .object({
    util_pct: z.number(),
    vram_used_mb: z.number(),
    vram_total_mb: z.number(),
    temp_c: z.number(),
    power_w: z.number(),
  })
  .nullable();
const machineEnvelopeSchema = z.object({
  schema: z.literal(1),
  kind: z.literal("machine-stats"),
  seq: z.number(),
  sent_ts: z.number(),
  interval_ms: z.number(),
  box: z.string(),
  vitals: machineVitalsSchema,
  gpu: machineGpuSchema.optional().default(null),
});

/** Any accepted datagram is one of these. */
const envelopeSchema = z.discriminatedUnion("kind", [
  nasEnvelopeSchema,
  machineEnvelopeSchema,
]);

export type TelemetryVitals = z.infer<typeof vitalsSchema>;
export type TelemetryStreams = z.infer<typeof streamsSchema>;
export type MachineVitals = z.infer<typeof machineVitalsSchema>;
export type MachineGpu = z.infer<typeof machineGpuSchema>;

/** The projection pushed to browsers — governor already normalized. */
export interface TelemetrySnapshot {
  seq: number;
  sentTs: number;
  intervalMs: number;
  host: string;
  governor: GovernorStatus | null;
  vitals: TelemetryVitals;
  streams: TelemetryStreams;
}

/** Per-box push stats (kind:"machine-stats"). One of these per fleet machine. */
export interface MachineSnapshot {
  box: string;
  seq: number;
  sentTs: number;
  intervalMs: number;
  connected: boolean;
  vitals: MachineVitals;
  gpu: MachineGpu;
}

/** What subscribers see. `connected` is the NAS feed; `snapshot` its latest.
 * `machines` maps box → its own snapshot (each with its own connected flag). */
export interface TelemetryState {
  connected: boolean;
  snapshot: TelemetrySnapshot | null;
  machines: Record<string, MachineSnapshot>;
}

type Listener = (state: TelemetryState) => void;

/** How far past the expected cadence we tolerate before "disconnected". Spec:
 * now - sent_ts > 3 * interval_ms. */
const STALE_FACTOR = 3;
/** Fallback cadence used for the staleness clock before any datagram arrives. */
const DEFAULT_INTERVAL_MS = 500;
/** A seq that drops by more than this while sent_ts advances = daemon restart. */
const RUN_RESET_SEQ_DROP = 1000;

export class TelemetryListener {
  private socket: dgram.Socket | null = null;
  private snapshot: TelemetrySnapshot | null = null;
  private connected = false;
  private readonly machines = new Map<string, MachineSnapshot>();
  private readonly subscribers = new Set<Listener>();
  private staleTimer: NodeJS.Timeout | null = null;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Bind the UDP socket. Idempotent-ish: throws if already bound. */
  bind(host: string, port: number): Promise<void> {
    if (this.socket) throw new Error("TelemetryListener already bound");
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    this.socket = socket;

    socket.on("message", (msg) => this.ingest(msg));
    // A socket error must not crash the process; log and keep the feed marked down.
    socket.on("error", (err) => {
      console.error("[telemetry] udp socket error:", err.message);
    });

    // Re-check staleness independently of datagram arrival.
    this.staleTimer = setInterval(() => this.checkStale(), 500);
    if (typeof this.staleTimer.unref === "function") this.staleTimer.unref();

    return new Promise((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(port, host, () => {
        socket.removeListener("error", reject);
        resolve();
      });
    });
  }

  /** Parse + accept-or-drop one datagram. Never throws. */
  ingest(msg: Buffer): void {
    let parsed: z.infer<typeof envelopeSchema>;
    try {
      parsed = envelopeSchema.parse(JSON.parse(decodeDatagram(msg)));
    } catch {
      return; // malformed / bad gzip / wrong kind / truncated — ignore
    }

    if (parsed.kind === "nas-telemetry") this.ingestNas(parsed);
    else this.ingestMachine(parsed);
  }

  private ingestNas(p: z.infer<typeof nasEnvelopeSchema>): void {
    if (!this.shouldAccept(this.snapshot, p.seq, p.sent_ts)) return;
    const now = this.now();
    this.snapshot = {
      seq: p.seq,
      sentTs: p.sent_ts,
      intervalMs: p.interval_ms,
      host: p.host,
      governor: parseAgentGovernor(p.governor ?? null, now),
      vitals: p.vitals,
      streams: p.streams,
    };
    this.connected = !this.isStale(p.sent_ts, p.interval_ms, now);
    this.emit();
  }

  private ingestMachine(p: z.infer<typeof machineEnvelopeSchema>): void {
    const prev = this.machines.get(p.box) ?? null;
    if (!this.shouldAccept(prev, p.seq, p.sent_ts)) return;
    const now = this.now();
    this.machines.set(p.box, {
      box: p.box,
      seq: p.seq,
      sentTs: p.sent_ts,
      intervalMs: p.interval_ms,
      connected: !this.isStale(p.sent_ts, p.interval_ms, now),
      vitals: p.vitals,
      gpu: p.gpu,
    });
    this.emit();
  }

  /** Latest-wins with run-reset detection, against any prior seq/sentTs holder. */
  private shouldAccept(
    prev: { seq: number; sentTs: number } | null,
    seq: number,
    sentTs: number,
  ): boolean {
    if (!prev) return true;
    if (seq > prev.seq) return true;
    // seq went backwards: only accept if it's a daemon restart (big drop + newer ts).
    const bigDrop = prev.seq - seq > RUN_RESET_SEQ_DROP;
    return bigDrop && sentTs > prev.sentTs;
  }

  private isStale(sentTs: number, intervalMs: number, now: number): boolean {
    const windowMs = STALE_FACTOR * (intervalMs || DEFAULT_INTERVAL_MS);
    return now - sentTs * 1000 > windowMs;
  }

  /** Public so the staleness transition is directly testable; also called on a timer. */
  checkStale(): void {
    const now = this.now();
    let changed = false;

    if (this.snapshot && this.connected) {
      if (this.isStale(this.snapshot.sentTs, this.snapshot.intervalMs, now)) {
        this.connected = false;
        changed = true;
      }
    }

    for (const [box, m] of this.machines) {
      if (m.connected && this.isStale(m.sentTs, m.intervalMs, now)) {
        this.machines.set(box, { ...m, connected: false });
        changed = true;
      }
    }

    if (changed) this.emit();
  }

  getState(): TelemetryState {
    const machines: Record<string, MachineSnapshot> = {};
    for (const [box, m] of this.machines) machines[box] = m;
    return { connected: this.connected, snapshot: this.snapshot, machines };
  }

  subscribe(fn: Listener): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private emit(): void {
    const state = this.getState();
    for (const fn of this.subscribers) {
      try {
        fn(state);
      } catch (err) {
        console.error("[telemetry] subscriber threw:", err);
      }
    }
  }

  close(): void {
    if (this.staleTimer) {
      clearInterval(this.staleTimer);
      this.staleTimer = null;
    }
    this.subscribers.clear();
    this.machines.clear();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
