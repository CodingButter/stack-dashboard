import { beforeAll, describe, expect, it } from "vitest";

import { ActionRegistry } from "../registry";
import type { ActionDef, BlastRadius, Role } from "../types";
import type { Deps, HttpFn } from "../services/deps";
import type { FetchOptions } from "@/poller/clients/http";

// register-all pulls the client/settings modules whose import chain reads env.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret!";

interface Call {
  url: string;
  opts: FetchOptions;
}

interface Harness {
  registry: ActionRegistry;
  calls: Call[];
  respond: (url: string) => unknown;
}

const CFG = {
  url: "http://svc.example:1234",
  apiKey: "KEY",
  username: "user",
  password: "pass",
};

let makeHarness: (respond?: (url: string) => unknown) => Harness;

beforeAll(async () => {
  const { registerAllActions } = await import("../register-all");
  makeHarness = (respond = () => ({})) => {
    const calls: Call[] = [];
    const http: HttpFn = async <T,>(url: string, opts: FetchOptions = {}) => {
      calls.push({ url, opts });
      return { ok: true, status: 200, data: respond(url) as T };
    };
    const deps: Deps = {
      http,
      cfg: async () => CFG,
      qbitLogin: async () => "QBT_SID_8081=abc",
    };
    const registry = new ActionRegistry();
    registerAllActions(registry, deps);
    return { registry, calls, respond };
  };
});

async function exec(h: Harness, id: string, params: Record<string, unknown>) {
  const action = h.registry.get(id) as ActionDef;
  const parsed = action.params.parse(params);
  return action.executor(parsed);
}

// The master action list — id -> [blastRadius, requiredRole].
const EXPECTED: Record<string, [BlastRadius, Role]> = {
  "plex.scan-library": ["safe", "viewer"],
  "plex.refresh-metadata": ["safe", "viewer"],
  "plex.terminate-stream": ["destructive", "admin"],
  "plex.empty-trash": ["destructive", "admin"],
  "plex.restart-container": ["destructive", "admin"],
  "sab.pause-queue": ["disruptive", "admin"],
  "sab.resume-queue": ["disruptive", "admin"],
  "sab.pause-job": ["disruptive", "admin"],
  "sab.resume-job": ["disruptive", "admin"],
  "sab.delete-job": ["destructive", "admin"],
  "sab.set-priority": ["disruptive", "admin"],
  "sab.set-speedlimit": ["disruptive", "admin"],
  "sab.retry-failed": ["disruptive", "admin"],
  "qbit.pause-all": ["disruptive", "admin"],
  "qbit.resume-all": ["disruptive", "admin"],
  "qbit.pause-torrent": ["disruptive", "admin"],
  "qbit.resume-torrent": ["disruptive", "admin"],
  "qbit.delete-torrent": ["destructive", "admin"],
  "qbit.recheck-torrent": ["disruptive", "admin"],
  "qbit.reannounce-torrent": ["disruptive", "admin"],
  "qbit.set-category": ["disruptive", "admin"],
  "qbit.set-share-limits": ["disruptive", "admin"],
  "qbit.set-global-limits": ["disruptive", "admin"],
  "sonarr.search-missing": ["safe", "viewer"],
  "sonarr.search-item": ["safe", "viewer"],
  "sonarr.grab-release": ["disruptive", "admin"],
  "sonarr.remove-queue-item": ["destructive", "admin"],
  "sonarr.toggle-monitored": ["disruptive", "admin"],
  "sonarr.set-quality-profile": ["disruptive", "admin"],
  "sonarr.delete-media-file": ["destructive", "admin"],
  "radarr.search-missing": ["safe", "viewer"],
  "radarr.search-item": ["safe", "viewer"],
  "radarr.grab-release": ["disruptive", "admin"],
  "radarr.remove-queue-item": ["destructive", "admin"],
  "radarr.toggle-monitored": ["disruptive", "admin"],
  "radarr.set-quality-profile": ["disruptive", "admin"],
  "radarr.delete-media-file": ["destructive", "admin"],
  "prowlarr.test-indexer": ["safe", "viewer"],
  "prowlarr.toggle-indexer": ["disruptive", "admin"],
  "seerr.approve-request": ["safe", "admin"],
  "seerr.decline-request": ["disruptive", "admin"],
  "tdarr.pause-node": ["disruptive", "admin"],
  "tdarr.resume-node": ["disruptive", "admin"],
  "tdarr.pause-all-nodes": ["disruptive", "admin"],
  "tdarr.set-worker-limit": ["disruptive", "admin"],
  "tdarr.cancel-transcode": ["destructive", "admin"],
  "tdarr.scan-library": ["safe", "viewer"],
  "auto.run-unit": ["disruptive", "admin"],
  "auto.restart-unit": ["destructive", "admin"],
  "auto.tiermover-dry-run": ["safe", "viewer"],
  "infra.container-start": ["safe", "admin"],
  "infra.container-stop": ["destructive", "admin"],
  "infra.container-restart": ["destructive", "admin"],
  "infra.reboot-nas": ["destructive", "admin"],
};

