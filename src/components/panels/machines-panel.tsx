"use client";

import { PanelCard } from "@/components/widgets/panel-card";
import { SparkLine } from "@/components/widgets/spark-line";
import { StatusPill } from "@/components/widgets/status-pill";
import { formatAgo, formatBytes, formatUptime } from "@/lib/format";
import type { Machine, Machines, Point } from "@/lib/panels/schemas";
import { usePanelData } from "./use-panel-data";

function values(points: Point[]): number[] {
  return points.map((p) => Math.round(p.v * 10) / 10);
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={warn ? "stat-num text-sm font-bold text-status-down" : "stat-num text-sm"}>
        {value}
      </span>
    </div>
  );
}

function MachineCard({ m }: { m: Machine }) {
  const s = m.stats;
  return (
    <PanelCard
      title={m.label}
      subsystem="machines"
      actions={
        <StatusPill
          status={m.online ? "up" : s ? "down" : "unknown"}
          label={m.online ? "online" : s ? `last seen ${formatAgo(m.lastSeen)}` : "no agent"}
        />
      }
    >
      {!s ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Agent not deployed on this box yet
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <Stat label="CPU" value={`${s.cpuBusy.toFixed(1)}%`} />
            <Stat label="iowait" value={`${s.iowait.toFixed(1)}%`} warn={s.iowait > 20} />
            <Stat label="Load" value={s.load1.toFixed(2)} />
            <Stat label="Mem" value={`${s.memUsedPct.toFixed(1)}%`} />
            <Stat label="D-state" value={String(s.dstate)} warn={s.dstate > 0} />
            <Stat label="Uptime" value={formatUptime(s.uptimeS)} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <span className="text-xs text-muted-foreground">cpu %</span>
              <SparkLine data={values(m.series.cpu)} color="var(--accent-machines)" />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">mem %</span>
              <SparkLine data={values(m.series.mem)} color="var(--accent-storage)" />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">net rx MB/s</span>
              <SparkLine data={values(m.series.netRx)} color="var(--accent-downloads)" />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">net tx MB/s</span>
              <SparkLine data={values(m.series.netTx)} color="var(--accent-plex)" />
            </div>
          </div>

          {s.disks.length > 0 ? (
            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Disks
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-xs uppercase text-muted-foreground">
                      <th className="pb-1 pr-4 font-medium">device</th>
                      <th className="pb-1 pr-4 font-medium">util %</th>
                      <th className="pb-1 font-medium">await ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.disks.map((d) => (
                      <tr key={d.device} className="border-t border-border/50">
                        <td className="py-1 pr-4 font-mono">{d.device}</td>
                        <td
                          className={
                            d.utilPct > 90
                              ? "stat-num py-1 pr-4 font-bold text-status-down"
                              : "stat-num py-1 pr-4"
                          }
                        >
                          {d.utilPct.toFixed(1)}
                        </td>
                        <td className="stat-num py-1">{d.awaitMs.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {s.bcacheHitPct > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  bcache hit ratio {s.bcacheHitPct.toFixed(1)}%
                </p>
              ) : null}
            </div>
          ) : null}

          {m.smart && m.smart.length > 0 ? (
            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                SMART
              </h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {m.smart.map((d) => (
                  <div
                    key={d.device}
                    className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-mono">{d.device.replace("/dev/", "")}</span>
                    <span className="stat-num text-muted-foreground">
                      {d.temperatureC != null ? `${d.temperatureC}°C` : "—"}
                      {d.sparePct != null ? ` · spare ${d.sparePct}%` : ""}
                      {d.mediaErrors != null && d.mediaErrors > 0 ? (
                        <span className="font-bold text-status-down"> · {d.mediaErrors} err</span>
                      ) : null}
                    </span>
                    <StatusPill
                      status={d.healthy === false ? "down" : d.healthy === true ? "up" : "unknown"}
                      label={d.healthy === false ? "FAIL" : d.healthy === true ? "OK" : "?"}
                      className="px-1.5 py-0 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {s.filesystems.map((f) => (
              <span key={f.path} className="stat-num">
                {f.path} {f.usedPct.toFixed(1)}% ({formatBytes(f.usedBytes)} /{" "}
                {formatBytes(f.totalBytes)})
              </span>
            ))}
            {s.failedUnits > 0 ? (
              <span className="rounded bg-status-degraded/15 px-1.5 py-0.5 font-medium text-status-degraded">
                {s.failedUnits} failed units
              </span>
            ) : null}
          </div>
        </div>
      )}
    </PanelCard>
  );
}

export function MachinesPanel() {
  const { data, error } = usePanelData<Machines>("/api/panels/machines");

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-sm text-muted-foreground">
        {error ? `Failed to load: ${error}` : "Loading machines…"}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {data.boxes.map((m) => (
        <MachineCard key={m.box} m={m} />
      ))}
    </div>
  );
}
