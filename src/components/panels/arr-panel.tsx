"use client";

import { PanelCard } from "@/components/widgets/panel-card";
import { StatusPill } from "@/components/widgets/status-pill";
import { InfoDot } from "@/components/widgets/info-dot";
import { formatAgo, formatBytes } from "@/lib/format";
import type { GlossaryTerm } from "@/lib/glossary";
import type { Arr } from "@/lib/panels/schemas";
import { usePanelData } from "./use-panel-data";
import { UptimeRow } from "./uptime-row";
import { ActionButton } from '@/components/actions/action-button';

const LABELS = {
  sonarr: "Sonarr",
  radarr: "Radarr",
  prowlarr: "Prowlarr",
  seerr: "Seerr",
};

export function ArrPanel() {
  const { data, error } = usePanelData<Arr>("/api/panels/arr", 6_000);

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-base text-muted-foreground">
        {error ? `Failed to load: ${error}` : "Loading arr stack…"}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ArrAppCard name="Sonarr" app={data.sonarr} />
        <ArrAppCard name="Radarr" app={data.radarr} />
      </div>

      <PanelCard title="Prowlarr indexers" subsystem="downloads" info="prowlarr-indexers">
        {!data.prowlarr ? (
          <p className="py-6 text-center text-base text-muted-foreground">
            No Prowlarr data
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {data.prowlarr.enabled} of {data.prowlarr.total} enabled
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.prowlarr.indexers.map((ix) => {
                const limited = Boolean(ix.disabledTill);
                return (
                  <div
                    key={ix.id}
                    className="flex flex-col gap-1 rounded-md border border-border/60 bg-background/40 px-2.5 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <StatusPill
                        status={!ix.enabled ? "unknown" : limited ? "degraded" : "up"}
                        label={ix.name}
                        className="border-0 bg-transparent px-0"
                      />
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm uppercase text-muted-foreground">
                          {ix.protocol} · {ix.privacy}
                        </span>
                        <ActionButton
                          actionId="prowlarr.test-indexer"
                          params={{ indexerId: ix.id }}
                          target={`indexer-${ix.id}`}
                          size="sm"
                          className="h-6 px-1.5 text-sm"
                        >
                          Test
                        </ActionButton>
                      </span>
                    </div>
                    {limited ? (
                      <span className="text-sm text-status-degraded">
                        rate-limited until {formatAgo(ix.disabledTill).replace(" ago", "")}{" "}
                        from now{ix.failure ? ` · ${ix.failure}` : ""}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </PanelCard>

      <PanelCard title="Seerr requests" subsystem="plex" info="seerr-requests">
        {!data.seerr ? (
          <p className="py-6 text-center text-base text-muted-foreground">
            No Seerr data
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-base sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Total" value={data.seerr.total} />
            <Stat label="Pending" value={data.seerr.pending} warn={data.seerr.pending > 0} />
            <Stat label="Approved" value={data.seerr.approved} />
            <Stat label="Processing" value={data.seerr.processing} />
            <Stat label="Available" value={data.seerr.available} />
            <Stat label="Declined" value={data.seerr.declined} />
          </dl>
        )}
      </PanelCard>

      <PanelCard title="Uptime" subsystem="alerts" info="uptime">
        <UptimeRow uptime={data.uptime} labels={LABELS} />
      </PanelCard>
    </div>
  );
}

function ArrAppCard({ name, app }: { name: string; app: Arr["sonarr"] }) {
  const service = name.toLowerCase();
  return (
    <PanelCard
      title={name}
      subsystem="downloads"
      actions={
        <ActionButton
          actionId={`${service}.search-missing`}
          target="missing"
          size="sm"
          className="h-7 px-2 text-sm"
        >
          Search missing
        </ActionButton>
      }
    >
      {!app ? (
        <p className="py-6 text-center text-base text-muted-foreground">
          No {name} data
        </p>
      ) : (
        <>
          <StuckBanner queue={app.queue} />
          <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-base">
            <Stat label="Queue" value={app.queue.total} info="arr-queue" />
            <Stat label="Downloading" value={app.queue.downloading} info="arr-queue" />
            <Stat label="Queued" value={app.queue.queued} info="arr-queue" />
            <Stat label="Stalled" value={app.queue.stalled} warn={app.queue.stalled > 0} info="stalled" />
            <Stat
              label="Import pending"
              value={app.queue.importPending}
              warn={app.queue.importPending > 0}
              info="import-pending"
            />
            <Stat label="Errored" value={app.queue.errored} warn={app.queue.errored > 0} info="errored" />
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <InfoDot term="arr-root-folders" />
              health:{" "}
              <span
                className={
                  app.health.errors > 0
                    ? "stat-num font-bold text-status-down"
                    : app.health.warnings > 0
                      ? "stat-num text-status-degraded"
                      : "stat-num text-status-up"
                }
              >
                {app.health.errors} errors · {app.health.warnings} warnings
              </span>
            </span>
            {app.rootFolders.map((rf) => (
              <span key={rf.path}>
                {rf.path}:{" "}
                <span className="stat-num text-foreground">
                  {rf.accessible ? `${formatBytes(rf.freeSpace)} free` : "inaccessible"}
                </span>
              </span>
            ))}
          </div>
        </>
      )}
    </PanelCard>
  );
}

function StuckBanner({ queue }: { queue: NonNullable<Arr["sonarr"]>["queue"] }) {
  const parts: string[] = [];
  if (queue.importPending > 0) parts.push(`${queue.importPending} import-pending`);
  if (queue.stalled > 0) parts.push(`${queue.stalled} stalled`);
  if (queue.errored > 0) parts.push(`${queue.errored} failed`);
  if (parts.length === 0) return null;
  const stuck = queue.importPending + queue.stalled + queue.errored;
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-2 rounded-md border border-status-degraded/40 bg-status-degraded/10 px-2.5 py-1.5 text-sm">
      <span className="stat-num font-bold text-status-degraded">{stuck} stuck</span>
      <span className="text-muted-foreground">{parts.join(" · ")} — needs cleanup</span>
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
      <dd className={warn ? "stat-num text-base font-bold text-status-degraded" : "stat-num text-base"}>
        {value}
      </dd>
    </div>
  );
}
