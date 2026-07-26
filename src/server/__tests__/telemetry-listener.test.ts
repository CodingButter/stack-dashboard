import dgram from "node:dgram";

import { afterEach, describe, expect, it } from "vitest";

import { TelemetryListener, type TelemetryState } from "../telemetry-listener";

/** Build a valid envelope (schema 1) with overridable fields. */
function envelope(over: Partial<Record<string, unknown>> = {}): Buffer {
  const base = {
    schema: 1,
    kind: "nas-telemetry",
    seq: 1,
    sent_ts: 1000, // unix seconds
    interval_ms: 500,
    host: "nas",
    governor: null,
    vitals: { load1: 4.35, mem_avail_gb: 23.1, net: { rx_bytes: 1, tx_bytes: 2 } },
    streams: { active: 0, kbps: 0 },
    ...over,
  };
  return Buffer.from(JSON.stringify(base), "utf8");
}

describe("TelemetryListener.ingest", () => {
  it("accepts the first datagram and marks connected", () => {
    // now = sent_ts(1000s)*1000 + 100ms → within the 1500ms stale window.
    const l = new TelemetryListener(() => 1000 * 1000 + 100);
    l.ingest(envelope({ seq: 5 }));
    const s = l.getState();
    expect(s.connected).toBe(true);
    expect(s.snapshot?.seq).toBe(5);
  });

  it("keeps the highest seq and drops a lower (reordered) one", () => {
    const l = new TelemetryListener(() => 1000 * 1000 + 100);
    l.ingest(envelope({ seq: 10, sent_ts: 1000 }));
    l.ingest(envelope({ seq: 4, sent_ts: 1000 })); // late packet
    expect(l.getState().snapshot?.seq).toBe(10);
  });

  it("adopts a new run when seq resets low but sent_ts jumps forward", () => {
    const l = new TelemetryListener(() => 2000 * 1000 + 100);
    l.ingest(envelope({ seq: 5000, sent_ts: 1000 }));
    // daemon restarted: seq back to 2, but clock moved on a lot.
    l.ingest(envelope({ seq: 2, sent_ts: 2000 }));
    expect(l.getState().snapshot?.seq).toBe(2);
  });

  it("ignores malformed datagrams without throwing", () => {
    const l = new TelemetryListener(() => 1000 * 1000 + 100);
    expect(() => l.ingest(Buffer.from("not json", "utf8"))).not.toThrow();
    expect(() => l.ingest(Buffer.from('{"schema":9}', "utf8"))).not.toThrow();
    expect(l.getState().snapshot).toBeNull();
  });

  it("marks disconnected when the datagram is already stale on arrival", () => {
    // now is 3s after sent_ts → beyond the 3*500ms window.
    const l = new TelemetryListener(() => 1000 * 1000 + 3000);
    l.ingest(envelope({ seq: 1, sent_ts: 1000 }));
    expect(l.getState().connected).toBe(false);
    expect(l.getState().snapshot?.seq).toBe(1); // snapshot retained
  });

  it("notifies subscribers on each accepted update", () => {
    const l = new TelemetryListener(() => 1000 * 1000 + 100);
    const seen: TelemetryState[] = [];
    l.subscribe((s) => seen.push(s));
    l.ingest(envelope({ seq: 1 }));
    l.ingest(envelope({ seq: 2 }));
    expect(seen).toHaveLength(2);
    expect(seen[1].snapshot?.seq).toBe(2);
  });

  it("normalizes a schema-3 governor payload via parseAgentGovernor", () => {
    const now = 1000 * 1000 + 100;
    const l = new TelemetryListener(() => now);
    l.ingest(
      envelope({
        seq: 1,
        governor: {
          ts: 1000, // seconds, fresh vs now
          poll_secs: 20,
          mode: "governing",
          nodes: [],
        },
      }),
    );
    const gov = l.getState().snapshot?.governor;
    expect(gov?.running).toBe(true);
    expect(gov?.mode).toBe("governing");
  });
});

describe("TelemetryListener staleness timer", () => {
  it("flips connected→false when the feed goes silent", () => {
    let clock = 1000 * 1000 + 100;
    const l = new TelemetryListener(() => clock);
    l.ingest(envelope({ seq: 1, sent_ts: 1000 }));
    expect(l.getState().connected).toBe(true);

    // Advance the clock past the stale window and run the timer's work directly.
    clock = 1000 * 1000 + 5000;
    l.checkStale();
    expect(l.getState().connected).toBe(false);
    expect(l.getState().snapshot?.seq).toBe(1); // snapshot retained
    l.close();
  });
});

