"use client";

import { KpiCard } from "@/components/widgets/kpi-card";
import { PanelCard } from "@/components/widgets/panel-card";
import { SparkLine } from "@/components/widgets/spark-line";
import { StatusPill } from "@/components/widgets/status-pill";
import type { TdarrPanel as TdarrData } from "@/lib/panels/schemas";
import { usePanelData } from "./use-panel-data";
import { UptimeRow } from "./uptime-row";
import { GovernorCard } from "./governor-card";
import { InfoDot } from "@/components/widgets/info-dot";
import { ActionButton } from '@/components/actions/action-button';
import { workerStage } from "@/lib/panels/tdarr-stage";
import { ProgressBar } from '@/components/widgets/progress-bar';

const LABELS = { tdarr: "Tdarr server" };

export function TdarrPanel() {
  const { data, error } = usePanelData<TdarrData>("/api/panels/tdarr");

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-base text-muted-foreground">
        {error ? `Failed to load: ${error}` : "Loading Tdarr…"}
      </div>
    );
  }

  const s = data.stats;
  const govNodes = new Map(
    (data.governor?.running ? data.governor.nodes : []).map((n) => [n.name, n]),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5">
        <KpiCard label="Library files" value={s?.totalFiles ?? 0} info="library-files" />
        <KpiCard label="Transcodes" value={s?.totalTranscodes ?? 0} info="transcodes" />
        <KpiCard label="Health checks" value={s?.totalHealthChecks ?? 0} info="health-checks" />
        <KpiCard
          label="Space saved"
          value={(s?.sizeDiffGb ?? 0).toFixed(0)}
          unit="GB"
          info="space-saved"
          delta={s && s.sizeDiffGb > 0 ? "reclaimed" : undefined}
          deltaDirection={s && s.sizeDiffGb > 0 ? "up" : undefined}
        />
        <KpiCard
          label="Queue depth"
          info="queue-depth"
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

      <GovernorCard governor={data.governor} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.nodes.length === 0 ? (
          <PanelCard title="Nodes" subsystem="tdarr">
            <p className="py-6 text-center text-base text-muted-foreground">
              No nodes connected
            </p>
          </PanelCard>
        ) : (
          data.nodes.map((n) => (
            <PanelCard key={n.nodeName} title={n.nodeName} subsystem="tdarr" info="tdarr-node">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusPill
                    status={n.paused ? "degraded" : "up"}
                    label={n.paused ? "paused" : "active"}
                    className="border-0 bg-transparent px-0"
                  />
                  {(() => {
                    const g = govNodes.get(n.nodeName);
                    if (!g) return null;
                    // schema:2 — a node deferring its write-back is still
                    // transcoding, not stopped. Show that distinctly; reserve
                    // "gov-paused" for a node genuinely held with no live worker.
                    if (g.replaceDeferred) {
                      return (
                        <span className="rounded bg-accent-tdarr/15 px-1.5 py-0.5 text-sm font-medium text-accent-tdarr">
                          transcoding · replace queued
                        </span>
                      );
                    }
                    if (g.pausedByGovernor && !g.activelyWorking) {
                      return (
                        <span className="rounded bg-status-degraded/15 px-1.5 py-0.5 text-sm font-medium text-status-degraded">
                          gov-paused
                        </span>
                      );
                    }
                    if (g.writing) {
                      return (
                        <span className="rounded bg-accent-tdarr/20 px-1.5 py-0.5 text-sm font-medium text-accent-tdarr">
                          writing
                          {g.laneHeldSecs != null ? ` · ${g.laneHeldSecs}s` : ""}
                        </span>
                      );
                    }
                    if (g.heavy) {
                      return (
                        <span className="rounded bg-accent-tdarr/15 px-1.5 py-0.5 text-sm font-medium text-accent-tdarr">
                          heavy I/O
                          {g.laneHeldSecs != null ? ` · ${g.laneHeldSecs}s` : ""}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    limits: {n.limits.transcodeGpu} GPU · {n.limits.transcodeCpu} CPU
                    <InfoDot term="node-limits" />
                  </span>
                  <ActionButton
                    actionId={n.paused ? "tdarr.resume-node" : "tdarr.pause-node"}
                    params={{ nodeName: n.nodeName }}
                    target={n.nodeName}
                    size="sm"
                    className="h-7 px-2 text-sm"
                  >
                    {n.paused ? "Resume" : "Pause"}
                  </ActionButton>
                </div>
              </div>
              {n.limitViolation ? (
                <p className="mb-2 rounded-md border border-status-down/40 bg-status-down/10 px-2 py-1.5 text-sm font-semibold text-status-down">
                  ⚠ NAS node worker limit violated — must stay ≤1 GPU / 0 CPU
                </p>
              ) : null}
              <p className="mb-2 flex items-center gap-1 text-sm text-muted-foreground">
                queue: {n.queue.transcode} transcode · {n.queue.healthcheck} healthcheck
                <InfoDot term="node-queue" />
              </p>
              {n.workers.length === 0 ? (
                <p className="py-3 text-center text-sm text-muted-foreground">
                  No active workers
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {n.workers.map((w, i) => {
                    const stage = workerStage(w.status);
                    // schema:3 — during Replace/Copy, Tdarr's own percent is 0,
                    // but the gate measures the growing .tmp on the NAS. Prefer
                    // that real write-back progress + throughput when present.
                    const rp = govNodes.get(n.nodeName)?.replaceProgress ?? null;
                    const showReplace = stage.isFinalizing && rp != null;
                    const replaceDeterminate = showReplace && rp!.pct != null;
                    return (
                      <div key={i} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2 text-base">
                          <span className="truncate">{w.file.split("/").pop() || stage.label}</span>
                          {stage.isTranscoding ? (
                            <span className="stat-num shrink-0 text-muted-foreground">
                              {w.fps > 0 ? `${w.fps.toFixed(0)} fps · ` : ""}
                              {w.percent.toFixed(0)}%{w.eta ? ` · ${w.eta}` : ""}
                            </span>
                          ) : showReplace ? (
                            <span className="stat-num shrink-0 text-muted-foreground">
                              {rp!.pct != null ? `${rp!.pct.toFixed(0)}%` : "starting…"}
                              {rp!.mbps != null ? ` · ${rp!.mbps.toFixed(1)} MB/s` : ""}
                            </span>
                          ) : null}
                        </div>
                        <div
                          className="flex items-center gap-1 text-sm text-muted-foreground"
                          title={w.status || undefined}
                        >
                          {stage.label}
                          <InfoDot term="worker-stage" />
                        </div>
                        {stage.bar === "none" ? null : replaceDeterminate ? (
                          <ProgressBar
                            value={rp!.pct!}
                            barClassName="bg-accent-tdarr"
                          />
                        ) : stage.bar === "determinate" ? (
                          <ProgressBar
                            value={w.percent}
                            barClassName="bg-accent-tdarr"
                          />
                        ) : (
                          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full w-full animate-pulse rounded-full bg-accent-tdarr" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </PanelCard>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PanelCard title="Queue depth" subsystem="tdarr" info="queue-depth">
          <SparkLine
            data={data.series.queueDepth.map((x) => x.v)}
            color="var(--accent-tdarr)"
            height={80}
          />
        </PanelCard>
        <PanelCard title="Active workers" subsystem="tdarr" info="active-workers">
          <SparkLine
            data={data.series.workersActive.map((x) => x.v)}
            color="var(--accent-machines)"
            height={80}
          />
        </PanelCard>
      </div>

      <PanelCard title="Uptime" subsystem="alerts" info="uptime">
        <UptimeRow uptime={data.uptime} labels={LABELS} />
      </PanelCard>
    </div>
  );
}
