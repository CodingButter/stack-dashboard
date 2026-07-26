import type { PollOutcome } from "./persist";
import type { ServiceConfig } from "./settings";

/**
 * A poller knows how to poll one service and return a normalized outcome. The
 * runtime measures latency and applies the circuit breaker; the poller itself
 * just does the fetch+parse and reports ok/snapshots/metrics. It must NOT throw
 * for expected failures (unreachable, auth) — return `ok: false` with an error
 * string so the breaker can act. `configured` gates services whose URL/key
 * aren't set yet.
 */
export interface Poller {
  service: string;
  configured(cfg: ServiceConfig): boolean;
  poll(cfg: ServiceConfig): Promise<Omit<PollOutcome, "service" | "latencyMs">>;
}

const registry = new Map<string, Poller>();

export function register(poller: Poller): void {
  registry.set(poller.service, poller);
}

export function allPollers(): Poller[] {
  return [...registry.values()];
}

export function getPoller(service: string): Poller | undefined {
  return registry.get(service);
}
