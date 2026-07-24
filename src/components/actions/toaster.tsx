"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface Toast {
  id: number;
  kind: "ok" | "error";
  text: string;
}

const ToastContext = React.createContext<(kind: Toast["kind"], text: string) => void>(
  () => {},
);

export function useToast() {
  return React.useContext(ToastContext);
}

/** Minimal in-house toast — bottom-center stack, auto-dismiss after 4s. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(1);

  const push = React.useCallback((kind: Toast["kind"], text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto max-w-md rounded-md border px-3 py-2 font-mono text-xs shadow-lg backdrop-blur",
              t.kind === "ok"
                ? "border-border bg-card text-foreground"
                : "border-status-down/50 bg-card text-status-down",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
