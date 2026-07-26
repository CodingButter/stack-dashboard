"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { PanelCard } from "@/components/widgets/panel-card";
import { SparkLine } from "@/components/widgets/spark-line";
import { StatusPill } from "@/components/widgets/status-pill";
import { InfoDot } from "@/components/widgets/info-dot";
import { formatAgo, formatBytes, formatUptime } from "@/lib/format";
import type { GlossaryTerm } from "@/lib/glossary";
import type { Machine, Machines, Point } from "@/lib/panels/schemas";
import { usePanelData } from "./use-panel-data";

function values(points: Point[]): number[] {
  return points.map((p) => Math.round(p.v * 10) / 10);
}

function lastVal(points: Point[]): number {
  return points.length ? Math.round(points[points.length - 1].v * 10) / 10 : 0;
}

/** A single machine metric boxed on its own so the four graphs don't blur together. */
function VitalTile({
  label,
  value,
  info,
  data,
  color,
}: {
  label: string;
  value: string;
  info?: GlossaryTerm;
  data: number[];
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          {label}
          {info ? <InfoDot term={info} /> : null}
        </span>
        <span className="stat-num text-base">{value}</span>
      </div>
      <SparkLine data={data} height={64} color={color} />
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
  value: string;
  warn?: boolean;
  info?: GlossaryTerm;
}) {
  return (
    <div className="flex flex-col">
      <span className="flex items-center gap-1 text-sm uppercase tracking-wide text-muted-foreground">
        {label}
        {info ? <InfoDot term={info} /> : null}
      </span>
      <span className={warn ? "stat-num text-base font-bold text-status-down" : "stat-num text-base"}>
        {value}
      </span>
    </div>
  );
}

function MachineCard({ m }: { m: Machine }) {
  const s = m.stats;
  // Boxes with a lot of disks (e.g. the NAS array) start with the Disks table
  // collapsed so a single machine doesn't dominate the page; small boxes stay open.
  const manyDisks = (s?.disks.length ?? 0) > 3;
  const [disksOpen, setDisksOpen] = useState(!manyDisks);
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
        <p className="py-8 text-center text-base text-muted-foreground">
          Agent not deployed on this box yet
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <Stat label="CPU" value={`${s.cpuBusy.toFixed(1)}%`} info="cpu" />
            <Stat label="iowait" value={`${s.iowait.toFixed(1)}%`} warn={s.iowait > 20} info="iowait" />
            <Stat label="Load" value={s.load1.toFixed(2)} info="load" />
            <Stat label="Mem" value={`${s.memUsedPct.toFixed(1)}%`} info="memory" />
            <Stat label="D-state" value={String(s.dstate)} warn={s.dstate > 0} info="d-state" />
            <Stat label="Uptime" value={formatUptime(s.uptimeS)} info="uptime" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <VitalTile
              label="cpu %"
              value={`${s.cpuBusy.toFixed(1)}%`}
              info="cpu"
              data={values(m.series.cpu)}
              color="var(--accent-machines)"
            />
            <VitalTile
              label="mem %"
              value={`${s.memUsedPct.toFixed(1)}%`}
              info="memory"
              data={values(m.series.mem)}
              color="var(--accent-storage)"
            />
            <VitalTile
              label="net rx MB/s"
              value={lastVal(m.series.netRx).toFixed(1)}
              data={values(m.series.netRx)}
              color="var(--accent-downloads)"
            />
            <VitalTile
              label="net tx MB/s"
              value={lastVal(m.series.netTx).toFixed(1)}
              data={values(m.series.netTx)}
              color="var(--accent-plex)"
            />
          </div>

          {s.disks.length > 0 ? (
            <div>
              <h4 className="mb-1.5 flex items-center gap-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {manyDisks ? (
                  <button
                    type="button"
                    onClick={() => setDisksOpen((o) => !o)}
                    className="flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground"
                    aria-expanded={disksOpen}
                  >
                    <ChevronDown
                      className={`size-3.5 transition-transform ${disksOpen ? "" : "-rotate-90"}`}
                    />
                    Disks
                    <span className="normal-case text-muted-foreground/70">({s.disks.length})</span>
                  </button>
                ) : (
                  <>Disks</>
                )}
                <InfoDot term="disk-utilization" />
              </h4>
              {disksOpen ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-sm uppercase text-muted-foreground">
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
              ) : null}
              {s.bcacheHitPct > 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  bcache hit ratio {s.bcacheHitPct.toFixed(1)}%
                </p>
              ) : null}
            </div>
          ) : null}

          {m.smart && m.smart.length > 0 ? (
            <div>
              <h4 className="mb-1.5 flex items-center gap-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                SMART
                <InfoDot term="smart" />
              </h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {m.smart.map((d) => (
                  <div
                    key={d.device}
                    className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 text-sm"
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
                      className="px-1.5 py-0 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
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
  const { data, error } = usePanelData<Machines>("/api/panels/machines", 5_000);

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-base text-muted-foreground">
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
