import { cn } from "@/lib/utils";

export interface GaugeThreshold {
  at: number; // percent 0-100
  className?: string;
}

/**
 * SVG donut gauge for fill percentages (storage tiers, CPU). Threshold
 * markers (e.g. the 80/90 % valve levels) render as ticks on the ring;
 * crossing the first threshold switches the arc to the warning accent,
 * crossing the last switches it to the danger accent.
 */
export function DonutGauge({
  value,
  label,
  sublabel,
  thresholds = [],
  size = 148,
  className,
}: {
  value: number; // percent 0-100
  label?: string;
  sublabel?: string;
  thresholds?: GaugeThreshold[];
  size?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = size * 0.09;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const sorted = [...thresholds].sort((a, b) => a.at - b.at);
  const crossed = sorted.filter((t) => clamped >= t.at);
  const zone: "ok" | "warn" | "danger" =
    sorted.length > 0 && crossed.length === sorted.length
      ? "danger"
      : crossed.length > 0
        ? "warn"
        : "ok";
  const arcColor = {
    ok: "stroke-primary",
    warn: "stroke-status-degraded",
    danger: "stroke-status-down",
  }[zone];

  return (
    <div
      data-zone={zone}
      className={cn("relative inline-flex flex-col items-center", className)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
          className={cn("transition-all", arcColor)}
        />
        {sorted.map((t) => {
          const angle = (t.at / 100) * 2 * Math.PI;
          const x1 = size / 2 + (r - stroke / 2) * Math.cos(angle);
          const y1 = size / 2 + (r - stroke / 2) * Math.sin(angle);
          const x2 = size / 2 + (r + stroke / 2) * Math.cos(angle);
          const y2 = size / 2 + (r + stroke / 2) * Math.sin(angle);
          return (
            <line
              key={t.at}
              data-threshold={t.at}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeWidth={2}
              className={cn("stroke-foreground/60", t.className)}
            />
          );
        })}
      </svg>
      <div
        className="absolute inset-x-0 top-0 flex flex-col items-center justify-center px-1 text-center"
        style={{ height: size, width: size }}
      >
        <span className="stat-num text-xl font-semibold leading-none">{Math.round(clamped)}%</span>
        {sublabel ? (
          <span className="mt-1 max-w-full text-xs leading-tight text-muted-foreground">
            {sublabel}
          </span>
        ) : null}
      </div>
      {label ? (
        <span className="mt-1.5 text-sm text-muted-foreground">{label}</span>
      ) : null}
    </div>
  );
}
