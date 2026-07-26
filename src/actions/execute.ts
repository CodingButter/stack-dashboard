import { z } from "zod";

import { ActionRegistry, DENIED_TARGETS, confirmStringFor } from "./registry";
import type { Role } from "./types";

export const actionRequestSchema = z.object({
  actionId: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
  confirmText: z.string().optional(),
});
export type ActionRequest = z.infer<typeof actionRequestSchema>;

export interface AuditSink {
  (entry: {
    userId: string;
    action: string;
    target?: string;
    detail?: unknown;
    result: "ok" | "denied" | "error";
  }): Promise<void>;
}

export interface ExecuteOutcome {
  status: number;
  body: { ok: boolean; message?: string; detail?: unknown; error?: string };
}

/**
 * The single dispatch path for every dashboard action. Order of checks is
 * deliberate: role → params → deny list → confirm → execute. Every attempt
 * that names a real action is audited, including denials and failures.
 */
export async function executeAction(
  registry: ActionRegistry,
  user: { id: string; username: string; role: Role },
  request: ActionRequest,
  audit: AuditSink,
): Promise<ExecuteOutcome> {
  const action = registry.get(request.actionId);
  if (!action) {
    return { status: 404, body: { ok: false, error: "unknown action" } };
  }

  if (action.requiredRole === "admin" && user.role !== "admin") {
    await audit({
      userId: user.id,
      action: action.id,
      detail: { reason: "role", role: user.role },
      result: "denied",
    });
    return { status: 403, body: { ok: false, error: "admin role required" } };
  }

  const parsed = action.params.safeParse(request.params);
  if (!parsed.success) {
    return {
      status: 400,
      body: { ok: false, error: `invalid params: ${parsed.error.issues[0]?.message}` },
    };
  }

  const target = action.target(parsed.data);

  if (DENIED_TARGETS.has(target)) {
    await audit({
      userId: user.id,
      action: action.id,
      target,
      detail: { reason: "deny-list" },
      result: "denied",
    });
    return { status: 403, body: { ok: false, error: `target is protected: ${target}` } };
  }

  if (action.blastRadius === "destructive") {
    const expected = confirmStringFor(action.id, target);
    if (request.confirmText === undefined || request.confirmText === "") {
      await audit({
        userId: user.id,
        action: action.id,
        target,
        detail: { reason: "confirm-missing" },
        result: "denied",
      });
      return { status: 428, body: { ok: false, error: `confirmation required: type "${expected}"` } };
    }
    if (request.confirmText !== expected) {
      await audit({
        userId: user.id,
        action: action.id,
        target,
        detail: { reason: "confirm-mismatch" },
        result: "denied",
      });
      return { status: 400, body: { ok: false, error: "confirmation text does not match" } };
    }
  }

  const started = Date.now();
  try {
    const result = await action.executor(parsed.data);
    await audit({
      userId: user.id,
      action: action.id,
      target,
      detail: {
        params: parsed.data,
        durationMs: Date.now() - started,
        ...(result.detail !== undefined ? { result: result.detail } : {}),
        ...(result.message ? { message: result.message } : {}),
      },
      result: result.ok ? "ok" : "error",
    });
    return {
      status: result.ok ? 200 : 502,
      body: { ok: result.ok, message: result.message, detail: result.detail },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "executor failed";
    await audit({
      userId: user.id,
      action: action.id,
      target,
      detail: { params: parsed.data, durationMs: Date.now() - started, error: message },
      result: "error",
    });
    return { status: 502, body: { ok: false, error: message } };
  }
}
