"use client";

import { KpiCard } from "@/components/widgets/kpi-card";
import { PanelCard } from "@/components/widgets/panel-card";
import { SparkLine } from "@/components/widgets/spark-line";
import { InfoDot } from "@/components/widgets/info-dot";
import type { GlossaryTerm } from "@/lib/glossary";
import type { Streams } from "@/lib/panels/schemas";
import { usePanelData } from "./use-panel-data";
import { UptimeRow } from "./uptime-row";
import { ActionButton } from '@/components/actions/action-button';

const LABELS = { plex: "Plex", tautulli: "Tautulli" };

export function StreamsPanel() {
  const { data, error } = usePanelData<Streams>("/api/panels/streams");

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-base text-muted-foreground">
        {error ? `Failed to load: ${error}` : "Loading streams…"}
      </div>
    );
  }

  const p = data.plex;
  const t = data.tautulli;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Active streams"
          info="active-streams"
          value={p?.count ?? 0}
          spark={
            <SparkLine
              data={data.series.sessions.map((x) => x.v)}
              color="var(--accent-plex)"
              height={32}
            />
          }
        />
        <KpiCard label="Direct play" value={p?.directPlay ?? 0} info="direct-play" />
        <KpiCard
          label="Transcoding"
          info="stream-transcode"
          value={p?.transcode ?? 0}
          delta={p && p.transcode > 0 ? "gpu busy" : undefined}
          deltaDirection={p && p.transcode > 0 ? "down" : undefined}
        />
        <KpiCard
          label="Bandwidth"
          info="stream-bandwidth"
          value={((p?.totalBitrateKbps ?? 0) / 1000).toFixed(1)}
          unit="Mbps"
          spark={
            <SparkLine
              data={data.series.bitrateKbps.map((x) => x.v / 1000)}
              color="var(--accent-plex)"
              height={32}
            />
          }
        />
      </div>

      <PanelCard title="Now playing" subsystem="plex" info="now-playing">
        {!p || p.sessions.length === 0 ? (
          <p className="py-8 text-center text-base text-muted-foreground">
            Nothing playing right now
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {p.sessions.map((s, i) => (
              <div
                key={i}
                className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-background/40 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-base font-medium">{s.title}</span>
                  <span
                    className={
                      s.decision === "transcode"
                        ? "shrink-0 rounded bg-status-degraded/15 px-1.5 py-0.5 text-sm font-semibold uppercase text-status-degraded"
                        : "shrink-0 rounded bg-status-up/15 px-1.5 py-0.5 text-sm font-semibold uppercase text-status-up"
                    }
                  >
                    {s.decision === "transcode" ? "transcode" : "direct"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="truncate">
                    {s.user} · {s.player} · {s.state}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="stat-num">
                      {(s.bandwidthKbps / 1000).toFixed(1)} Mbps
                    </span>
                    {s.sessionId ? (
                      <ActionButton
                        actionId="plex.terminate-stream"
                        params={{ sessionId: s.sessionId }}
                        target={s.sessionId}
                        variant="destructive"
                        size="sm"
                        className="h-6 px-1.5 text-sm"
                      >
                        Terminate
                      </ActionButton>
                    ) : null}
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-accent-plex"
                    style={{ width: `${Math.min(100, s.progressPct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </PanelCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PanelCard title="Tautulli breakdown" subsystem="plex" info="tautulli-breakdown">
          {!t ? (
            <p className="py-6 text-center text-base text-muted-foreground">
              No Tautulli data
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-base sm:grid-cols-3">
              <Stat label="Streams" value={t.streamCount} info="streams" />
              <Stat label="Direct play" value={t.directPlay} info="direct-play" />
              <Stat label="Direct stream" value={t.directStream} info="direct-stream" />
              <Stat label="Transcode" value={t.transcode} info="stream-transcode" />
              <Stat label="LAN" value={`${(t.lanBandwidth / 1000).toFixed(1)} Mbps`} info="lan" />
              <Stat label="WAN" value={`${(t.wanBandwidth / 1000).toFixed(1)} Mbps`} info="wan" />
            </dl>
          )}
        </PanelCard>

        <PanelCard title="Session history" subsystem="plex">
          <SparkLine
            data={data.series.sessions.map((x) => x.v)}
            color="var(--accent-plex)"
            height={96}
          />
          <p className="mt-2 text-right text-sm text-muted-foreground">
            sessions · last hour
          </p>
        </PanelCard>
      </div>

      <PanelCard title="Uptime" subsystem="alerts" info="uptime">
        <UptimeRow uptime={data.uptime} labels={LABELS} />
      </PanelCard>
    </div>
  );
}

function Stat({
  label,
  value,
  info,
}: {
  label: string;
  value: number | string;
  info?: GlossaryTerm;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="flex items-center gap-1 text-sm text-muted-foreground">
        {label}
        {info ? <InfoDot term={info} /> : null}
      </dt>
      <dd className="stat-num text-base">{value}</dd>
    </div>
  );
}
