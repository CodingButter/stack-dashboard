"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useInterpolatedProgress } from "./use-interpolated-progress";

/**
 * A determinate progress bar whose fill eases smoothly toward each new value
 * as polls arrive — so it grows in little bursts instead of snapping.
 *
 * Forward-only: easing a *backwards* jump (Tdarr percent resetting to 0 between
 * stages, a new download starting, a stream scrub-back) reads as the bar
 * draining, which is worse than a snap. So when the value drops we disable the
 * transition for that render and let it jump instantly; only forward motion
 * eases.
 *
 * With `interpolate`, the bar goes a step further: it dead-reckons progress
 * between polls from the velocity of the last two samples, so a steadily
 * advancing value (a transcode, a write-back) *creeps* live instead of ticking
 * once per poll. Reality snaps back in on each poll. Use it only where the
 * value moves at a roughly steady rate.
 */
export function ProgressBar({
  value,
  className,
  barClassName,
  interpolate = false,
}: {
  /** 0–100. Clamped. */
  value: number;
  /** Track (outer) classes. */
  className?: string;
  /** Fill (inner) classes — e.g. the accent color. */
  barClassName?: string;
  /** Dead-reckon between polls for a live-creeping fill. */
  interpolate?: boolean;
}) {
  return interpolate ? (
    <InterpolatedBar value={value} className={className} barClassName={barClassName} />
  ) : (
    <EasedBar value={value} className={className} barClassName={barClassName} />
  );
}

function EasedBar({
  value,
  className,
  barClassName,
}: {
  value: number;
  className?: string;
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
    <Track className={className}>
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
    </Track>
  );
}

function InterpolatedBar({
  value,
  className,
  barClassName,
}: {
  value: number;
  className?: string;
  barClassName?: string;
}) {
  const pct = useInterpolatedProgress(value);

  return (
    <Track className={className}>
      <div
        data-testid="progress-fill"
        data-interpolated="true"
        className={cn("h-full rounded-full", barClassName)}
        style={{ width: `${pct}%` }}
      />
    </Track>
  );
}

function Track({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-muted", className)}>
      {children}
    </div>
  );
}
