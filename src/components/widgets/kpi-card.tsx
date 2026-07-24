import { cn } from "@/lib/utils";

/**
 * Tremor-style KPI card: big monospace value, optional delta badge and a
 * sparkline slot underneath.
 */
export function KpiCard({
  label,
  value,
  unit,
  delta,
  deltaDirection = "flat",
  spark,
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
  spark?: React.ReactNode;
  className?: string;
}) {
  const deltaColor = {
    up: "text-status-up bg-status-up/10",
    down: "text-status-down bg-status-down/10",
    flat: "text-muted-foreground bg-muted",
  }[deltaDirection];

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {delta ? (
          <span
            data-direction={deltaDirection}
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              deltaColor,
            )}
          >
            {delta}
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="stat-num text-2xl font-semibold">{value}</span>
        {unit ? <span className="text-xs text-muted-foreground">{unit}</span> : null}
      </div>
      {spark ? <div className="mt-2">{spark}</div> : null}
    </div>
  );
}
