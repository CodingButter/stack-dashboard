import { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { TelemetryListener } from "../telemetry-listener";
import { TelemetryWsServer, TELEMETRY_WS_PATH } from "../telemetry-ws";

/** Stand up an HTTP server with the WS fan-out on the upgrade event. */
function harness(listener: TelemetryListener): Promise<{
  url: string;
  server: Server;
  wss: TelemetryWsServer;
}> {
  const wss = new TelemetryWsServer(listener);
  const server = createServer();
  server.on("upgrade", (req, socket, head) => {
    if (!wss.handleUpgrade(req, socket, head)) socket.destroy();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `ws://127.0.0.1:${port}`, server, wss });
    });
  });
}

const nasDatagram = (seq: number) =>
  Buffer.from(
    JSON.stringify({
      schema: 1,
      kind: "nas-telemetry",
      seq,
      sent_ts: 1000,
      interval_ms: 500,
      host: "nas",
      governor: null,
      vitals: { load1: 1, mem_avail_gb: 20, net: { rx_bytes: 0, tx_bytes: 0 } },
      streams: { active: 0, kbps: 0 },
    }),
    "utf8",
  );

describe("TelemetryWsServer", () => {
  let cleanup: (() => void) | null = null;
  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it("sends the current state immediately on connect", async () => {
    const listener = new TelemetryListener(() => 1000 * 1000 + 100);
    listener.ingest(nasDatagram(5));
    const { url, server, wss } = await harness(listener);
    cleanup = () => {
      wss.close();
      server.close();
    };

    const first = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const ws = new WebSocket(`${url}${TELEMETRY_WS_PATH}`);
      const t = setTimeout(() => reject(new Error("timeout")), 5000);
      ws.on("message", (buf) => {
        clearTimeout(t);
        ws.close();
        resolve(JSON.parse(buf.toString()));
      });
      ws.on("error", reject);
    });

    expect(first.type).toBe("telemetry");
    expect((first.snapshot as { seq: number }).seq).toBe(5);
  });

  it("broadcasts subsequent datagrams to a connected client", async () => {
    const listener = new TelemetryListener(() => 1000 * 1000 + 100);
    const { url, server, wss } = await harness(listener);
    cleanup = () => {
      wss.close();
      server.close();
    };

    const got = await new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(`${url}${TELEMETRY_WS_PATH}`);
      let ready = false;
      const t = setTimeout(() => reject(new Error("timeout")), 5000);
      ws.on("message", (buf) => {
        const msg = JSON.parse(buf.toString());
        if (!ready) {
          ready = true; // initial (empty) state — now push a datagram
          listener.ingest(nasDatagram(9));
          return;
        }
        clearTimeout(t);
        ws.close();
        resolve(msg.snapshot?.seq);
      });
      ws.on("error", reject);
    });

    expect(got).toBe(9);
  });

  it("rejects an upgrade on an unknown path", async () => {
    const listener = new TelemetryListener(() => 1000 * 1000 + 100);
    const { url, server, wss } = await harness(listener);
    cleanup = () => {
      wss.close();
      server.close();
    };

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${url}/ws/nope`);
      ws.on("open", () => reject(new Error("should not have connected")));
      ws.on("error", () => resolve()); // socket destroyed → error, as expected
    });
  });
});
