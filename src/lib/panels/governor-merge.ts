import type { GovernorStatus } from "@/poller/clients/agent";

/** The governor shape the Tdarr panel/GovernorCard consume — the parser's
 * GovernorStatus plus the `ageSecs` the HTTP assemble step computes. */
export type PanelGovernor = GovernorStatus & { ageSecs: number | null };

/**
 * Pick the governor to render: the live push snapshot when the feed is
 * connected, else the HTTP-polled one. The push payload is the raw parser
 * output (no `ageSecs`), so recompute it from `ts` against `nowMs` to match the
 * panel shape. Returns `null` only when neither source has data.
 */
export function mergeGovernor(
  live: boolean,
  liveGovernor: GovernorStatus | null,
  httpGovernor: PanelGovernor | null,
  nowMs: number = Date.now(),
): PanelGovernor | null {
  if (live && liveGovernor) {
    return {
      ...liveGovernor,
      ageSecs:
        liveGovernor.ts == null
          ? null
          : Math.round(nowMs / 1000 - liveGovernor.ts),
    };
  }
  return httpGovernor;
}
