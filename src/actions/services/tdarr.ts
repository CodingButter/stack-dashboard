import { z } from "zod";

import { defineAction } from "../registry";
import type { ActionRegistry } from "../registry";
import type { ActionResult } from "../types";
import { fromFetch, notConfigured, type Deps } from "./deps";

const nodeNameSchema = z.string().regex(/^[A-Za-z0-9 _.-]{1,64}$/, "invalid node name");
const workerTypeSchema = z.enum([
  "transcodecpu",
  "transcodegpu",
  "healthcheckcpu",
  "healthcheckgpu",
]);

interface RawNode {
  _id?: string;
  nodeName?: string;
  workerLimits?: Record<string, number>;
}

/**
 * Node-ID footgun (main plan, Risks): Tdarr node IDs regenerate on every
 * reconnect. Every node-targeted action resolves the CURRENT id from
 * get-nodes by nodeName at execution time, and mutates only through the
 * server relay endpoints — never cruddb writes.
 */
async function resolveNode(
  deps: Deps,
  base: string,
  key: string,
  nodeName: string,
): Promise<{ id: string; node: RawNode } | null> {
  const res = await deps.http<Record<string, RawNode>>(`${base}/api/v2/get-nodes`, {
    headers: { "x-api-key": key },
  });
  if (!res.ok || !res.data) return null;
  for (const [id, node] of Object.entries(res.data)) {
    if (node?.nodeName === nodeName) return { id, node };
  }
  return null;
}

export function registerTdarrActions(registry: ActionRegistry, deps: Deps): void {
  const withCfg = async (): Promise<{ url: string; key: string } | null> => {
    const cfg = await deps.cfg("tdarr");
    if (!cfg.url || !cfg.apiKey) return null;
    return { url: cfg.url, key: cfg.apiKey };
  };

  const relay = (
    base: { url: string; key: string },
    endpoint: string,
    data: Record<string, unknown>,
  ) =>
    deps.http(`${base.url}/api/v2/${endpoint}`, {
      method: "POST",
      headers: { "x-api-key": base.key, "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
      as: "text",
    });

  const setPaused = async (nodeName: string, paused: boolean): Promise<ActionResult> => {
    const base = await withCfg();
    if (!base) return notConfigured("tdarr");
    const resolved = await resolveNode(deps, base.url, base.key, nodeName);
    if (!resolved) return { ok: false, message: `node "${nodeName}" not connected` };
    const res = await relay(base, "update-node", {
      nodeID: resolved.id,
      nodeUpdates: { nodePaused: paused },
    });
    return fromFetch(res, `${nodeName} ${paused ? "paused" : "resumed"}`);
  };

  registry.register(
    defineAction({
      id: "tdarr.pause-node",
      label: "Pause Tdarr node",
      service: "tdarr",
      blastRadius: "safe",
      requiredRole: "viewer",
      params: z.object({ nodeName: nodeNameSchema }),
      target: (p) => p.nodeName,
      executor: (p) => setPaused(p.nodeName, true),
    }),
  );
  registry.register(
    defineAction({
      id: "tdarr.resume-node",
      label: "Resume Tdarr node",
      service: "tdarr",
      blastRadius: "safe",
      requiredRole: "viewer",
      params: z.object({ nodeName: nodeNameSchema }),
      target: (p) => p.nodeName,
      executor: (p) => setPaused(p.nodeName, false),
    }),
  );
  registry.register(
    defineAction({
      id: "tdarr.pause-all-nodes",
      label: "Pause all Tdarr nodes",
      service: "tdarr",
      blastRadius: "safe",
      requiredRole: "viewer",
      palette: true,
      paletteParams: { target: "all-nodes" },
      params: z.object({}),
      target: () => "all-nodes",
      executor: async () => {
        const base = await withCfg();
        if (!base) return notConfigured("tdarr");
        const res = await deps.http<Record<string, RawNode>>(
          `${base.url}/api/v2/get-nodes`,
          { headers: { "x-api-key": base.key } },
        );
        if (!res.ok || !res.data) {
          return { ok: false, message: res.error ?? "get-nodes failed" };
        }
        const names: string[] = [];
        for (const [id, node] of Object.entries(res.data)) {
          const out = await relay(base, "update-node", {
            nodeID: id,
            nodeUpdates: { nodePaused: true },
          });
          if (out.ok && node.nodeName) names.push(node.nodeName);
        }
        return { ok: true, message: `paused: ${names.join(", ") || "none"}` };
      },
    }),
  );
  registry.register(
    defineAction({
      id: "tdarr.set-worker-limit",
      label: "Set node worker limit",
      service: "tdarr",
      blastRadius: "disruptive",
      requiredRole: "admin",
      warning:
        "Changes how many workers this node runs. On NasTNode keep GPU transcode at 1 — the N100's iGPU thrashes above that.",
      params: z.object({
        nodeName: nodeNameSchema,
        workerType: workerTypeSchema,
        limit: z.coerce.number().int().min(0).max(8),
      }),
      target: (p) => `${p.nodeName}/${p.workerType}`,
      executor: async (p) => {
        const base = await withCfg();
        if (!base) return notConfigured("tdarr");
        const resolved = await resolveNode(deps, base.url, base.key, p.nodeName);
        if (!resolved) return { ok: false, message: `node "${p.nodeName}" not connected` };
        const current = resolved.node.workerLimits?.[p.workerType] ?? 0;
        const delta = p.limit - current;
        // Tdarr's relay only steps by one; walk from current to requested.
        const process = delta > 0 ? "increase" : "decrease";
        for (let i = 0; i < Math.abs(delta); i++) {
          const res = await relay(base, "alter-worker-limit", {
            nodeID: resolved.id,
            process,
            workerType: p.workerType,
          });
          if (!res.ok) {
            return { ok: false, message: `step ${i + 1}/${Math.abs(delta)} failed` };
          }
        }
        return {
          ok: true,
          message: `${p.nodeName} ${p.workerType}: ${current} → ${p.limit}`,
        };
      },
    }),
  );
  registry.register(
    defineAction({
      id: "tdarr.cancel-transcode",
      label: "Cancel running transcode",
      service: "tdarr",
      blastRadius: "destructive",
      requiredRole: "admin",
      warning: "Kills the worker mid-transcode. Progress on the current file is thrown away.",
      params: z.object({
        nodeName: nodeNameSchema,
        workerId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "invalid worker id"),
      }),
      target: (p) => `${p.nodeName}/${p.workerId}`,
      executor: async (p) => {
        const base = await withCfg();
        if (!base) return notConfigured("tdarr");
        const resolved = await resolveNode(deps, base.url, base.key, p.nodeName);
        if (!resolved) return { ok: false, message: `node "${p.nodeName}" not connected` };
        const res = await relay(base, "kill-worker", {
          nodeID: resolved.id,
          workerID: p.workerId,
        });
        return fromFetch(res, "worker killed");
      },
    }),
  );
  registry.register(
    defineAction({
      id: "tdarr.scan-library",
      label: "Re-scan Tdarr library",
      service: "tdarr",
      blastRadius: "safe",
      requiredRole: "viewer",
      params: z.object({
        libraryId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "invalid library id"),
      }),
      target: (p) => `library-${p.libraryId}`,
      executor: async (p) => {
        const base = await withCfg();
        if (!base) return notConfigured("tdarr");
        const res = await relay(base, "scan-files", {
          scanConfig: { dbID: p.libraryId, arrayOrPath: [], mode: "scanFindNew" },
        });
        return fromFetch(res, "scan queued");
      },
    }),
  );
}