/** Build a valid machine-stats envelope (schema 1). */
function machineEnvelope(over: Partial<Record<string, unknown>> = {}): Buffer {
  const base = {
    schema: 1,
    kind: "machine-stats",
    seq: 1,
    sent_ts: 1000,
    interval_ms: 500,
    box: "bigbeast",
    vitals: {
      cpu_pct: 42.5,
      mem_used_pct: 61.2,
      load1: 3.1,
      net: { rx_bytes: 100, tx_bytes: 200 },
    },
    gpu: {
      util_pct: 88,
      vram_used_mb: 12000,
      vram_total_mb: 24576,
      temp_c: 63,
      power_w: 310,
    },
    ...over,
  };
  return Buffer.from(JSON.stringify(base), "utf8");
}

describe("TelemetryListener machine-stats", () => {
  it("keys per-box snapshots independently", () => {
    const l = new TelemetryListener(() => 1000 * 1000 + 100);
    l.ingest(machineEnvelope({ box: "bigbeast", seq: 3 }));
    l.ingest(machineEnvelope({ box: "zenbeast", seq: 7, gpu: null }));
    const { machines } = l.getState();
    expect(machines.bigbeast.seq).toBe(3);
    expect(machines.bigbeast.gpu?.util_pct).toBe(88);
    expect(machines.zenbeast.seq).toBe(7);
    expect(machines.zenbeast.gpu).toBeNull(); // GPU-less box
  });

  it("keeps highest seq per box and drops reordered", () => {
    const l = new TelemetryListener(() => 1000 * 1000 + 100);
    l.ingest(machineEnvelope({ box: "bigbeast", seq: 10 }));
    l.ingest(machineEnvelope({ box: "bigbeast", seq: 4 }));
    expect(l.getState().machines.bigbeast.seq).toBe(10);
  });

  it("accepts a machine datagram with no gpu field (default null)", () => {
    const l = new TelemetryListener(() => 1000 * 1000 + 100);
    const dg = Buffer.from(
      JSON.stringify({
        schema: 1,
        kind: "machine-stats",
        seq: 1,
        sent_ts: 1000,
        interval_ms: 500,
        box: "dev-beast",
        vitals: {
          cpu_pct: 10,
          mem_used_pct: 16,
          load1: 1.2,
          net: { rx_bytes: 1, tx_bytes: 2 },
        },
      }),
      "utf8",
    );
    l.ingest(dg);
    expect(l.getState().machines["dev-beast"].gpu).toBeNull();
  });

  it("flips a single box to disconnected on staleness without touching others", () => {
    let clock = 1000 * 1000 + 100;
    const l = new TelemetryListener(() => clock);
    l.ingest(machineEnvelope({ box: "bigbeast", seq: 1, sent_ts: 1000 }));
    l.ingest(machineEnvelope({ box: "zenbeast", seq: 1, sent_ts: 1000 }));
    // Only bigbeast is stale now; give zenbeast a fresher sent_ts.
    clock = 1002 * 1000 + 100;
    l.ingest(machineEnvelope({ box: "zenbeast", seq: 2, sent_ts: 1002 }));
    l.checkStale();
    expect(l.getState().machines.bigbeast.connected).toBe(false);
    expect(l.getState().machines.zenbeast.connected).toBe(true);
  });
});

describe("TelemetryListener UDP loopback", () => {
  let listener: TelemetryListener | null = null;

  afterEach(() => {
    listener?.close();
    listener = null;
  });

  it("receives a real datagram and updates the snapshot", async () => {
    listener = new TelemetryListener(() => 1000 * 1000 + 100);
    await listener.bind("127.0.0.1", 0);
    // bind(port 0) picks a free port — read it back off the internal socket.
    const port = (listener as unknown as { socket: dgram.Socket }).socket.address()
      ? ((listener as unknown as { socket: dgram.Socket }).socket.address() as {
          port: number;
        }).port
      : 0;

    const got = new Promise<void>((resolve) => {
      const stop = listener!.subscribe((s) => {
        if (s.snapshot?.seq === 42) {
          stop();
          resolve();
        }
      });
    });

    const sender = dgram.createSocket("udp4");
    const dg = envelope({ seq: 42, sent_ts: 1000 });
    await new Promise<void>((resolve, reject) =>
      sender.send(dg, port, "127.0.0.1", (err) => {
        sender.close();
        err ? reject(err) : resolve();
      }),
    );

    await got;
    expect(listener.getState().snapshot?.seq).toBe(42);
  });
});
