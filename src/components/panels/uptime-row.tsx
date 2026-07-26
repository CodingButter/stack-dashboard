"use client";

import { TrackerStrip } from "@/components/widgets/tracker-strip";
import type { TrackerCellWire } from "@/lib/panels/schemas";

/** Uptime tracker strips shared by every monitoring panel header. */
export function UptimeRow({
  uptime,
  labels,
}: {
  uptime: Record<string, TrackerCellWire[]>;
  labels: Record<string, string>;
}) {
  const entries = Object.entries(uptime);
  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {entries.map(([service, cells]) => (
        <TrackerStrip
          key={service}
          label={labels[service] ?? service}
          data={cells}
        />
      ))}
    </div>
  );
}
