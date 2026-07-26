"use client";

import { DonutGauge } from "@/components/widgets/donut-gauge";
import { KpiCard } from "@/components/widgets/kpi-card";
import { LiveTicker } from "@/components/widgets/live-ticker";
import { PanelCard } from "@/components/widgets/panel-card";
import { SparkLine } from "@/components/widgets/spark-line";
import { StatusPill } from "@/components/widgets/status-pill";
import { InfoDot } from "@/components/widgets/info-dot";
import { formatAgo, formatBps, formatBytes } from "@/lib/format";
import type { Overview, Point, ServiceHealth } from "@/lib/panels/schemas";
import { usePanelData } from "./use-panel-data";

const SERVICE_LABELS: Record<string, string> = {
  agent: "NAS agent",
  plex: "Plex",
  tautulli: "Tautulli",
  sonarr: "Sonarr",
  radarr: "Radarr",
  prowlarr: "Prowlarr",
  seerr: "Seerr",
  sabnzbd: "SABnzbd",
  qbittorrent: "qBittorrent",
  tdarr: "Tdarr",
};

/** iowait above this gets alarm styling — the canary in every NAS incident. */
export const IOWAIT_WARN_PCT = 20;

function values(points: Point[]): number[] {
  return points.map((p) => Math.round(p.v * 10) / 10);
}

export function serviceToPill(s: ServiceHealth): "up" | "degraded" | "down" {
  if (!s.ok) return "down";
  if ((s.latencyMs ?? 0) > 2000) return "degraded";
  return "up";
}

export function OverviewPanel() {
  const { data, error } = usePanelData<Overview>("/api/panels/overview");

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-base text-muted-foreground">
        {error ? `Failed to load: ${error}` : "Loading panels…"}
      </div>
    );
  }

  const v = data.vitals;

  return (
    <div className="flex flex-col gap-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Active streams" value={data.kpis.streams} info="active-streams" unit={data.kpis.transcodes > 0 ? `· ${data.kpis.transcodes} tc` : undefined} />
        <KpiCard label="Download" value={formatBps(data.kpis.downloadSpeedBps)} info="torrent-down" />
        <KpiCard label="Upload" value={formatBps(data.kpis.uploadSpeedBps)} info="torrent-up" />
        <KpiCard label="Queue depth" value={data.kpis.queueDepth} unit="items" info="queue-depth" />
        <KpiCard label="Transcode" value={data.kpis.transcodeFps} unit="fps" info="stream-transcode" />
        <KpiCard
          label="Alerts"
          value={data.kpis.alerts}
          info="alerts"
          delta={data.kpis.alerts > 0 ? "attention" : "clear"}
          deltaDirection={data.kpis.alerts > 0 ? "down" : "up"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Storage tiers */}
        <PanelCard title="Storage tiers" subsystem="storage" info="storage-tiers">
          {data.tiers.length === 0 ? (
            <p className="py-6 text-center text-base text-muted-foreground">
              No agent data yet
            </p>
          ) : (
            <div className="flex flex-wrap items-start justify-around gap-4">
              {data.tiers.map((t) => (
                <DonutGauge
                  key={t.path}
                  value={t.usedPct}
                  label={t.label}
                  sublabel={`${formatBytes(t.usedBytes, 1)} / ${formatBytes(t.totalBytes, 1)}`}
                  thresholds={[{ at: 80 }, { at: 90 }]}
                />
              ))}
            </div>
          )}
          <p className="mt-3 text-center text-sm text-muted-foreground">
            valve thresholds 80% / 90% · tier-mover runs nightly 05:30
          </p>
        </PanelCard>

        {/* Service health grid */}
        <PanelCard title="Service health" subsystem="alerts" info="service-health">
          {data.services.length === 0 ? (
            <p className="py-6 text-center text-base text-muted-foreground">
              No polls recorded yet
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {data.services.map((s) => (
                <div
                  key={s.service}
                  className="flex flex-col gap-1 rounded-md border border-border/60 bg-background/40 px-2.5 py-2"
                >
                  <StatusPill
                    status={serviceToPill(s)}
                    label={SERVICE_LABELS[s.service] ?? s.service}
                    className="border-0 bg-transparent px-0"
                  />
                  <span className="stat-num text-sm text-muted-foreground">
                    {s.ok ? `${s.latencyMs ?? 0} ms` : `down · ${formatAgo(s.polledAt)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </div>

      {/* NAS vitals */}
      <PanelCard title="NAS vitals" subsystem="machines" info="nas-vitals">
        {!v ? (
          <p className="py-6 text-center text-base text-muted-foreground">
            NAS agent unreachable — no vitals snapshot
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="flex items-center gap-1 text-sm text-muted-foreground">CPU<InfoDot term="cpu" /></span>
                <span className="stat-num text-base">{v.cpuBusy.toFixed(1)}%</span>
              </div>
              <SparkLine data={values(v.cpuSeries)} height={64} color="var(--accent-machines)" />
            </div>
            <div data-warn={v.iowait > IOWAIT_WARN_PCT}>
              <div className="flex items-baseline justify-between">
                <span className="flex items-center gap-1 text-sm text-muted-foreground">iowait<InfoDot term="iowait" /></span>
                <span
                  className={
                    v.iowait > IOWAIT_WARN_PCT
                      ? "stat-num text-base font-bold text-status-down"
                      : "stat-num text-base"
                  }
                >
                  {v.iowait.toFixed(1)}%
                </span>
              </div>
              <SparkLine
                data={values(v.iowaitSeries)}
                height={64}
                color={v.iowait > IOWAIT_WARN_PCT ? "var(--status-down)" : "var(--accent-storage)"}
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="flex items-center gap-1 text-sm text-muted-foreground">Memory<InfoDot term="memory" /></span>
                <span className="stat-num text-base">{v.memUsedPct.toFixed(1)}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-accent-machines"
                  style={{ width: `${Math.min(100, v.memUsedPct)}%` }}
                />
              </div>
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                swap {v.swapUsedPct.toFixed(1)}% · load {v.load1.toFixed(2)}
                <InfoDot term="load" />
              </p>
            </div>
            <div>
              <LiveTicker
                unit="MB/s"
                height={64}
                series={[
                  { name: "rx", color: "var(--accent-downloads)", data: values(v.netRxSeries) },
                  { name: "tx", color: "var(--accent-plex)", data: values(v.netTxSeries) },
                ]}
              />
            </div>
          </div>
        )}
        {v ? (
          <p className="mt-3 flex flex-wrap items-center justify-end gap-1 text-right text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-0.5">bcache hit {v.bcacheHitPct.toFixed(1)}%<InfoDot term="bcache-hit-ratio" /></span> ·{" "}
            <span className="inline-flex items-center gap-0.5">D-state {v.dstate}<InfoDot term="d-state" /></span> ·{" "}
            <span className="inline-flex items-center gap-0.5">{v.failedUnits} failed units<InfoDot term="failed-units" /></span> · updated {formatAgo(v.polledAt)}
          </p>
        ) : null}
      </PanelCard>
    </div>
  );
}
