import { z } from "zod";

import { defineAction } from "../registry";
import type { ActionRegistry } from "../registry";
import type { ActionResult } from "../types";
import { fromFetch, notConfigured, type Deps } from "./deps";

// v1 infohash (40 hex) or v2 (64 hex); "all" is qBittorrent's own wildcard.
const hashSchema = z
  .string()
  .regex(/^([a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/, "invalid torrent hash");
const categorySchema = z
  .string()
  .max(64)
  .regex(/^[^\r\n]*$/, "invalid category");

export function registerQbitActions(registry: ActionRegistry, deps: Deps): void {
  const call = async (
    path: string,
    form: Record<string, string>,
  ): Promise<ActionResult> => {
    const cfg = await deps.cfg("qbittorrent");
    if (!cfg.url || !cfg.username || !cfg.password) return notConfigured("qbittorrent");
    const sid = await deps.qbitLogin(cfg.url, cfg.username, cfg.password);
    if (sid === null) return { ok: false, message: "qBittorrent login failed" };
    const res = await deps.http(`${cfg.url}/api/v2${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: cfg.url,
        ...(sid ? { Cookie: sid } : {}),
      },
      body: new URLSearchParams(form).toString(),
      as: "text",
    });
    return fromFetch(res);
  };

  registry.register(
    defineAction({
      id: "qbit.pause-all",
      label: "Pause all torrents",
      service: "qbittorrent",
      blastRadius: "safe",
      requiredRole: "viewer",
      palette: true,
      paletteParams: { target: "all" },
      params: z.object({}),
      target: () => "all",
      // qBittorrent 5.x renamed pause/resume -> stop/start
      executor: () => call("/torrents/stop", { hashes: "all" }),
    }),
  );
  registry.register(
    defineAction({
      id: "qbit.resume-all",
      label: "Resume all torrents",
      service: "qbittorrent",
      blastRadius: "safe",
      requiredRole: "viewer",
      palette: true,
      paletteParams: { target: "all" },
      params: z.object({}),
      target: () => "all",
      executor: () => call("/torrents/start", { hashes: "all" }),
    }),
  );
  registry.register(
    defineAction({
      id: "qbit.pause-torrent",
      label: "Pause torrent",
      service: "qbittorrent",
      blastRadius: "safe",
      requiredRole: "viewer",
      params: z.object({ hash: hashSchema }),
      target: (p) => p.hash.slice(0, 12),
      executor: (p) => call("/torrents/stop", { hashes: p.hash.toLowerCase() }),
    }),
  );
  registry.register(
    defineAction({
      id: "qbit.resume-torrent",
      label: "Resume torrent",
      service: "qbittorrent",
      blastRadius: "safe",
      requiredRole: "viewer",
      params: z.object({ hash: hashSchema }),
      target: (p) => p.hash.slice(0, 12),
      executor: (p) => call("/torrents/start", { hashes: p.hash.toLowerCase() }),
    }),
  );
  registry.register(
    defineAction({
      id: "qbit.delete-torrent",
      label: "Delete torrent",
      service: "qbittorrent",
      blastRadius: "destructive",
      requiredRole: "admin",
      warning:
        "Removes the torrent. With deleteFiles the downloaded data is destroyed on disk — seeding for this item ends permanently.",
      params: z.object({ hash: hashSchema, deleteFiles: z.boolean().default(false) }),
      target: (p) => p.hash.slice(0, 12),
      executor: (p) =>
        call("/torrents/delete", {
          hashes: p.hash.toLowerCase(),
          deleteFiles: p.deleteFiles ? "true" : "false",
        }),
    }),
  );
  registry.register(
    defineAction({
      id: "qbit.recheck-torrent",
      label: "Recheck torrent",
      service: "qbittorrent",
      blastRadius: "safe",
      requiredRole: "viewer",
      params: z.object({ hash: hashSchema }),
      target: (p) => p.hash.slice(0, 12),
      executor: (p) => call("/torrents/recheck", { hashes: p.hash.toLowerCase() }),
    }),
  );
  registry.register(
    defineAction({
      id: "qbit.reannounce-torrent",
      label: "Reannounce torrent",
      service: "qbittorrent",
      blastRadius: "safe",
      requiredRole: "viewer",
      params: z.object({ hash: hashSchema }),
      target: (p) => p.hash.slice(0, 12),
      executor: (p) => call("/torrents/reannounce", { hashes: p.hash.toLowerCase() }),
    }),
  );
  registry.register(
    defineAction({
      id: "qbit.set-category",
      label: "Set torrent category",
      service: "qbittorrent",
      blastRadius: "safe",
      requiredRole: "viewer",
      params: z.object({ hash: hashSchema, category: categorySchema }),
      target: (p) => p.hash.slice(0, 12),
      executor: (p) =>
        call("/torrents/setCategory", {
          hashes: p.hash.toLowerCase(),
          category: p.category,
        }),
    }),
  );
  registry.register(
    defineAction({
      id: "qbit.set-share-limits",
      label: "Set torrent share limits",
      service: "qbittorrent",
      blastRadius: "disruptive",
      requiredRole: "admin",
      warning: "Changes ratio/seed-time limits — affects when this torrent stops seeding.",
      params: z.object({
        hash: hashSchema,
        // -2 = use global, -1 = unlimited
        ratioLimit: z.coerce.number().min(-2).default(-2),
        seedingTimeLimit: z.coerce.number().int().min(-2).default(-2),
      }),
      target: (p) => p.hash.slice(0, 12),
      executor: (p) =>
        call("/torrents/setShareLimits", {
          hashes: p.hash.toLowerCase(),
          ratioLimit: String(p.ratioLimit),
          seedingTimeLimit: String(p.seedingTimeLimit),
          inactiveSeedingTimeLimit: "-2",
        }),
    }),
  );
  registry.register(
    defineAction({
      id: "qbit.set-global-limits",
      label: "Set global transfer caps",
      service: "qbittorrent",
      blastRadius: "disruptive",
      requiredRole: "admin",
      warning: "Sets qBittorrent's global down/up caps (0 = unlimited).",
      params: z.object({
        dlKbps: z.coerce.number().int().min(0).max(10_000_000),
        upKbps: z.coerce.number().int().min(0).max(10_000_000),
      }),
      target: (p) => `dl${p.dlKbps}-up${p.upKbps}`,
      executor: async (p) => {
        const dl = await call("/transfer/setDownloadLimit", {
          limit: String(p.dlKbps * 1024),
        });
        if (!dl.ok) return dl;
        return call("/transfer/setUploadLimit", { limit: String(p.upKbps * 1024) });
      },
    }),
  );
}
