/**
 * In-memory sliding-window rate limiter (per-process — fine for a single
 * dashboard instance). Used to throttle login attempts per client IP.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if the call is allowed, false if the key is over limit. */
  check(key: string, now: number = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}

/** 10 login attempts per minute per IP (plan S1.3). */
export const loginRateLimiter = new RateLimiter(10, 60_000);
