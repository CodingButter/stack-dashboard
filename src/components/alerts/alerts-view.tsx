"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BellOff, CheckCircle2 } from "lucide-react";

import type { AlertRow } from "@/app/api/alerts/query";
import { PanelCard } from "@/components/widgets/panel-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function severityBadge(sev: AlertRow["severity"]) {
  if (sev === "critical") return <Badge variant="destructive">critical</Badge>;
  if (sev === "warning")
    return (
      <Badge className="border-transparent bg-amber-500/15 text-amber-500">
        warning
      </Badge>
    );
  return <Badge variant="secondary">info</Badge>;
}

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export function AlertsView({
  active: initialActive,
  resolved,
  canAck,
}: {
  active: AlertRow[];
  resolved: AlertRow[];
  canAck: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = React.useState(initialActive);
  const [busy, setBusy] = React.useState<string | null>(null);
  const now = Date.now();

  React.useEffect(() => setActive(initialActive), [initialActive]);

  // Live-refresh the active list every 10 s so fires/resolves surface without
  // a manual reload (the engine reconciles server-side every ~15 s).
  React.useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await fetch("/api/alerts", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { alerts: AlertRow[] };
        setActive(body.alerts);
      } catch {
        /* transient */
      }
    }, 10_000);
    return () => clearInterval(t);
  }, []);

  async function ack(id: string) {
    setBusy(id);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setActive((prev) =>
          prev.map((a) => (a.id === id ? { ...a, acked: true } : a)),
        );
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PanelCard
        title={`Active alerts (${active.length})`}
        subsystem="alerts"
      >
        {active.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 className="size-7 text-status-up" />
            <p className="text-base text-muted-foreground">
              All clear — nothing is breaching.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {active.map((a) => (
              <li
                key={a.id}
                className={cn(
                  "flex items-start gap-3 py-3",
                  a.acked && "opacity-60",
                )}
              >
                <AlertTriangle
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    a.severity === "critical"
                      ? "text-status-down"
                      : a.severity === "warning"
                        ? "text-amber-500"
                        : "text-muted-foreground",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {severityBadge(a.severity)}
                    <span className="font-mono text-sm text-muted-foreground">
                      {a.ruleId}
                    </span>
                    <span className="font-mono text-sm text-foreground">
                      {a.target}
                    </span>
                    {a.acked && (
                      <Badge variant="outline" className="gap-1 text-sm">
                        <BellOff className="size-3" /> acked
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-base">{a.message}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground/70">
                    first seen {ago(a.firstSeen, now)} ago · last {ago(a.lastSeen, now)} ago
                  </p>
                </div>
                {canAck && !a.acked && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === a.id}
                    onClick={() => ack(a.id)}
                  >
                    {busy === a.id ? "…" : "Ack"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard title={`Recently resolved (${resolved.length})`} subsystem="machines">
        {resolved.length === 0 ? (
          <p className="py-6 text-center text-base text-muted-foreground">
            No resolved alerts yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">severity</th>
                  <th className="py-2 pr-3 font-medium">rule</th>
                  <th className="py-2 pr-3 font-medium">target</th>
                  <th className="py-2 pr-3 font-medium">message</th>
                  <th className="py-2 font-medium">resolved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {resolved.map((a) => (
                  <tr key={a.id} className="text-muted-foreground">
                    <td className="py-2 pr-3">{severityBadge(a.severity)}</td>
                    <td className="py-2 pr-3 font-mono">{a.ruleId}</td>
                    <td className="py-2 pr-3 font-mono">{a.target}</td>
                    <td className="max-w-64 truncate py-2 pr-3">{a.message}</td>
                    <td className="stat-num whitespace-nowrap py-2">
                      {a.resolvedAt
                        ? `${ago(a.resolvedAt, now)} ago`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>
    </div>
  );
}
