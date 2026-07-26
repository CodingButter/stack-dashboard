/**
 * WebSocket fan-out for the live telemetry feed.
 *
 * Owns a `ws` WebSocketServer in `noServer` mode (the custom HTTP server routes
 * the `upgrade` event here for the telemetry path). On every listener update it
 * broadcasts the current state to all open sockets; a fresh socket gets the
 * current state immediately on connect so a newly-opened tab isn't blank until
 * the next datagram. A heartbeat ping reaps sockets that died without a close
 * frame (laptop sleep, network drop).
 */
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { WebSocketServer, type WebSocket } from "ws";

import type { TelemetryListener, TelemetryState } from "./telemetry-listener";
import { TELEMETRY_WS_PATH } from "./telemetry-path";

export { TELEMETRY_WS_PATH };

/** Wire message shape sent to browsers. */
export interface TelemetryMessage extends TelemetryState {
  type: "telemetry";
}

const HEARTBEAT_MS = 30_000;

function frame(state: TelemetryState): string {
  const msg: TelemetryMessage = { type: "telemetry", ...state };
  return JSON.stringify(msg);
}

export class TelemetryWsServer {
  private readonly wss: WebSocketServer;
  private readonly alive = new WeakMap<WebSocket, boolean>();
  private heartbeat: NodeJS.Timeout | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly listener: TelemetryListener) {
    this.wss = new WebSocketServer({ noServer: true });

    this.wss.on("connection", (ws: WebSocket) => {
      this.alive.set(ws, true);
      ws.on("pong", () => this.alive.set(ws, true));
      // Send the current state right away so the tab renders without waiting.
      this.safeSend(ws, frame(this.listener.getState()));
    });

    // Push every accepted listener update to all clients.
    this.unsubscribe = this.listener.subscribe((state) => {
      const data = frame(state);
      for (const ws of this.wss.clients) this.safeSend(ws, data);
    });

    // Reap dead sockets.
    this.heartbeat = setInterval(() => {
      for (const ws of this.wss.clients) {
        if (this.alive.get(ws) === false) {
          ws.terminate();
          continue;
        }
        this.alive.set(ws, false);
        try {
          ws.ping();
        } catch {
          ws.terminate();
        }
      }
    }, HEARTBEAT_MS);
    if (typeof this.heartbeat.unref === "function") this.heartbeat.unref();
  }

  /** Route a matching HTTP upgrade to this WS server. Returns true if handled. */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    const url = req.url ?? "";
    const pathname = url.split("?")[0];
    if (pathname !== TELEMETRY_WS_PATH) return false;
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit("connection", ws, req);
    });
    return true;
  }

  private safeSend(ws: WebSocket, data: string): void {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.send(data);
    } catch {
      /* socket closing mid-broadcast — ignore */
    }
  }

  close(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    for (const ws of this.wss.clients) ws.terminate();
    this.wss.close();
  }
}
