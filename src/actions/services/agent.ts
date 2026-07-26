import { z } from "zod";

import { defineAction } from "../registry";
import type { ActionRegistry } from "../registry";
import type { ActionResult } from "../types";
import { notConfigured, type Deps } from "./deps";

/** Mirror of agent/controlib.py SYSTEMD_UNITS — the units actions may touch. */
export const AUTOMATION_UNITS = [
  "anime-sort",
  "binge-prefetch",
  "cifs-watchdog",
  "recent-warm",
  "stack-alerts",
  "stack-digest",
  "tdarr-sweep",
  "tier-mover",
  "tdarr-gate",
] as const;

const unitSchema = z.enum(AUTOMATION_UNITS);
// Agent validates against its live container list; this only blocks garbage.
const containerSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/, "invalid container name");

/**
 * Executes one allowlisted action on the NAS agent. Destructive agent actions
 * demand the X-Confirm second factor — supplied here only after the dashboard's
 * own type-to-confirm has already passed server-side.
 */
export async function agentAction(
  deps: Deps,
  action: string,
  target: string,
  confirm: boolean,
): Promise<ActionResult> {
  const cfg = await deps.cfg("agent");
  if (!cfg.url || !cfg.apiKey) return notConfigured("agent");
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.apiKey}` };
  if (confirm) headers["X-Confirm"] = `${action}:${target}`;
  const res = await deps.http<{ ok?: boolean; error?: string; output?: string }>(
    `${cfg.url}/actions/${action}?target=${encodeURIComponent(target)}`,
    { method: "POST", headers, timeoutMs: 60000 },
  );
  if (!res.ok) {
    return { ok: false, message: res.error ?? `agent HTTP ${res.status}` };
  }
  return { ok: true, detail: res.data };
}

export function registerAgentActions(registry: ActionRegistry, deps: Deps): void {
  // --- Automation (custom systemd units) ---
  registry.register(
    defineAction({
      id: "auto.run-unit",
      label: "Run automation unit now",
      service: "automation",
      blastRadius: "disruptive",
      requiredRole: "admin",
      warning:
        "Starts the unit immediately (tier-mover = real move run, tdarr-gate = re-evaluate freeze/thaw now).",
      params: z.object({ unit: unitSchema }),
      target: (p) => p.unit,
      executor: (p) => agentAction(deps, "systemd_run", p.unit, false),
    }),
  );
  registry.register(
    defineAction({
      id: "auto.restart-unit",
      label: "Restart automation unit",
      service: "automation",
      blastRadius: "destructive",
      requiredRole: "admin",
      warning: "Restarts the systemd unit on the NAS — interrupts any run in progress.",
      params: z.object({ unit: unitSchema }),
      target: (p) => p.unit,
      executor: (p) => agentAction(deps, "systemd_restart", p.unit, true),
    }),
  );
  registry.register(
    defineAction({
      id: "auto.tiermover-dry-run",
      label: "Tier-mover dry run",
      service: "automation",
      blastRadius: "safe",
      requiredRole: "viewer",
      palette: true,
      paletteParams: { target: "tier-mover" },
      params: z.object({}),
      target: () => "tier-mover",
      executor: () => agentAction(deps, "tiermover_dry_run", "tier-mover", false),
    }),
  );

  // --- Infrastructure (mediastack containers via agent docker) ---
  registry.register(
    defineAction({
      id: "infra.container-start",
      label: "Start container",
      service: "infra",
      blastRadius: "safe",
      requiredRole: "admin",
      params: z.object({ container: containerSchema }),
      target: (p) => p.container,
      executor: (p) => agentAction(deps, "docker_start", p.container, false),
    }),
  );
  registry.register(
    defineAction({
      id: "infra.container-stop",
      label: "Stop container",
      service: "infra",
      blastRadius: "destructive",
      requiredRole: "admin",
      warning: "Stops the container on the NAS. Whatever it serves goes dark until started again.",
      params: z.object({ container: containerSchema }),
      target: (p) => p.container,
      executor: (p) => agentAction(deps, "docker_stop", p.container, true),
    }),
  );
  registry.register(
    defineAction({
      id: "infra.container-restart",
      label: "Restart container",
      service: "infra",
      blastRadius: "destructive",
      requiredRole: "admin",
      warning: "Restarts the container on the NAS — brief outage for that service.",
      params: z.object({ container: containerSchema }),
      target: (p) => p.container,
      executor: (p) => agentAction(deps, "docker_restart", p.container, true),
    }),
  );
  registry.register(
    defineAction({
      id: "infra.reboot-nas",
      label: "Reboot NAS",
      service: "infra",
      blastRadius: "destructive",
      requiredRole: "admin",
      warning:
        "Reboots the entire NAS. The whole media stack goes down; if the box is I/O-wedged the hardware watchdog may take up to 15 minutes to bring it back. Do not retry during that window.",
      palette: true,
      paletteParams: { target: "nas" },
      params: z.object({}),
      target: () => "nas",
      executor: () => agentAction(deps, "nas_reboot", "nas", true),
    }),
  );
}
