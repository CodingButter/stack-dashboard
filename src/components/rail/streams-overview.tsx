import { cn } from "@/lib/utils";

/**
 * Compact three-metric readout for the rail: Live streams / Transcodes /
 * Bandwidth. Bandwidth is pre-formatted (1-decimal Mbps) by the rail route.
 */
export function StreamsOverview({
  live,
  transcodes,
  bandwidthMbps,
  className,
}: {
  live: number;
  transcodes: number;
  bandwidthMbps: number;
  className?: string;
}) {
  return (
    <dl className={cn("grid grid-cols-3 gap-2", className)}>
      <Metric label="Live" value={live} />
      <Metric label="Transcodes" value={transcodes} />
      <Metric label="Bandwidth" value={bandwidthMbps.toFixed(1)} unit="Mbps" />
    </dl>
  );
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | string;
  unit?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-md border border-border/60 bg-background/40 px-2 py-3 text-center">
      <dd className="stat-num text-xl font-semibold leading-none">{value}</dd>
      {unit ? <span className="mt-0.5 text-[10px] text-muted-foreground">{unit}</span> : null}
      <dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}
