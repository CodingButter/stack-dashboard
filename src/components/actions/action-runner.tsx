"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "./toaster";
import type { ActionMeta } from "@/actions/types";

export interface RunRequest {
  meta: ActionMeta;
  params: Record<string, unknown>;
  /** The confirm/audit target string, echoed in destructive type-to-confirm. */
  target: string;
  /** Called after a successful execution (e.g. refresh panel data). */
  onDone?: () => void;
}

const ActionRunnerContext = React.createContext<(req: RunRequest) => void>(() => {});

export function useActionRunner() {
  return React.useContext(ActionRunnerContext);
}

async function post(
  meta: ActionMeta,
  params: Record<string, unknown>,
  confirmText?: string,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const res = await fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actionId: meta.id, params, confirmText }),
  });
  try {
    return (await res.json()) as { ok: boolean; error?: string; message?: string };
  } catch {
    return { ok: false, error: `HTTP ${res.status}` };
  }
}

/**
 * The single client-side gate for executing actions:
 * safe → immediate with toast; disruptive → two-step dialog;
 * destructive → type-to-confirm dialog. The server enforces all of this
 * again — this component is UX, not security.
 */
export function ActionRunnerProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [pending, setPending] = React.useState<RunRequest | null>(null);
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const finish = React.useCallback(
    (req: RunRequest, res: { ok: boolean; error?: string; message?: string }) => {
      toast(res.ok ? "ok" : "error", res.ok ? (res.message ?? `${req.meta.label}: done`) : (res.error ?? "failed"));
      if (res.ok) req.onDone?.();
    },
    [toast],
  );

  const run = React.useCallback(
    (req: RunRequest) => {
      if (req.meta.blastRadius === "safe") {
        void post(req.meta, req.params).then((res) => finish(req, res));
        return;
      }
      setTyped("");
      setPending(req);
    },
    [finish],
  );

  const confirmString = pending ? `${pending.meta.id}/${pending.target}` : "";
  const destructive = pending?.meta.blastRadius === "destructive";

  const execute = async () => {
    if (!pending) return;
    setBusy(true);
    const res = await post(
      pending.meta,
      pending.params,
      destructive ? typed : undefined,
    );
    setBusy(false);
    setPending(null);
    finish(pending, res);
  };

  return (
    <ActionRunnerContext.Provider value={run}>
      {children}
      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className={destructive ? "text-status-down" : undefined}>
              {pending?.meta.label}
            </DialogTitle>
            <DialogDescription>
              {pending?.meta.warning ??
                (destructive
                  ? "This action is destructive and cannot be undone."
                  : "This action disrupts a running service.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="font-mono text-xs text-muted-foreground">
              target: <span className="text-foreground">{pending?.target}</span>
            </p>
            {destructive && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Type{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                    {confirmString}
                  </code>{" "}
                  to confirm:
                </p>
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={confirmString}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-xs"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              size="sm"
              disabled={busy || (destructive && typed !== confirmString)}
              onClick={() => void execute()}
            >
              {busy ? "Running…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ActionRunnerContext.Provider>
  );
}
