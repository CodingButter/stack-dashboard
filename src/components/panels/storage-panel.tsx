"use client";

import { DonutGauge } from "@/components/widgets/donut-gauge";
import { PanelCard } from "@/components/widgets/panel-card";
import { SparkLine } from "@/components/widgets/spark-line";
import { formatBytes } from "@/lib/format";
import type { Storage } from "@/lib/panels/schemas";
import { usePanelData } from "./use-panel-data";
import { UptimeRow } from "./uptime-row";

const LABELS = { agent: "NAS agent" };

export function StoragePanel() {
  const { data, error } = usePanelData<Storage>("/api/panels/storage");

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-sm text-muted-foreground">
        {error ? `Failed to load: ${error}` : "Loading storage…"}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PanelCard title="Tiers" subsystem="storage">
        {data.tiers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
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
        <p className="mt-3 text-center text-xs text-muted-foreground">
          hot NVMe /volume2 → cold RAID5+bcache /volume1 · valve 80% / 90% ·
          tier-mover nightly 05:30
        </p>
      </PanelCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PanelCard title="Cold tier fill" subsystem="storage">
          <SparkLine
            data={data.series.vol1UsedPct.map((x) => x.v)}
            color="var(--accent-storage)"
            height={72}
          />
        </PanelCard>
        <PanelCard title="Hot tier fill" subsystem="storage">
          <SparkLine
            data={data.series.vol2UsedPct.map((x) => x.v)}
            color="var(--accent-downloads)"
            height={72}
          />
        </PanelCard>
        <PanelCard title="bcache hit ratio" subsystem="storage">
          <SparkLine
            data={data.series.bcacheHitPct.map((x) => x.v)}
            color="var(--accent-machines)"
            height={72}
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            now{" "}
            <span className="stat-num text-foreground">
              {data.bcacheHitPct === null ? "—" : `${data.bcacheHitPct.toFixed(1)}%`}
            </span>
          </p>
        </PanelCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PanelCard title="Disk utilization" subsystem="storage">
          {data.disks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No disk data</p>
          ) : (
            <div className="flex flex-col gap-2">
              {data.disks
                .slice()
                .sort((a, b) => b.utilPct - a.utilPct)
                .map((d) => (
                  <div key={d.device} className="flex items-center gap-3">
                    <span className="stat-num w-20 shrink-0 text-xs">{d.device}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={
                          d.utilPct > 80
                            ? "h-full rounded-full bg-status-down"
                            : d.utilPct > 50
                              ? "h-full rounded-full bg-status-degraded"
                              : "h-full rounded-full bg-accent-storage"
                        }
                        style={{ width: `${Math.min(100, d.utilPct)}%` }}
                      />
                    </div>
                    <span className="stat-num w-24 shrink-0 text-right text-xs text-muted-foreground">
                      {d.utilPct.toFixed(1)}% · {d.awaitMs.toFixed(1)} ms
                    </span>
                  </div>
                ))}
            </div>
          )}
        </PanelCard>

        <PanelCard title="SMART" subsystem="storage">
          {data.smart.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No SMART data
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {data.smart.map((d) => (
                <div
                  key={d.device}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="stat-num truncate">{d.device}</p>
                    <p className="truncate text-xs text-muted-foreground">{d.model}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={
                        d.healthy === false
                          ? "font-bold text-status-down"
                          : d.healthy === true
                            ? "text-status-up"
                            : "text-muted-foreground"
                      }
                    >
                      {d.healthy === null ? "unknown" : d.healthy ? "healthy" : "FAILING"}
                    </p>
                    <p className="stat-num text-xs text-muted-foreground">
                      {d.temperatureC !== null ? `${d.temperatureC}°C · ` : ""}
                      {d.powerOnHours !== null
                        ? `${Math.round(d.powerOnHours / 24)}d on`
                        : ""}
                      {d.mediaErrors !== null && d.mediaErrors > 0
                        ? ` · ${d.mediaErrors} media errors`
                        : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </div>

      {data.rootFolders.length > 0 ? (
        <PanelCard title="Arr root folders" subsystem="downloads">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.rootFolders.map((rf) => (
              <div
                key={`${rf.app}:${rf.path}`}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-xs"
              >
                <span className="truncate">
                  <span className="uppercase text-muted-foreground">{rf.app}</span>{" "}
                  {rf.path}
                </span>
                <span className="stat-num shrink-0 text-muted-foreground">
                  {rf.accessible ? `${formatBytes(rf.freeSpace)} free` : "inaccessible"}
                </span>
              </div>
            ))}
          </div>
        </PanelCard>
      ) : null}

      <PanelCard title="Uptime" subsystem="alerts">
        <UptimeRow uptime={data.uptime} labels={LABELS} />
      </PanelCard>
    </div>
  );
}
