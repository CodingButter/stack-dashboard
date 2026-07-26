import { ActionRegistry } from "./registry";
import { registerAllActions } from "./register-all";

/**
 * The app's single registry instance. Server-only — executors hold service
 * clients. Cached on globalThis so dev hot reloads don't double-register.
 */
declare global {
  var __actionRegistry: ActionRegistry | undefined;
}

export function getRegistry(): ActionRegistry {
  if (!globalThis.__actionRegistry) {
    const registry = new ActionRegistry();
    registerAllActions(registry);
    globalThis.__actionRegistry = registry;
  }
  return globalThis.__actionRegistry;
}
