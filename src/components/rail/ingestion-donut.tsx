import { cn } from "@/lib/utils";

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  /** stroke-* class for the arc and a matching bg-* class for the legend dot. */
  strokeClass: string;
  dotClass: string;
}

/**
 * Three-segment stacked SVG donut for Tdarr ingestion capacity:
 * Processing / Queued / Idle. Unlike the single-value DonutGauge, each segment
 * is a proportional arc of the ring; the center shows the busy share of
 * capacity. Segments with value 0 render no arc but still appear in the legend.
 * When every segment is 0 the ring shows an empty track and "Idle".
 *
 * Contract: the LAST segment is treated as the idle/headroom slice — the centre
 * "busy" percentage is the non-idle share (everything except the last segment).
 * Callers must order segments with the idle slice last.
 */
export function IngestionDonut({
  segments,
  size = 132,
  className,
}: {
  segments: DonutSegment[];
  size?: number;
  className?: string;
}) {
  const stroke = size * 0.1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value), 0);

  // Busy share = everything that isn't the trailing "Idle" segment. We treat
  // the LAST segment as the idle/headroom slice for the centre percentage.
  const idle = segments.length > 0 ? Math.max(0, segments[segments.length - 1].value) : 0;
  const busyPct = total > 0 ? Math.round(((total - idle) / total) * 100) : 0;

  let offset = 0;
  const arcs =
    total > 0
      ? segments.map((seg) => {
          const v = Math.max(0, seg.value);
          const len = (v / total) * c;
          const arc = (
            <circle
              key={seg.key}
              data-segment={seg.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              className={cn("transition-all", seg.strokeClass)}
            />
          );
          offset += len;
          return arc;
        })
      : [];

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          role="img"
          aria-label={`Ingestion capacity: ${busyPct}% busy`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            className="stroke-muted"
          />
          {arcs}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="stat-num text-2xl font-semibold leading-none">{busyPct}%</span>
          <span className="mt-1 text-xs text-muted-foreground">busy</span>
        </div>
      </div>
      <ul className="flex min-w-0 flex-col gap-1.5 text-sm">
        {segments.map((seg) => (
          <li key={seg.key} className="flex items-center gap-2" data-legend={seg.key}>
            <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", seg.dotClass)} />
            <span className="truncate text-muted-foreground">{seg.label}</span>
            <span className="stat-num ml-auto font-medium">{seg.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
