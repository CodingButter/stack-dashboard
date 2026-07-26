import type { z } from "zod";

import type { ActionDef, ActionMeta, Role } from "./types";

/**
 * Mirror of the agent's server-side deny list (agent/controlib.py
 * DENY_CONTAINERS). Enforced here as well so a denied target never even
 * leaves the dashboard — and the agent enforces it again regardless.
 */
export const DENIED_TARGETS = new Set(["wren-brain-pg", "tailscaled"]);

/** The type-to-confirm string a destructive action demands. */
export function confirmStringFor(actionId: string, target: string): string {
  return `${actionId}/${target}`;
}

export function defineAction<S extends z.ZodType>(def: ActionDef<S>): ActionDef<S> {
  return def;
}

export class ActionRegistry {
  private actions = new Map<string, ActionDef>();

  register(def: ActionDef<z.ZodType>): void {
    if (this.actions.has(def.id)) {
      throw new Error(`duplicate action id: ${def.id}`);
    }
    this.actions.set(def.id, def);
  }

  get(id: string): ActionDef | undefined {
    return this.actions.get(id);
  }

  all(): ActionDef[] {
    return [...this.actions.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Client-safe metadata, filtered to what `role` may execute. */
  metaForRole(role: Role): ActionMeta[] {
    return this.all()
      .filter((a) => a.requiredRole === "viewer" || role === "admin")
      .map(({ id, label, service, blastRadius, requiredRole, warning, palette, paletteParams }) => ({
        id,
        label,
        service,
        blastRadius,
        requiredRole,
        warning,
        palette,
        paletteParams,
      }));
  }
}
