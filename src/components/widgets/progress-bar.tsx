"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A determinate progress bar whose fill eases smoothly toward each new value
 * as polls arrive — so it grows in little bursts instead of snapping.
 *
 * Forward-only: easing a *backwards* jump (Tdarr percent resetting to 0 between
 * stages, a new download starting, a stream scrub-back) reads as the bar
 * draining, which is worse than a snap. So when the value drops we disable the
 * transition for that render and let it jump instantly; only forward motion
 * eases.
 */
export function ProgressBar({
  value,
  className,
  barClassName,
}: {
  /** 0–100. Clamped. */
  value: number;
  /** Track (outer) classes. */
  className?: string;
  /** Fill (inner) classes — e.g. the accent color. */
  barClassName?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const prev = useRef(pct);
  // Ease only when this render moves the bar forward.
  const [eased, setEased] = useState(false);

  useEffect(() => {
    setEased(pct >= prev.current);
    prev.current = pct;
  }, [pct]);

  return (
    <div
      className={cn(
        "h-1 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <div
        data-testid="progress-fill"
        data-eased={eased}
        className={cn(
          "h-full rounded-full",
          eased && "transition-[width] duration-500 ease-out",
          barClassName,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
