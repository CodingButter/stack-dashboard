/**
 * Poll scheduler + per-service circuit breaker.
 *
 * Pure logic, no timers or I/O — the runtime loop (index.ts) drives it. Kept
 * separable so the interval tiers and breaker transitions are unit-testable
 * without hitting the network or a clock.
 *
 * NAS-safety design: a wedged/I/O-bound NAS must never see a retry storm. On
 * repeated failure a service's effective interval BACKS OFF (never shortens),
 * and while tripped the service is marked down and polled only at the slow
 * backoff cadence until it recovers.
 */

/** Base poll intervals per service tier, in milliseconds. */
export const POLL_INTERVALS_MS: Record<string, number> = {
  agent: 10_000, // NAS agent hardware stats — cheap /proc reads
  plex: 15_000,
  tautulli: 15_000,
  sabnzbd: 5_000, // download speed/progress moves fast; keep the page live
  qbittorrent: 5_000,
  tdarr: 10_000, // transcode progress moves fast; keep the page lively (breaker still backs off on failure)
  sonarr: 30_000, // arr queue
  radarr: 30_000,
  seerr: 30_000,
  "sonarr:library": 300_000, // wanted/missing + library counts — 5 min
  "radarr:library": 300_000,
  prowlarr: 300_000, // indexer health — 5 min
  smart: 1_800_000, // SMART — 30 min
  gate: 15_000,
  tiermover: 300_000,
};

export const DEFAULT_INTERVAL_MS = 30_000;
export const POLL_TIMEOUT_MS = 10_000;
export const BREAKER_THRESHOLD = 3; // consecutive failures to trip
export const BREAKER_BACKOFF_MS = 60_000; // slow cadence while tripped

export function intervalFor(service: string): number {
  return POLL_INTERVALS_MS[service] ?? DEFAULT_INTERVAL_MS;
}

export interface BreakerState {
  consecutiveFailures: number;
  tripped: boolean;
  /** epoch ms of the last poll attempt (0 = never polled). */
  lastAttempt: number;
}

export function initBreaker(): BreakerState {
  return { consecutiveFailures: 0, tripped: false, lastAttempt: 0 };
}

/** Fold a poll outcome into the breaker state (returns a new state). */
export function recordResult(
  state: BreakerState,
  ok: boolean,
  now: number,
): BreakerState {
  if (ok) {
    return { consecutiveFailures: 0, tripped: false, lastAttempt: now };
  }
  const failures = state.consecutiveFailures + 1;
  return {
    consecutiveFailures: failures,
    tripped: failures >= BREAKER_THRESHOLD,
    lastAttempt: now,
  };
}

/**
 * Effective interval for a service given its breaker: normal tier interval when
 * healthy, the (longer) backoff cadence once tripped. Uses max() so a fast tier
 * can never override the backoff and hammer a down service.
 */
export function effectiveInterval(
  service: string,
  state: BreakerState,
): number {
  const base = intervalFor(service);
  return state.tripped ? Math.max(base, BREAKER_BACKOFF_MS) : base;
}

/** Is this service due to poll now? */
export function isDue(
  service: string,
  state: BreakerState,
  now: number,
): boolean {
  if (state.lastAttempt === 0) return true;
  return now - state.lastAttempt >= effectiveInterval(service, state);
}

/**
 * Deterministic per-service start jitter (0..maxMs) so tiers with the same
 * interval don't all fire on the same tick and stampede the NAS. Hash-based, so
 * it's stable across restarts.
 */
export function startJitter(service: string, maxMs = 5_000): number {
  let h = 0;
  for (let i = 0; i < service.length; i++) {
    h = (h * 31 + service.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % maxMs;
}
