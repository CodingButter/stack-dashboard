import type { Downloads } from "@/lib/panels/schemas";
import type { TelemetryDownloads } from "@/server/telemetry-listener";

/**
 * Overlay the live push feed's fast-moving download numbers onto the HTTP panel
 * data. HTTP stays the structural source of truth (queue counts, seeding/stalled
 * breakdown, categories, totals, sparkline series) because the UDP `downloads`
 * block only carries the live-updating fields. When the feed is connected we
 * prefer its speeds, queue-left, ETA, and per-item progress; otherwise the HTTP
 * data passes through untouched. Fail-soft: a null sub-client on the feed leaves
 * that client's HTTP data in place rather than blanking the card.
 */
export function mergeDownloads(
  live: boolean,
  liveDownloads: TelemetryDownloads | null,
  http: Downloads | null,
): Downloads | null {
  if (!http) return http;
  if (!live || !liveDownloads) return http;

  const next: Downloads = { ...http };

  if (liveDownloads.sab && http.sab) {
    const l = liveDownloads.sab;
    next.sab = {
      ...http.sab,
      status: l.status,
      paused: l.paused,
      speedBps: l.speedBps,
      mbLeft: l.mbLeft,
      timeLeft: l.eta,
      queueSize: l.count,
      // Overlay live per-item progress onto the queued jobs, matched by name.
      jobs: http.sab.jobs.map((job) => {
        const li = l.items.find((i) => i.name === job.name);
        return li
          ? { ...job, percent: li.pct, mbLeft: li.mbLeft, timeLeft: li.eta, status: li.status }
          : job;
      }),
    };
  }

  if (liveDownloads.qbit && http.qbit) {
    const l = liveDownloads.qbit;
    next.qbit = {
      ...http.qbit,
      dlSpeed: l.dlBps,
      upSpeed: l.upBps,
    };
  }

  return next;
}
