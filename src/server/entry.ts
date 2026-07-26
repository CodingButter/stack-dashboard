/**
 * Custom Next.js server entrypoint (replaces the stock standalone server.js).
 *
 * Why a custom server: route handlers cannot own a long-lived UDP `dgram` socket
 * or a WebSocket upgrade handler. This one process:
 *   1. creates the Node HTTP server and hands requests to Next,
 *   2. binds the UDP telemetry listener (single owner of the socket),
 *   3. attaches the WebSocket fan-out on the same HTTP server's upgrade event.
 *
 * Must stay compatible with `output: "standalone"` — this file is bundled to
 * `server.mjs` at build time and dropped into `.next/standalone/` by the deploy
 * script, taking over the ExecStart from the generated server.js.
 */
import { createServer } from "node:http";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import next from "next";

import { TelemetryListener } from "./telemetry-listener";
import { TelemetryWsServer, TELEMETRY_WS_PATH } from "./telemetry-ws";

const port = parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";

// Resolve `.next` relative to this file (the standalone dir), exactly like the
// stock server.js does — so the ExecStart cwd / systemd WorkingDirectory does
// not matter. When bundled to server.mjs this is `.next/standalone/`.
const serverDir = dirname(fileURLToPath(import.meta.url));
process.chdir(serverDir);

// UDP bind — tailscale iface / :9102 by default, tunable via env without a code
// change. NEVER default to a public interface; the datagram path is unauthed.
const udpHost = process.env.TELEMETRY_UDP_HOST ?? "0.0.0.0";
const udpPort = parseInt(process.env.TELEMETRY_UDP_PORT ?? "9102", 10);

async function main(): Promise<void> {
  const app = next({ dev, hostname, port, dir: serverDir });
  const handle = app.getRequestHandler();
  await app.prepare();

  const listener = new TelemetryListener();
  const wss = new TelemetryWsServer(listener);

  const server = createServer((req, res) => {
    // Next owns all HTTP; the WS path is handled on `upgrade`, not here.
    // Let Next parse the URL itself (avoids the deprecated url.parse()).
    handle(req, res).catch((err) => {
      console.error("[server] request handler error:", err);
      res.statusCode = 500;
      res.end("internal error");
    });
  });

  server.on("upgrade", (req, socket, head) => {
    if (wss.handleUpgrade(req, socket, head)) return;
    // Unknown upgrade path — refuse rather than leave the socket hanging.
    socket.destroy();
  });

  // Bind the UDP listener after the HTTP server is up so a bind failure doesn't
  // silently swallow the web service; log and continue (feed just stays down).
  try {
    await listener.bind(udpHost, udpPort);
    console.log(`[telemetry] UDP listening on ${udpHost}:${udpPort}`);
  } catch (err) {
    console.error(
      `[telemetry] failed to bind UDP ${udpHost}:${udpPort} — live feed disabled:`,
      err,
    );
  }

  const shutdown = () => {
    wss.close();
    listener.close();
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  server.listen(port, hostname, () => {
    console.log(
      `[server] ready on http://${hostname}:${port} (ws ${TELEMETRY_WS_PATH})`,
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
