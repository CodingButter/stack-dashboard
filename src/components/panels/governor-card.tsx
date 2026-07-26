"use client";

import { PanelCard } from "@/components/widgets/panel-card";
import type { TdarrPanel } from "@/lib/panels/schemas";
import { cn } from "@/lib/utils";

type Governor = NonNullable<TdarrPanel["governor"]>;

const MODE_META: Record<
  Governor["mode"],
  { label: string; blurb: string; dot: string; text: string; ring: string }
> = {
  streaming: {
    label: "Streaming",
    blurb: "Plex is playing — external nodes paused, in-flight transcodes frozen.",
    dot: "bg-accent-streams",
    text: "text-accent-streams",
    ring: "border-accent-streams/40 bg-accent-streams/10",
  },
  governing: {
    label: "Governing",
    blurb: "One node holds the heavy I/O lane; the governor paused the others to serialize write-back.",
    dot: "bg-status-degraded",
    text: "text-status-degraded",
    ring: "border-status-degraded/40 bg-status-degraded/10",
  },
  idle: {
    label: "Idle",
    blurb: "No streams, no I/O contention — nodes free to transcode.",
    dot: "bg-status-up",
    text: "text-status-up",
    ring: "border-status-up/40 bg-status-up/10",
  },
};

function ageLabel(secs: number | null): string {
  if (secs == null) return "unknown";
  if (secs < 0) return "just now";
  if (secs < 90) return `${secs}s ago`;
  return `${Math.round(secs / 60)}m ago`;
}

export function GovernorCard({ governor }: { governor: TdarrPanel["governor"] }) {
  // No snapshot ever received — the emitter/endpoint isn't deployed yet.
  if (!governor) {
    return (
      <PanelCard title="I/O Governor" subsystem="tdarr">
        <p className="py-4 text-center text-base text-muted-foreground">
          Governor status unavailable — the NAS gate hasn&apos;t reported yet.
        </p>
      </PanelCard>
    );
  }

  // Snapshot exists but the gate is dead/stale — a distinct, loud state.
  if (!governor.running) {
    return (
      <PanelCard title="I/O Governor" subsystem="tdarr">
        <div className="rounded-md border border-status-down/40 bg-status-down/10 px-3 py-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-status-down" />
            <span className="text-base font-semibold text-status-down">
              NOT RUNNING
            </span>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            The tdarr-gate service is stopped or wedged (last report{" "}
            {ageLabel(governor.ageSecs)}). Transcodes may collide with Plex
            streams until it recovers.
          </p>
        </div>
      </PanelCard>
    );
  }

  const m = MODE_META[governor.mode];

  // schema:2 — a node flagged pausedByGovernor is NOT idle. Split by per-node
  // state: replaceDeferred means "transcoding now, write-back queued behind the
  // lane holder" (still working), vs genuinely paused (no live worker). The flat
  // governorPausedNodes list conflates the two and even lists the lane holder,
  // which reads as a contradiction — derive from node state instead.
  const deferred = governor.nodes.filter((n) => n.replaceDeferred);
  const trulyPaused = governor.nodes.filter(
    (n) => n.pausedByGovernor && !n.replaceDeferred && !n.activelyWorking,
  );

  return (
    <PanelCard title="I/O Governor" subsystem="tdarr">
      <div className="flex flex-col gap-3">
        <div className={cn("rounded-md border px-3 py-2.5", m.ring)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", m.dot, "animate-pulse")} />
              <span className={cn("text-base font-semibold", m.text)}>
                {m.label}
              </span>
              {governor.frozen ? (
                <span className="rounded bg-accent-streams/20 px-1.5 py-0.5 text-sm font-medium text-accent-streams">
                  ❄ frozen
                </span>
              ) : null}
            </div>
            <span className="text-sm text-muted-foreground">
              updated {ageLabel(governor.ageSecs)}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{m.blurb}</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-base sm:grid-cols-3">
          <Stat label="Active streams" value={String(governor.activeStreams)} />
          <Stat
            label="Stream bandwidth"
            value={
              governor.streamKbps > 0
                ? `${(governor.streamKbps / 1000).toFixed(1)} Mbps`
                : "—"
            }
          />
          <Stat
            label="SAB cap"
            value={
              governor.sabLimitMbps == null
                ? "uncapped"
                : `${governor.sabLimitMbps} MB/s`
            }
          />
          <Stat label="Lane holder" value={governor.laneHolder ?? "—"} />
          <Stat
            label="Replace queued"
            value={deferred.length > 0 ? String(deferred.length) : "none"}
          />
          <Stat
            label="Governor-paused"
            value={trulyPaused.length > 0 ? String(trulyPaused.length) : "none"}
          />
          <Stat label="Lane timeout" value={`${governor.laneMaxSecs}s`} />
        </dl>

        {deferred.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Transcoding · replace queued:{" "}
            <span className="font-medium text-status-degraded">
              {deferred.map((n) => n.name).join(", ")}
            </span>
          </p>
        ) : null}

        {trulyPaused.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Paused by governor:{" "}
            <span className="font-medium text-status-degraded">
              {trulyPaused.map((n) => n.name).join(", ")}
            </span>
          </p>
        ) : null}
      </div>
    </PanelCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="stat-num truncate font-medium">{value}</dd>
    </div>
  );
}
