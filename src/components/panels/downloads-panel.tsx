"use client";

import { KpiCard } from "@/components/widgets/kpi-card";
import { LiveTicker } from "@/components/widgets/live-ticker";
import { PanelCard } from "@/components/widgets/panel-card";
import { InfoDot } from "@/components/widgets/info-dot";
import { formatBps, formatBytes } from "@/lib/format";
import type { GlossaryTerm } from "@/lib/glossary";
import type { Downloads } from "@/lib/panels/schemas";
import { usePanelData } from "./use-panel-data";
import { UptimeRow } from "./uptime-row";
import { SparkLine } from '@/components/widgets/spark-line';
import { ActionButton } from '@/components/actions/action-button';
import { ProgressBar } from '@/components/widgets/progress-bar';

const LABELS = { sabnzbd: "SABnzbd", qbittorrent: "qBittorrent" };

export function DownloadsPanel() {
  const { data, error } = usePanelData<Downloads>(
    "/api/panels/downloads",
    4_000,
  );

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-base text-muted-foreground">
        {error ? `Failed to load: ${error}` : "Loading downloads…"}
      </div>
    );
  }

  const sab = data.sab;
  const qb = data.qbit;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Usenet speed"
          info="usenet-speed"
          value={formatBps(sab?.speedBps ?? 0)}
          delta={sab?.paused ? "paused" : undefined}
          deltaDirection={sab?.paused ? "down" : undefined}
          spark={
            <SparkLine
              data={data.series.sabSpeedBps.map((x) => x.v)}
              color="var(--accent-downloads)"
              height={32}
            />
          }
        />
        <KpiCard
          label="Torrent down"
          info="torrent-down"
          value={formatBps(qb?.dlSpeed ?? 0)}
          spark={
            <SparkLine
              data={data.series.qbitDlSpeed.map((x) => x.v)}
              color="var(--accent-downloads)"
              height={32}
            />
          }
        />
        <KpiCard
          label="Torrent up"
          info="torrent-up"
          value={formatBps(qb?.upSpeed ?? 0)}
          spark={
            <SparkLine
              data={data.series.qbitUpSpeed.map((x) => x.v)}
              color="var(--accent-downloads)"
              height={32}
            />
          }
        />
        <KpiCard
          label="Queue"
          info="sab-queue"
          value={sab?.queueSize ?? 0}
          unit={sab ? `jobs · ${formatBytes(sab.mbLeft * 1024 * 1024)} left` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PanelCard
          title="SABnzbd queue"
          subsystem="downloads"
          info="sab-queue"
          actions={
            sab ? (
              <ActionButton
                actionId={sab.paused ? "sab.resume-queue" : "sab.pause-queue"}
                target="queue"
                size="sm"
                className="h-7 px-2 text-sm"
              >
                {sab.paused ? "Resume" : "Pause"}
              </ActionButton>
            ) : null
          }
        >
          {!sab ? (
            <p className="py-6 text-center text-base text-muted-foreground">No SAB data</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>
                  status <span className="stat-num text-foreground">{sab.status}</span>
                </span>
                <span>
                  ETA <span className="stat-num text-foreground">{sab.timeLeft}</span>
                </span>
                <span>
                  governor{" "}
                  <span className="stat-num text-foreground">{sab.speedLimitPct}%</span>
                </span>
                <span>
                  disk free{" "}
                  <span className="stat-num text-foreground">
                    {sab.diskFreeGb.toFixed(0)} GB
                  </span>
                </span>
              </div>
              {sab.jobs.length === 0 ? (
                <p className="py-4 text-center text-base text-muted-foreground">
                  Queue empty
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {sab.jobs.slice(0, 8).map((j, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{j.name}</span>
                        <span className="stat-num shrink-0 text-muted-foreground">
                          {j.percent.toFixed(0)}% · {j.timeLeft}
                        </span>
                      </div>
                      <ProgressBar
                        value={j.percent}
                        barClassName="bg-accent-downloads"
                      />
                    </div>
                  ))}
                </div>
              )}
              {sab.totals ? (
                <p className="mt-3 text-right text-sm text-muted-foreground">
                  today {formatBytes(sab.totals.day)} · week {formatBytes(sab.totals.week)}{" "}
                  · month {formatBytes(sab.totals.month)}
                </p>
              ) : null}
            </>
          )}
        </PanelCard>

        <PanelCard
          title="qBittorrent"
          subsystem="downloads"
          info="qbittorrent"
          actions={
            qb ? (
              <div className="flex gap-1.5">
                <ActionButton actionId="qbit.pause-all" target="all" size="sm" className="h-7 px-2 text-sm">
                  Pause all
                </ActionButton>
                <ActionButton actionId="qbit.resume-all" target="all" size="sm" className="h-7 px-2 text-sm">
                  Resume all
                </ActionButton>
              </div>
            ) : null
          }
        >
          {!qb ? (
            <p className="py-6 text-center text-base text-muted-foreground">
              qBittorrent unreachable
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-base">
                <Stat label="Total" value={qb.total} info="qbittorrent" />
                <Stat label="Downloading" value={qb.downloading} info="torrent-down" />
                <Stat label="Seeding" value={qb.seeding} info="seeding" />
                <Stat label="Stalled" value={qb.stalled} info="stalled" />
                <Stat label="Errored" value={qb.errored} warn={qb.errored > 0} info="errored" />
                <Stat label="Seedboost" value={qb.seedboost} info="seedboost" />
              </dl>
              {Object.keys(qb.byCategory).length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {Object.entries(qb.byCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, n]) => (
                      <span
                        key={cat || "(none)"}
                        className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-sm text-muted-foreground"
                      >
                        {cat || "uncategorized"}{" "}
                        <span className="stat-num text-foreground">{n}</span>
                      </span>
                    ))}
                </div>
              ) : null}
            </>
          )}
        </PanelCard>
      </div>

      <PanelCard title="Throughput" subsystem="downloads" info="throughput">
        <LiveTicker
          unit="B/s"
          height={120}
          series={[
            {
              name: "usenet",
              color: "var(--accent-downloads)",
              data: data.series.sabSpeedBps.map((x) => x.v),
            },
            {
              name: "torrent dl",
              color: "var(--accent-plex)",
              data: data.series.qbitDlSpeed.map((x) => x.v),
            },
            {
              name: "torrent up",
              color: "var(--accent-tdarr)",
              data: data.series.qbitUpSpeed.map((x) => x.v),
            },
          ]}
        />
      </PanelCard>

      <PanelCard title="Uptime" subsystem="alerts" info="uptime">
        <UptimeRow uptime={data.uptime} labels={LABELS} />
      </PanelCard>
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
  info,
}: {
  label: string;
  value: number;
  warn?: boolean;
  info?: GlossaryTerm;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="flex items-center gap-1 text-sm text-muted-foreground">
        {label}
        {info ? <InfoDot term={info} /> : null}
      </dt>
      <dd className={warn ? "stat-num text-base font-bold text-status-down" : "stat-num text-base"}>
        {value}
      </dd>
    </div>
  );
}
