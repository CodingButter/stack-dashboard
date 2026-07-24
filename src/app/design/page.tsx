import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { DonutGauge } from "@/components/widgets/donut-gauge";
import { KpiCard } from "@/components/widgets/kpi-card";
import { LiveTicker } from "@/components/widgets/live-ticker";
import { PanelCard } from "@/components/widgets/panel-card";
import { SparkLine } from "@/components/widgets/spark-line";
import { StatusPill } from "@/components/widgets/status-pill";
import { TrackerStrip, type TrackerCell } from "@/components/widgets/tracker-strip";

export const metadata: Metadata = { title: "Design gallery" };

function sampleTracker(seed: number): TrackerCell[] {
  return Array.from({ length: 48 }, (_, i) => {
    const r = Math.abs(Math.sin(seed * 37 + i * 1.7));
    const state = r > 0.96 ? "down" : r > 0.9 ? "degraded" : "up";
    return { state, tooltip: `${48 - i} polls ago — ${state}` };
  });
}

function wave(seed: number, n: number, base: number, amp: number): number[] {
  return Array.from({ length: n }, (_, i) =>
    Math.round(base + amp * Math.abs(Math.sin(seed + i / 3)) + (i % 5)),
  );
}

const services = [
  { name: "Plex", status: "up" as const },
  { name: "Sonarr", status: "up" as const },
  { name: "Radarr", status: "up" as const },
  { name: "Prowlarr", status: "degraded" as const },
  { name: "SABnzbd", status: "up" as const },
  { name: "qBittorrent", status: "down" as const },
  { name: "Tdarr", status: "up" as const },
  { name: "Seerr", status: "unknown" as const },
];

export default function DesignPage() {
  return (
    <AppShell title="Design gallery" alertCount={3}>
      <div className="mx-auto max-w-6xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Every widget primitive with sample data — the visual contract for the
          monitoring panels.
        </p>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Active streams"
            value={3}
            delta="+1"
            deltaDirection="up"
            spark={<SparkLine data={wave(1, 24, 2, 3)} color="var(--accent-plex)" />}
          />
          <KpiCard
            label="Download speed"
            value="84.2"
            unit="MB/s"
            delta="-12%"
            deltaDirection="down"
            spark={<SparkLine data={wave(2, 24, 60, 40)} color="var(--accent-downloads)" />}
          />
          <KpiCard
            label="Queue depth"
            value={127}
            delta="0"
            deltaDirection="flat"
            spark={<SparkLine data={wave(3, 24, 120, 15)} color="var(--accent-tdarr)" />}
          />
          <KpiCard
            label="Space saved"
            value="11.4"
            unit="TB"
            delta="+220 GB"
            deltaDirection="up"
            spark={<SparkLine data={wave(4, 24, 30, 25)} color="var(--accent-storage)" />}
          />
        </div>

        {/* Gauges — hot tier at 83% shows the 80% valve marker crossed */}
        <PanelCard title="Storage tiers" subsystem="storage">
          <div className="flex flex-wrap items-end justify-around gap-6">
            <DonutGauge
              value={83}
              label="Hot tier /volume2"
              sublabel="1.49 / 1.8 TB"
              thresholds={[{ at: 80 }, { at: 90 }]}
            />
            <DonutGauge
              value={64}
              label="Cold tier /volume1"
              sublabel="14.1 / 22 TB"
              thresholds={[{ at: 90 }]}
            />
            <DonutGauge value={31} label="NAS CPU" sublabel="load 1.24" />
            <DonutGauge
              value={94}
              label="Scratch"
              sublabel="valve: emergency"
              thresholds={[{ at: 80 }, { at: 90 }]}
            />
          </div>
        </PanelCard>

        {/* Tracker strips */}
        <PanelCard title="Service uptime — 48 polls" subsystem="machines">
          <div className="space-y-4">
            <TrackerStrip label="Plex" data={sampleTracker(1)} />
            <TrackerStrip label="Sonarr" data={sampleTracker(2)} />
            <TrackerStrip label="qBittorrent" data={sampleTracker(3)} />
          </div>
        </PanelCard>

        <div className="grid gap-3 lg:grid-cols-2">
          {/* Status pills */}
          <PanelCard title="Service status" subsystem="alerts">
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <StatusPill key={s.name} status={s.status} label={s.name} />
              ))}
            </div>
          </PanelCard>

          {/* Live ticker */}
          <PanelCard title="Network — eth0" subsystem="machines">
            <LiveTicker
              unit="MB/s"
              series={[
                { name: "rx", color: "var(--accent-machines)", data: wave(5, 40, 40, 60) },
                { name: "tx", color: "var(--accent-tdarr)", data: wave(6, 40, 15, 20) },
              ]}
            />
          </PanelCard>
        </div>

        {/* Accent swatches */}
        <PanelCard title="Subsystem accents">
          <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
            {(
              [
                ["storage", "bg-accent-storage"],
                ["plex", "bg-accent-plex"],
                ["downloads", "bg-accent-downloads"],
                ["tdarr", "bg-accent-tdarr"],
                ["alerts", "bg-accent-alerts"],
                ["machines", "bg-accent-machines"],
              ] as const
            ).map(([name, cls]) => (
              <div key={name} className="space-y-1.5">
                <div className={`h-10 rounded-md ${cls}`} />
                <span className="stat-num text-xs text-muted-foreground">{name}</span>
              </div>
            ))}
          </div>
        </PanelCard>
      </div>
    </AppShell>
  );
}