describe("registry completeness", () => {
  it("registers exactly the master action list with correct blast radius and role", () => {
    const h = makeHarness();
    const ids = h.registry.all().map((a) => a.id);
    expect(ids.sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const a of h.registry.all()) {
      const [blast, role] = EXPECTED[a.id]!;
      expect(a.blastRadius, a.id).toBe(blast);
      expect(a.requiredRole, a.id).toBe(role);
    }
  });

  it("every destructive action requires admin and has warning copy", () => {
    const h = makeHarness();
    for (const a of h.registry.all()) {
      if (a.blastRadius === "destructive") {
        expect(a.requiredRole, a.id).toBe("admin");
        expect(a.warning, a.id).toBeTruthy();
      }
    }
  });
});

describe("executor payload mapping", () => {
  it("tdarr pause resolves node id by name then hits the update-node relay", async () => {
    const h = makeHarness((url) =>
      url.includes("get-nodes")
        ? { xyz123: { _id: "xyz123", nodeName: "DevBeastNode" }, abc: { nodeName: "Other" } }
        : {},
    );
    const res = await exec(h, "tdarr.pause-node", { nodeName: "DevBeastNode" });
    expect(res.ok).toBe(true);
    expect(h.calls[0]!.url).toContain("/api/v2/get-nodes");
    const relay = h.calls[1]!;
    expect(relay.url).toContain("/api/v2/update-node");
    expect(JSON.parse(relay.opts.body!)).toEqual({
      data: { nodeID: "xyz123", nodeUpdates: { nodePaused: true } },
    });
  });

  it("tdarr set-worker-limit walks alter-worker-limit steps from the current limit", async () => {
    const h = makeHarness((url) =>
      url.includes("get-nodes")
        ? { n1: { nodeName: "BigBeastNode", workerLimits: { transcodegpu: 1 } } }
        : {},
    );
    const res = await exec(h, "tdarr.set-worker-limit", {
      nodeName: "BigBeastNode",
      workerType: "transcodegpu",
      limit: 3,
    });
    expect(res.ok).toBe(true);
    const steps = h.calls.filter((c) => c.url.includes("alter-worker-limit"));
    expect(steps).toHaveLength(2); // 1 -> 3
    expect(JSON.parse(steps[0]!.opts.body!)).toMatchObject({
      data: { nodeID: "n1", process: "increase", workerType: "transcodegpu" },
    });
  });

  it("tdarr executor fails cleanly when the node name is not connected", async () => {
    const h = makeHarness((url) => (url.includes("get-nodes") ? {} : {}));
    const res = await exec(h, "tdarr.pause-node", { nodeName: "GhostNode" });
    expect(res.ok).toBe(false);
    expect(h.calls).toHaveLength(1); // only get-nodes, no blind relay call
  });

  it("sab set-speedlimit maps to config/speedlimit with the percent value", async () => {
    const h = makeHarness();
    await exec(h, "sab.set-speedlimit", { percent: 40 });
    const url = new URL(h.calls[0]!.url);
    expect(url.pathname).toBe("/api");
    expect(url.searchParams.get("mode")).toBe("config");
    expect(url.searchParams.get("name")).toBe("speedlimit");
    expect(url.searchParams.get("value")).toBe("40");
    expect(url.searchParams.get("apikey")).toBe("KEY");
  });

  it("sab retry without nzoId maps to retry_all", async () => {
    const h = makeHarness();
    await exec(h, "sab.retry-failed", {});
    expect(new URL(h.calls[0]!.url).searchParams.get("mode")).toBe("retry_all");
  });

  it("arr remove-queue-item maps the blocklist flag into the DELETE query", async () => {
    const h = makeHarness();
    await exec(h, "sonarr.remove-queue-item", { queueId: 77, blocklist: true });
    const call = h.calls[0]!;
    expect(call.opts.method).toBe("DELETE");
    expect(call.url).toContain("/api/v3/queue/77?");
    expect(call.url).toContain("blocklist=true");
    expect(call.url).toContain("removeFromClient=true");
    expect(call.opts.headers?.["X-Api-Key"]).toBe("KEY");
  });

  it("radarr search-item posts a MoviesSearch command", async () => {
    const h = makeHarness();
    await exec(h, "radarr.search-item", { itemId: 5 });
    expect(h.calls[0]!.url).toContain("/api/v3/command");
    expect(JSON.parse(h.calls[0]!.opts.body!)).toEqual({
      name: "MoviesSearch",
      movieIds: [5],
    });
  });

  it("qbit delete sends lowercase hash and deleteFiles flag with the session cookie", async () => {
    const h = makeHarness();
    const hash = "A".repeat(40);
    await exec(h, "qbit.delete-torrent", { hash, deleteFiles: true });
    const call = h.calls[0]!;
    expect(call.url).toContain("/api/v2/torrents/delete");
    expect(call.opts.headers?.Cookie).toBe("QBT_SID_8081=abc");
    const form = new URLSearchParams(call.opts.body!);
    expect(form.get("hashes")).toBe("a".repeat(40));
    expect(form.get("deleteFiles")).toBe("true");
  });

  it("plex terminate encodes session id and reason into the terminate call", async () => {
    const h = makeHarness();
    await exec(h, "plex.terminate-stream", { sessionId: "abc-123", reason: "be nice & ask" });
    const url = h.calls[0]!.url;
    expect(url).toContain("/status/sessions/terminate");
    expect(url).toContain("sessionId=abc-123");
    expect(url).toContain(encodeURIComponent("be nice & ask"));
    expect(url).toContain("X-Plex-Token=KEY");
  });

  it("agent-backed restart sends bearer token and the X-Confirm second factor", async () => {
    const h = makeHarness();
    await exec(h, "infra.container-restart", { container: "sonarr" });
    const call = h.calls[0]!;
    expect(call.url).toBe(
      "http://svc.example:1234/actions/docker_restart?target=sonarr",
    );
    expect(call.opts.headers?.Authorization).toBe("Bearer KEY");
    expect(call.opts.headers?.["X-Confirm"]).toBe("docker_restart:sonarr");
  });

  it("agent-backed safe run-unit sends no X-Confirm", async () => {
    const h = makeHarness();
    await exec(h, "auto.run-unit", { unit: "tier-mover" });
    expect(h.calls[0]!.opts.headers?.["X-Confirm"]).toBeUndefined();
  });

  it("auto.run-unit rejects units outside the agent allowlist", async () => {
    const h = makeHarness();
    const action = h.registry.get("auto.run-unit") as ActionDef;
    expect(() => action.params.parse({ unit: "sshd" })).toThrow();
  });
});
