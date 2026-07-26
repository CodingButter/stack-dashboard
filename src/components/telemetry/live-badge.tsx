"use client";

import { cn } from "@/lib/utils";

/**
 * Tiny live/offline pill for panels that consume the push feed. `live` = the
 * WebSocket telemetry feed is connected and fresh (updates ~2 Hz). When false,
 * the panel is on its HTTP polling fallback — shown subtly so it reads as
 * "still working, just slower" rather than an error.
 */
export function LiveBadge({ live, className }: { live: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        live
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-border bg-muted/30 text-muted-foreground",
        className,
      )}
      title={
        live
          ? "Live push feed connected — updating in real time"
          : "Live feed offline — falling back to periodic polling"
      }
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          live ? "animate-pulse bg-emerald-400" : "bg-muted-foreground/60",
        )}
      />
      {live ? "Live" : "Polling"}
    </span>
  );
}
