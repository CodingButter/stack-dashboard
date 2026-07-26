import { z } from "zod";

import { defineAction } from "../registry";
import type { ActionRegistry } from "../registry";
import type { ActionResult } from "../types";
import { fromFetch, notConfigured, type Deps } from "./deps";

const nzoIdSchema = z.string().regex(/^[A-Za-z0-9_]{1,128}$/, "invalid nzo id");

export function registerSabActions(registry: ActionRegistry, deps: Deps): void {
  const call = async (query: Record<string, string>): Promise<ActionResult> => {
    const cfg = await deps.cfg("sabnzbd");
    if (!cfg.url || !cfg.apiKey) return notConfigured("sabnzbd");
    const qs = new URLSearchParams({ ...query, output: "json", apikey: cfg.apiKey });
    const res = await deps.http<{ status?: boolean; error?: string }>(
      `${cfg.url}/api?${qs.toString()}`,
    );
    if (!res.ok) return fromFetch(res);
    if (res.data && res.data.status === false) {
      return { ok: false, message: res.data.error ?? "SABnzbd rejected the call" };
    }
    return { ok: true };
  };

  registry.register(
    defineAction({
      id: "sab.pause-queue",
      label: "Pause SABnzbd queue",
      service: "sabnzbd",
      blastRadius: "disruptive",
      requiredRole: "admin",
      palette: true,
      paletteParams: { target: "queue" },
      params: z.object({}),
      target: () => "queue",
      executor: () => call({ mode: "pause" }),
    }),
  );
  registry.register(
    defineAction({
      id: "sab.resume-queue",
      label: "Resume SABnzbd queue",
      service: "sabnzbd",
      blastRadius: "disruptive",
      requiredRole: "admin",
      palette: true,
      paletteParams: { target: "queue" },
      params: z.object({}),
      target: () => "queue",
      executor: () => call({ mode: "resume" }),
    }),
  );
  registry.register(
    defineAction({
      id: "sab.pause-job",
      label: "Pause download",
      service: "sabnzbd",
      blastRadius: "disruptive",
      requiredRole: "admin",
      params: z.object({ nzoId: nzoIdSchema }),
      target: (p) => p.nzoId,
      executor: (p) => call({ mode: "queue", name: "pause", value: p.nzoId }),
    }),
  );
  registry.register(
    defineAction({
      id: "sab.resume-job",
      label: "Resume download",
      service: "sabnzbd",
      blastRadius: "disruptive",
      requiredRole: "admin",
      params: z.object({ nzoId: nzoIdSchema }),
      target: (p) => p.nzoId,
      executor: (p) => call({ mode: "queue", name: "resume", value: p.nzoId }),
    }),
  );
  registry.register(
    defineAction({
      id: "sab.delete-job",
      label: "Delete download",
      service: "sabnzbd",
      blastRadius: "destructive",
      requiredRole: "admin",
      warning: "Removes the job from the queue and deletes its partial download.",
      params: z.object({ nzoId: nzoIdSchema }),
      target: (p) => p.nzoId,
      executor: (p) =>
        call({ mode: "queue", name: "delete", value: p.nzoId, del_files: "1" }),
    }),
  );
  registry.register(
    defineAction({
      id: "sab.set-priority",
      label: "Set job priority",
      service: "sabnzbd",
      blastRadius: "disruptive",
      requiredRole: "admin",
      params: z.object({
        nzoId: nzoIdSchema,
        // -2 low … 2 force, SABnzbd's own scale
        priority: z.coerce.number().int().min(-2).max(2),
      }),
      target: (p) => p.nzoId,
      executor: (p) =>
        call({
          mode: "queue",
          name: "priority",
          value: p.nzoId,
          value2: String(p.priority),
        }),
    }),
  );
  registry.register(
    defineAction({
      id: "sab.set-speedlimit",
      label: "Set SABnzbd speed limit",
      service: "sabnzbd",
      blastRadius: "disruptive",
      requiredRole: "admin",
      warning:
        "Overrides the speed governor. If tdarr-gate or the nightly window set this limit, your value holds only until the governor's next pass.",
      params: z.object({ percent: z.coerce.number().int().min(1).max(100) }),
      target: (p) => `limit-${p.percent}pct`,
      executor: (p) => call({ mode: "config", name: "speedlimit", value: String(p.percent) }),
    }),
  );
  registry.register(
    defineAction({
      id: "sab.retry-failed",
      label: "Retry failed download(s)",
      service: "sabnzbd",
      blastRadius: "disruptive",
      requiredRole: "admin",
      palette: true,
      paletteParams: { target: "all" },
      params: z.object({ nzoId: nzoIdSchema.optional() }),
      target: (p) => p.nzoId ?? "all",
      executor: (p) =>
        p.nzoId ? call({ mode: "retry", value: p.nzoId }) : call({ mode: "retry_all" }),
    }),
  );
}
