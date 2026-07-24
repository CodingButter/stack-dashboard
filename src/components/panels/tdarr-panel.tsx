"use client";

import { KpiCard } from "@/components/widgets/kpi-card";
import { PanelCard } from "@/components/widgets/panel-card";
import { SparkLine } from "@/components/widgets/spark-line";
import { StatusPill } from "@/components/widgets/status-pill";
import type { TdarrPanel as TdarrData } from "@/lib/panels/schemas";
import { usePanelData } from "./use-panel-data";
import { UptimeRow } from "./uptime-row";

const LABELS = { tdarr: "Tdarr server" };

export function TdarrPanel() {
  const { data, error } = usePanelData<TdarrData>("/api/panels/tdarr");

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-sm text-muted-foreground">
        {error ? `Failed to load: ${error}` : "Loading Tdarr…"}
      </div>
    );
  }

  const s = data.stats;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5">
        <KpiCard label="Library files" value={s?.totalFiles ?? 0} />
        <KpiCard label="Transcodes" value={s?.totalTranscodes ?? 0} />
        <KpiCard label="Health checks" value={s?.totalHealthChecks ?? 0} />
        <KpiCard
          label="Space saved"
          value={(s?.sizeDiffGb ?? 0).toFixed(0)}
          unit="GB"
          delta={s && s.sizeDiffGb > 0 ? "reclaimed" : undefined}
          deltaDirection={s && s.sizeDiffGb > 0 ? "up" : undefined}
        />
        <KpiCard
          label="Queue depth"
          value={data.series.queueDepth.at(-1)?.v ?? 0}
          spark={
            <SparkLine
              data={data.series.queueDepth.map((x) => x.v)}
              color="var(--accent-tdarr)"
              height={32}
            />
          }
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.nodes.length === 0 ? (
          <PanelCard title="Nodes" subsystem="tdarr">
            <p className="py-6 text-center text-sm text-muted-foreground">
              No nodes connected
            </p>
          </PanelCard>
        ) : (
          data.nodes.map((n) => (
            <PanelCard key={n.nodeName} title={n.nodeName} subsystem="tdarr">
              <div className="mb-2 flex items-center justify-between">
                <StatusPill
                  status={n.paused ? "degraded" : "up"}
                  label={n.paused ? "paused" : "active"}
                  className="border-0 bg-transparent px-0"
                />
                <span className="text-[11px] text-muted-foreground">
                  limits: {n.limits.transcodeGpu} GPU · {n.limits.transcodeCpu} CPU
                </span>
              </div>
              {n.limitViolation ? (
                <p className="mb-2 rounded-md border border-status-down/40 bg-status-down/10 px-2 py-1.5 text-[11px] font-semibold text-status-down">
                  ⚠ NAS node worker limit violated — must stay ≤1 GPU / 0 CPU
                </p>
              ) : null}
              <p className="mb-2 text-[11px] text-muted-foreground">
                queue: {n.queue.transcode} transcode · {n.queue.healthcheck} healthcheck
              </p>
              {n.workers.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  No active workers
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {n.workers.map((w, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{w.file.split("/").pop() || w.status}</span>
                        <span className="stat-num shrink-0 text-muted-foreground">
                          {w.fps > 0 ? `${w.fps.toFixed(0)} fps · ` : ""}
                          {w.percent.toFixed(0)}%{w.eta ? ` · ${w.eta}` : ""}
                        </span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-accent-tdarr"
                          style={{ width: `${Math.min(100, w.percent)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PanelCard>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PanelCard title="Queue depth" subsystem="tdarr">
          <SparkLine
            data={data.series.queueDepth.map((x) => x.v)}
            color="var(--accent-tdarr)"
            height={80}
          />
        </PanelCard>
        <PanelCard title="Active workers" subsystem="tdarr">
          <SparkLine
            data={data.series.workersActive.map((x) => x.v)}
            color="var(--accent-machines)"
            height={80}
          />
        </PanelCard>
      </div>

      <PanelCard title="Uptime" subsystem="alerts">
        <UptimeRow uptime={data.uptime} labels={LABELS} />
      </PanelCard>
    </div>
  );
}
