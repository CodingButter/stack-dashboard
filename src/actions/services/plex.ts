import { z } from "zod";

import { defineAction } from "../registry";
import type { ActionRegistry } from "../registry";
import type { ActionResult } from "../types";
import { fromFetch, notConfigured, type Deps } from "./deps";
import { agentAction } from "./agent";

const sessionIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, "invalid session id");

export function registerPlexActions(registry: ActionRegistry, deps: Deps): void {
  const call = async (path: string, method = "GET"): Promise<ActionResult> => {
    const cfg = await deps.cfg("plex");
    if (!cfg.url || !cfg.apiKey) return notConfigured("plex");
    const sep = path.includes("?") ? "&" : "?";
    const res = await deps.http(
      `${cfg.url}${path}${sep}X-Plex-Token=${encodeURIComponent(cfg.apiKey)}`,
      { method, as: "text" },
    );
    return fromFetch(res);
  };

  registry.register(
    defineAction({
      id: "plex.scan-library",
      label: "Scan library section",
      service: "plex",
      blastRadius: "safe",
      requiredRole: "viewer",
      params: z.object({ sectionId: z.coerce.number().int().min(1) }),
      target: (p) => `section-${p.sectionId}`,
      executor: (p) => call(`/library/sections/${p.sectionId}/refresh`),
    }),
  );
  registry.register(
    defineAction({
      id: "plex.refresh-metadata",
      label: "Refresh item metadata",
      service: "plex",
      blastRadius: "safe",
      requiredRole: "viewer",
      params: z.object({ ratingKey: z.coerce.number().int().min(1) }),
      target: (p) => `item-${p.ratingKey}`,
      executor: (p) => call(`/library/metadata/${p.ratingKey}/refresh`, "PUT"),
    }),
  );
  registry.register(
    defineAction({
      id: "plex.terminate-stream",
      label: "Terminate stream",
      service: "plex",
      blastRadius: "destructive",
      requiredRole: "admin",
      warning: "Kicks the viewer mid-play. They see your message; the stream ends immediately.",
      params: z.object({
        sessionId: sessionIdSchema,
        reason: z.string().max(200).default("Stream terminated by admin"),
      }),
      target: (p) => p.sessionId,
      executor: (p) =>
        call(
          `/status/sessions/terminate?sessionId=${encodeURIComponent(p.sessionId)}&reason=${encodeURIComponent(p.reason)}`,
        ),
    }),
  );
  registry.register(
    defineAction({
      id: "plex.empty-trash",
      label: "Empty section trash",
      service: "plex",
      blastRadius: "destructive",
      requiredRole: "admin",
      warning:
        "Permanently clears trashed items from the section's metadata. Files already deleted from disk stay deleted.",
      params: z.object({ sectionId: z.coerce.number().int().min(1) }),
      target: (p) => `section-${p.sectionId}`,
      executor: (p) => call(`/library/sections/${p.sectionId}/emptyTrash`, "PUT"),
    }),
  );
  registry.register(
    defineAction({
      id: "plex.restart-container",
      label: "Restart Plex",
      service: "plex",
      blastRadius: "destructive",
      requiredRole: "admin",
      warning: "Restarts the Plex container on the NAS — all active streams drop.",
      palette: true,
      paletteParams: { target: "plex" },
      params: z.object({}),
      target: () => "plex",
      executor: () => agentAction(deps, "docker_restart", "plex", true),
    }),
  );
}
