/** WebSocket upgrade path for the live telemetry feed. Kept in its own module
 * (no `ws`/`dgram` imports) so client code can reference it without pulling
 * server-only deps into the browser bundle. */
export const TELEMETRY_WS_PATH = "/ws/telemetry";
