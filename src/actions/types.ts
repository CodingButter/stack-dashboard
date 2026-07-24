import type { z } from "zod";

export type BlastRadius = "safe" | "disruptive" | "destructive";
export type Role = "admin" | "viewer";

/** Client-safe action metadata — everything the UI needs to render a control. */
export interface ActionMeta {
  id: string;
  label: string;
  /** Subsystem grouping (plex, sabnzbd, qbittorrent, sonarr, radarr, prowlarr, seerr, tdarr, automation, infra). */
  service: string;
  blastRadius: BlastRadius;
  requiredRole: Role;
  /** Short human copy shown in confirm dialogs (blast-radius warning). */
  warning?: string;
  /** Show in the ⌘K palette. Only sensible for actions whose params are fully fixed. */
  palette?: boolean;
  /** Fixed params used when launched from the palette. */
  paletteParams?: Record<string, unknown>;
}

export interface ActionResult {
  ok: boolean;
  message?: string;
  detail?: unknown;
}

/** Full server-side definition: metadata + param schema + executor. */
export interface ActionDef<S extends z.ZodType = z.ZodType> extends ActionMeta {
  /** Zod schema for the action params (validated server-side before execution). */
  params: S;
  /**
   * Derives the audit/confirm target string from validated params
   * (e.g. the container or node name). Also the string checked against
   * the deny list.
   */
  target: (params: z.infer<S>) => string;
  executor: (params: z.infer<S>) => Promise<ActionResult>;
}
