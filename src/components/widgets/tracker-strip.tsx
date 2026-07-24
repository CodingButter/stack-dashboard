import { cn } from "@/lib/utils";

export type TrackerState = "up" | "degraded" | "down" | "empty";

export interface TrackerCell {
  state: TrackerState;
  tooltip?: string;
}

const cellColor: Record<TrackerState, string> = {
  up: "bg-status-up",
  degraded: "bg-status-degraded",
  down: "bg-status-down",
  empty: "bg-muted",
};

/**
 * Tremor-style tracker strip — one cell per poll interval, colored by
 * outcome. Used for uptime / poll-history visualization.
 */
export function TrackerStrip({
  data,
  label,
  className,
}: {
  data: TrackerCell[];
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span className="stat-num">
            {data.length > 0
              ? `${Math.round((data.filter((c) => c.state === "up").length / data.length) * 100)}%`
              : "—"}
          </span>
        </div>
      ) : null}
      <div className="flex h-8 w-full items-center gap-px" role="img" aria-label={label}>
        {data.map((cell, i) => (
          <span
            key={i}
            title={cell.tooltip}
            data-state={cell.state}
            className={cn(
              "h-full flex-1 rounded-[1px] opacity-90 transition-opacity hover:opacity-100",
              cellColor[cell.state],
            )}
          />
        ))}
      </div>
    </div>
  );
}
