import { cn } from "@/lib/utils";
import { InfoDot } from "@/components/widgets/info-dot";
import type { GlossaryTerm } from "@/lib/glossary";

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
  info,
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
  spark?: React.ReactNode;
  info?: GlossaryTerm;
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
        <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          {label}
          {info ? <InfoDot term={info} /> : null}
        </span>
        {delta ? (
          <span
            data-direction={deltaDirection}
            className={cn(
              "rounded-full px-1.5 py-0.5 text-sm font-semibold",
              deltaColor,
            )}
          >
            {delta}
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="stat-num text-2xl font-semibold">{value}</span>
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      </div>
      {spark ? <div className="mt-2">{spark}</div> : null}
    </div>
  );
}
