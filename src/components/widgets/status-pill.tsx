import { cn } from "@/lib/utils";

export type ServiceStatus = "up" | "degraded" | "down" | "unknown";

const statusStyles: Record<ServiceStatus, { dot: string; text: string; label: string }> = {
  up: { dot: "bg-status-up", text: "text-status-up", label: "Up" },
  degraded: { dot: "bg-status-degraded", text: "text-status-degraded", label: "Degraded" },
  down: { dot: "bg-status-down", text: "text-status-down", label: "Down" },
  unknown: { dot: "bg-muted-foreground", text: "text-muted-foreground", label: "Unknown" },
};

export function StatusPill({
  status,
  label,
  className,
}: {
  status: ServiceStatus;
  label?: string;
  className?: string;
}) {
  const s = statusStyles[status];
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-sm font-medium",
        s.text,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot, status === "up" && "animate-pulse")} />
      {label ?? s.label}
    </span>
  );
}
