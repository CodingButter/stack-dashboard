import type { ActionRegistry } from "./registry";
import { realDeps, type Deps } from "./services/deps";
import { registerAgentActions } from "./services/agent";
import { registerArrActions, registerProwlarrActions, registerSeerrActions } from "./services/arr";
import { registerPlexActions } from "./services/plex";
import { registerQbitActions } from "./services/qbittorrent";
import { registerSabActions } from "./services/sabnzbd";
import { registerTdarrActions } from "./services/tdarr";

/**
 * The master action list (recon §actions). Deps are injectable so tests can
 * assert executor payload mapping without touching the live stack.
 */
export function registerAllActions(registry: ActionRegistry, deps: Deps = realDeps): void {
  registerPlexActions(registry, deps);
  registerSabActions(registry, deps);
  registerQbitActions(registry, deps);
  registerArrActions(registry, deps, "sonarr");
  registerArrActions(registry, deps, "radarr");
  registerProwlarrActions(registry, deps);
  registerSeerrActions(registry, deps);
  registerTdarrActions(registry, deps);
  registerAgentActions(registry, deps);
}
