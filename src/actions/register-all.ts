import type { ActionRegistry } from "./registry";

/**
 * Registers the master action list (Segment 05 Phase S5.2 populates this,
 * mirroring src/poller/register-all.ts).
 */
export function registerAllActions(_registry: ActionRegistry): void {
  // Populated in Phase S5.2.
}
