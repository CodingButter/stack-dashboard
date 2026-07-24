import { describe, expect, it } from "vitest";
import { z } from "zod";

import { executeAction } from "../execute";
import { ActionRegistry, confirmStringFor, defineAction } from "../registry";
import type { ActionResult } from "../types";

type AuditRow = {
  userId: string;
  action: string;
  target?: string;
  detail?: unknown;
  result: "ok" | "denied" | "error";
};

function harness(executor?: (params: { name: string }) => Promise<ActionResult>) {
  const registry = new ActionRegistry();
  const audits: AuditRow[] = [];
  const audit = async (entry: AuditRow) => {
    audits.push(entry);
  };

  registry.register(
    defineAction({
      id: "test.safe",
      label: "Safe thing",
      service: "test",
      blastRadius: "safe",
      requiredRole: "viewer",
      params: z.object({ name: z.string() }),
      target: (p) => p.name,
      executor: executor ?? (async () => ({ ok: true, message: "did it" })),
    }),
  );
  registry.register(
    defineAction({
      id: "test.destroy",
      label: "Destroy thing",
      service: "test",
      blastRadius: "destructive",
      requiredRole: "admin",
      params: z.object({ name: z.string() }),
      target: (p) => p.name,
      executor: executor ?? (async () => ({ ok: true })),
    }),
  );

  const admin = { id: "u1", username: "root", role: "admin" as const };
  const viewer = { id: "u2", username: "watcher", role: "viewer" as const };
  return { registry, audits, audit, admin, viewer };
}

describe("action framework", () => {
  it("unknown action -> 404, no audit", async () => {
    const h = harness();
    const out = await executeAction(h.registry, h.admin, { actionId: "nope", params: {} }, h.audit);
    expect(out.status).toBe(404);
    expect(h.audits).toHaveLength(0);
  });

  it("viewer blocked from admin action -> 403 with denial audited", async () => {
    const h = harness();
    const out = await executeAction(
      h.registry,
      h.viewer,
      { actionId: "test.destroy", params: { name: "x" } },
      h.audit,
    );
    expect(out.status).toBe(403);
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({ userId: "u2", action: "test.destroy", result: "denied" });
  });

  it("invalid params -> 400", async () => {
    const h = harness();
    const out = await executeAction(
      h.registry,
      h.admin,
      { actionId: "test.safe", params: { name: 42 as unknown as string } },
      h.audit,
    );
    expect(out.status).toBe(400);
  });

  it("deny-listed target -> 403, denial audited, executor never runs", async () => {
    let ran = false;
    const h = harness(async () => {
      ran = true;
      return { ok: true };
    });
    const out = await executeAction(
      h.registry,
      h.admin,
      {
        actionId: "test.destroy",
        params: { name: "wren-brain-pg" },
        confirmText: confirmStringFor("test.destroy", "wren-brain-pg"),
      },
      h.audit,
    );
    expect(out.status).toBe(403);
    expect(ran).toBe(false);
    expect(h.audits[0]).toMatchObject({ result: "denied", target: "wren-brain-pg" });
  });

  it("destructive without confirmText -> 428, denial audited", async () => {
    const h = harness();
    const out = await executeAction(
      h.registry,
      h.admin,
      { actionId: "test.destroy", params: { name: "thing" } },
      h.audit,
    );
    expect(out.status).toBe(428);
    expect(h.audits[0]?.result).toBe("denied");
  });

  it("destructive with wrong confirmText -> 400, denial audited", async () => {
    const h = harness();
    const out = await executeAction(
      h.registry,
      h.admin,
      { actionId: "test.destroy", params: { name: "thing" }, confirmText: "test.destroy/other" },
      h.audit,
    );
    expect(out.status).toBe(400);
    expect(h.audits[0]?.result).toBe("denied");
  });

  it("destructive with exact confirmText executes and audits ok", async () => {
    const h = harness();
    const out = await executeAction(
      h.registry,
      h.admin,
      {
        actionId: "test.destroy",
        params: { name: "thing" },
        confirmText: confirmStringFor("test.destroy", "thing"),
      },
      h.audit,
    );
    expect(out.status).toBe(200);
    expect(h.audits[0]).toMatchObject({ action: "test.destroy", target: "thing", result: "ok" });
  });

  it("safe action success audited with duration", async () => {
    const h = harness();
    const out = await executeAction(
      h.registry,
      h.viewer,
      { actionId: "test.safe", params: { name: "thing" } },
      h.audit,
    );
    expect(out.status).toBe(200);
    expect(out.body.message).toBe("did it");
    const detail = h.audits[0]?.detail as { durationMs: number };
    expect(detail.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("executor throw -> 502 with error audited", async () => {
    const h = harness(async () => {
      throw new Error("agent unreachable");
    });
    const out = await executeAction(
      h.registry,
      h.viewer,
      { actionId: "test.safe", params: { name: "thing" } },
      h.audit,
    );
    expect(out.status).toBe(502);
    expect(h.audits[0]).toMatchObject({ result: "error" });
  });

  it("executor ok:false -> 502 audited as error", async () => {
    const h = harness(async () => ({ ok: false, message: "service said no" }));
    const out = await executeAction(
      h.registry,
      h.viewer,
      { actionId: "test.safe", params: { name: "thing" } },
      h.audit,
    );
    expect(out.status).toBe(502);
    expect(h.audits[0]?.result).toBe("error");
  });

  it("duplicate registration throws", () => {
    const h = harness();
    expect(() =>
      h.registry.register(
        defineAction({
          id: "test.safe",
          label: "dup",
          service: "test",
          blastRadius: "safe",
          requiredRole: "viewer",
          params: z.object({}),
          target: () => "x",
          executor: async () => ({ ok: true }),
        }),
      ),
    ).toThrow(/duplicate/);
  });

  it("metaForRole hides admin actions from viewer and strips executors", () => {
    const h = harness();
    const viewerMeta = h.registry.metaForRole("viewer");
    expect(viewerMeta.map((m) => m.id)).toEqual(["test.safe"]);
    const adminMeta = h.registry.metaForRole("admin");
    expect(adminMeta.map((m) => m.id)).toEqual(["test.destroy", "test.safe"]);
    for (const m of adminMeta) {
      expect(m).not.toHaveProperty("executor");
      expect(m).not.toHaveProperty("params");
    }
  });
});
