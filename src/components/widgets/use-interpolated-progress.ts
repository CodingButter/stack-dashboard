"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Dead-reckon a progress value between polls so a determinate bar *creeps*
 * continuously instead of snapping forward every poll interval.
 *
 * How it works: we remember the last two real samples (value + wall-clock
 * time). Their delta gives a velocity in percent-per-millisecond. Between
 * polls we advance a display value on each animation frame at that velocity,
 * so the bar looks live. When a fresh poll lands we snap the display value to
 * the truth and recompute velocity — reality always wins.
 *
 * Guardrails:
 *  - Never overtake reality: the interpolated value is clamped so it can't run
 *    past the last real value plus one poll's worth of expected motion (or 100).
 *    If the encode stalls, the next poll snaps the bar back — an honest correction.
 *  - Forward only: a large *drop* (a new file starting, percent resetting between
 *    stages) is treated as new work — snap instantly and restart velocity tracking,
 *    never drain.
 */
export function useInterpolatedProgress(value: number): number {
  const clamped = Math.max(0, Math.min(100, value));

  // Last two real samples, for velocity.
  const lastValue = useRef(clamped);
  const lastTime = useRef(now());
  const velocity = useRef(0); // percent per ms
  // Expected gap to the next poll (ms), derived from the observed poll interval.
  const pollGap = useRef(0);

  const [display, setDisplay] = useState(clamped);
  const displayRef = useRef(clamped);

  // Ingest a new real sample whenever the polled value changes.
  useEffect(() => {
    const t = now();
    const prevValue = lastValue.current;
    const dt = t - lastTime.current;

    // A meaningful backward jump = new work. Snap, reset velocity, don't drain.
    const isReset = clamped < prevValue - 1;

    if (isReset || dt <= 0) {
      velocity.current = 0;
    } else {
      const dv = clamped - prevValue;
      velocity.current = dv > 0 ? dv / dt : 0;
      pollGap.current = dt;
    }

    lastValue.current = clamped;
    lastTime.current = t;
    displayRef.current = clamped;
    setDisplay(clamped);
  }, [clamped]);

  // Animation loop: advance the display value toward the projected ceiling.
  useEffect(() => {
    if (velocity.current <= 0) return;

    let raf = 0;
    const tick = () => {
      const elapsed = now() - lastTime.current;
      const projected = lastValue.current + velocity.current * elapsed;
      // Ceiling: never run past what one poll's motion would reach, or 100.
      const ceiling = Math.min(
        100,
        lastValue.current + velocity.current * pollGap.current,
      );
      const next = Math.min(projected, ceiling);

      if (next > displayRef.current) {
        displayRef.current = next;
        setDisplay(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [display]);

  return display;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
