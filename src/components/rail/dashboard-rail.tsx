"use client";

import { PanelCard } from "@/components/widgets/panel-card";
import type { Rail } from "@/lib/panels/schemas";
import { usePanelData } from "@/components/panels/use-panel-data";
import { IngestionDonut, type DonutSegment } from "./ingestion-donut";
import { StreamsOverview } from "./streams-overview";

/**
 * The persistent desktop right-rail content. Polls /api/panels/rail via the
 * canonical usePanelData hook (keep-last-good, abort-on-unmount) and renders
 * the two widgets whose data exists today: the Ingestion donut and the Streams
 * overview. Recent Activity and Top Users are deferred to later slices — the
 * rail reserves no fake placeholders for them.
 */
export function DashboardRail() {
  const { data, error } = usePanelData<Rail>("/api/panels/rail");

  const segments: DonutSegment[] = [
    {
      key: "processing",
      label: "Processing",
      value: data?.ingestion.processing ?? 0,
      strokeClass: "stroke-accent-tdarr",
      dotClass: "bg-accent-tdarr",
    },
    {
      key: "queued",
      label: "Queued",
      value: data?.ingestion.queued ?? 0,
      strokeClass: "stroke-status-degraded",
      dotClass: "bg-status-degraded",
    },
    {
      key: "idle",
      label: "Idle capacity",
      value: data?.ingestion.idleCapacity ?? 0,
      strokeClass: "stroke-muted-foreground/40",
      dotClass: "bg-muted-foreground/40",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PanelCard title="Ingestion" subsystem="tdarr" info="active-workers">
        {!data && error ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Failed to load ingestion
          </p>
        ) : (
          <IngestionDonut segments={segments} />
        )}
      </PanelCard>

      <PanelCard title="Streams" subsystem="plex" info="active-streams">
        {!data && error ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Failed to load streams
          </p>
        ) : (
          <StreamsOverview
            live={data?.streams.live ?? 0}
            transcodes={data?.streams.transcodes ?? 0}
            bandwidthMbps={data?.streams.bandwidthMbps ?? 0}
          />
        )}
      </PanelCard>
    </div>
  );
}
