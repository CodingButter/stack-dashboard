/** Human formatting helpers for panel widgets. */

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

/** bytes/second → "12.4 MB/s" */
export function formatBps(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "0 B/s";
  return `${formatBytes(bps)}/s`;
}

/** bytes/second → "12.4 MB/s" (always MB/s, never smaller units) */
export function formatMbps(bps: number): string {
  const mb = Number.isFinite(bps) && bps > 0 ? bps / 1024 / 1024 : 0;
  return `${mb.toFixed(1)} MB/s`;
}

/** already-MB/s number → "12.4 MB/s" */
export function formatMbpsValue(mb: number): string {
  const v = Number.isFinite(mb) && mb > 0 ? mb : 0;
  return `${v.toFixed(1)} MB/s`;
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** "42s ago" / "3m ago" / "2h ago" — for last-seen stamps. */
export function formatAgo(iso: string | Date | null, now: Date = new Date()): string {
  if (!iso) return "never";
  const then = typeof iso === "string" ? new Date(iso) : iso;
  const s = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
