import { z } from "zod";

import { defineAction } from "../registry";
import type { ActionRegistry } from "../registry";
import type { ActionResult } from "../types";
import { fromFetch, notConfigured, type Deps, type HttpFn } from "./deps";

const idSchema = z.coerce.number().int().min(1);

interface ArrCallOpts {
  method?: string;
  body?: unknown;
}

function makeCaller(deps: Deps, service: string) {
  return async (path: string, opts: ArrCallOpts = {}): Promise<ActionResult> => {
    const cfg = await deps.cfg(service);
    if (!cfg.url || !cfg.apiKey) return notConfigured(service);
    const res = await deps.http(`${cfg.url}/api/v3${path}`, {
      method: opts.method ?? "GET",
      headers: {
        "X-Api-Key": cfg.apiKey,
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    return fromFetch(res);
  };
}

/** GET a resource, apply a patch, PUT it back — the arr way to toggle fields. */
async function getMutatePut(
  http: HttpFn,
  base: string,
  apiKey: string,
  path: string,
  patch: Record<string, unknown>,
): Promise<ActionResult> {
  const headers = { "X-Api-Key": apiKey };
  const current = await http<Record<string, unknown>>(`${base}${path}`, { headers });
  if (!current.ok || !current.data) {
    return { ok: false, message: current.error ?? "failed to load current state" };
  }
  const res = await http(`${base}${path}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ ...current.data, ...patch }),
  });
  return fromFetch(res);
}

/**
 * Sonarr and Radarr share the v3 API shape; this factory registers both.
 * `kind` decides item naming (series/movie) and the command vocabulary.
 */
export function registerArrActions(
  registry: ActionRegistry,
  deps: Deps,
  service: "sonarr" | "radarr",
): void {
  const call = makeCaller(deps, service);
  const kind = service === "sonarr" ? "series" : "movie";
  const itemPath = service === "sonarr" ? "/series" : "/movie";
  const filePath = service === "sonarr" ? "/episodefile" : "/moviefile";

  const command = (body: Record<string, unknown>) =>
    call("/command", { method: "POST", body });

  registry.register(
    defineAction({
      id: `${service}.search-missing`,
      label: `Search all missing (${service})`,
      service,
      blastRadius: "safe",
      requiredRole: "viewer",
      palette: true,
      paletteParams: { target: "missing" },
      params: z.object({}),
      target: () => "missing",
      executor: () =>
        command({
          name: service === "sonarr" ? "MissingEpisodeSearch" : "MissingMoviesSearch",
        }),
    }),
  );
  registry.register(
    defineAction({
      id: `${service}.search-item`,
      label: `Search ${kind}`,
      service,
      blastRadius: "safe",
      requiredRole: "viewer",
      params: z.object({
        itemId: idSchema,
        // Sonarr only: narrow to one season
        seasonNumber: z.coerce.number().int().min(0).optional(),
      }),
      target: (p) =>
        `${kind}-${p.itemId}${p.seasonNumber !== undefined ? `-s${p.seasonNumber}` : ""}`,
      executor: (p) => {
        if (service === "sonarr") {
          return p.seasonNumber !== undefined
            ? command({
                name: "SeasonSearch",
                seriesId: p.itemId,
                seasonNumber: p.seasonNumber,
              })
            : command({ name: "SeriesSearch", seriesId: p.itemId });
        }
        return command({ name: "MoviesSearch", movieIds: [p.itemId] });
      },
    }),
  );
  registry.register(
    defineAction({
      id: `${service}.grab-release`,
      label: `Grab release manually (${service})`,
      service,
      blastRadius: "disruptive",
      requiredRole: "admin",
      warning: "Pushes this exact release to the download client, bypassing automatic selection.",
      params: z.object({ guid: z.string().min(1).max(2048), indexerId: idSchema }),
      target: (p) => `indexer-${p.indexerId}`,
      executor: (p) =>
        call("/release", {
          method: "POST",
          body: { guid: p.guid, indexerId: p.indexerId },
        }),
    }),
  );
  registry.register(
    defineAction({
      id: `${service}.remove-queue-item`,
      label: `Remove from queue (${service})`,
      service,
      blastRadius: "destructive",
      requiredRole: "admin",
      warning:
        "Removes the download from the queue. With blocklist, this release is never grabbed again.",
      params: z.object({
        queueId: idSchema,
        blocklist: z.boolean().default(false),
        removeFromClient: z.boolean().default(true),
      }),
      target: (p) => `queue-${p.queueId}`,
      executor: (p) =>
        call(
          `/queue/${p.queueId}?removeFromClient=${p.removeFromClient}&blocklist=${p.blocklist}`,
          { method: "DELETE" },
        ),
    }),
  );
  registry.register(
    defineAction({
      id: `${service}.toggle-monitored`,
      label: `Toggle monitored (${service})`,
      service,
      blastRadius: "disruptive",
      requiredRole: "admin",
      params: z.object({ itemId: idSchema, monitored: z.boolean() }),
      target: (p) => `${kind}-${p.itemId}`,
      executor: async (p) => {
        const cfg = await deps.cfg(service);
        if (!cfg.url || !cfg.apiKey) return notConfigured(service);
        return getMutatePut(deps.http, `${cfg.url}/api/v3`, cfg.apiKey, `${itemPath}/${p.itemId}`, {
          monitored: p.monitored,
        });
      },
    }),
  );
  registry.register(
    defineAction({
      id: `${service}.set-quality-profile`,
      label: `Change quality profile (${service})`,
      service,
      blastRadius: "disruptive",
      requiredRole: "admin",
      warning: "Future grabs (and cutoff upgrades) follow the new profile.",
      params: z.object({ itemId: idSchema, qualityProfileId: idSchema }),
      target: (p) => `${kind}-${p.itemId}`,
      executor: async (p) => {
        const cfg = await deps.cfg(service);
        if (!cfg.url || !cfg.apiKey) return notConfigured(service);
        return getMutatePut(deps.http, `${cfg.url}/api/v3`, cfg.apiKey, `${itemPath}/${p.itemId}`, {
          qualityProfileId: p.qualityProfileId,
        });
      },
    }),
  );
  registry.register(
    defineAction({
      id: `${service}.delete-media-file`,
      label: `Delete media file (${service})`,
      service,
      blastRadius: "destructive",
      requiredRole: "admin",
      warning:
        "Deletes the media file from disk. Optionally re-searches so a replacement is grabbed.",
      params: z.object({
        fileId: idSchema,
        // Re-search the owning series/movie after deletion
        researchItemId: idSchema.optional(),
      }),
      target: (p) => `file-${p.fileId}`,
      executor: async (p) => {
        const del = await call(`${filePath}/${p.fileId}`, { method: "DELETE" });
        if (!del.ok || p.researchItemId === undefined) return del;
        const search =
          service === "sonarr"
            ? await command({ name: "SeriesSearch", seriesId: p.researchItemId })
            : await command({ name: "MoviesSearch", movieIds: [p.researchItemId] });
        return search.ok
          ? { ok: true, message: "file deleted, re-search queued" }
          : { ok: true, message: "file deleted, but re-search failed" };
      },
    }),
  );
}

export function registerProwlarrActions(registry: ActionRegistry, deps: Deps): void {
  const base = async () => {
    const cfg = await deps.cfg("prowlarr");
    if (!cfg.url || !cfg.apiKey) return null;
    return { url: `${cfg.url}/api/v1`, key: cfg.apiKey };
  };

  registry.register(
    defineAction({
      id: "prowlarr.test-indexer",
      label: "Test indexer",
      service: "prowlarr",
      blastRadius: "safe",
      requiredRole: "viewer",
      params: z.object({ indexerId: idSchema }),
      target: (p) => `indexer-${p.indexerId}`,
      executor: async (p) => {
        const b = await base();
        if (!b) return notConfigured("prowlarr");
        const headers = { "X-Api-Key": b.key };
        const idx = await deps.http<Record<string, unknown>>(
          `${b.url}/indexer/${p.indexerId}`,
          { headers },
        );
        if (!idx.ok || !idx.data) {
          return { ok: false, message: idx.error ?? "indexer not found" };
        }
        const res = await deps.http(`${b.url}/indexer/test`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(idx.data),
          timeoutMs: 30000,
        });
        return res.ok
          ? { ok: true, message: "indexer test passed" }
          : { ok: false, message: res.error ?? "indexer test failed" };
      },
    }),
  );
  registry.register(
    defineAction({
      id: "prowlarr.toggle-indexer",
      label: "Enable/disable indexer",
      service: "prowlarr",
      blastRadius: "disruptive",
      requiredRole: "admin",
      warning: "Disabling stops all searches through this indexer until re-enabled.",
      params: z.object({ indexerId: idSchema, enable: z.boolean() }),
      target: (p) => `indexer-${p.indexerId}`,
      executor: async (p) => {
        const b = await base();
        if (!b) return notConfigured("prowlarr");
        return getMutatePut(deps.http, b.url, b.key, `/indexer/${p.indexerId}`, {
          enable: p.enable,
        });
      },
    }),
  );
}

export function registerSeerrActions(registry: ActionRegistry, deps: Deps): void {
  const call = async (path: string): Promise<ActionResult> => {
    const cfg = await deps.cfg("seerr");
    if (!cfg.url || !cfg.apiKey) return notConfigured("seerr");
    const res = await deps.http(`${cfg.url}/api/v1${path}`, {
      method: "POST",
      headers: { "X-Api-Key": cfg.apiKey },
    });
    return fromFetch(res);
  };

  registry.register(
    defineAction({
      id: "seerr.approve-request",
      label: "Approve request",
      service: "seerr",
      blastRadius: "safe",
      requiredRole: "admin",
      params: z.object({ requestId: idSchema }),
      target: (p) => `request-${p.requestId}`,
      executor: (p) => call(`/request/${p.requestId}/approve`),
    }),
  );
  registry.register(
    defineAction({
      id: "seerr.decline-request",
      label: "Decline request",
      service: "seerr",
      blastRadius: "disruptive",
      requiredRole: "admin",
      warning: "The requester sees their request declined.",
      params: z.object({ requestId: idSchema }),
      target: (p) => `request-${p.requestId}`,
      executor: (p) => call(`/request/${p.requestId}/decline`),
    }),
  );
}
