import { Bell } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { requireSession } from "@/lib/session";

/** Honest placeholder — the alert engine ships in Segment 06. */
export default async function AlertsPage() {
  await requireSession();
  return (
    <AppShell title="Alerts">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
        <Bell className="size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          The alert engine isn&apos;t wired up yet.
        </p>
        <p className="max-w-sm text-xs text-muted-foreground/70">
          Known failure signatures — tier valve breaches, iowait spikes,
          D-state pileups, indexer caps, service downtime — will raise alerts
          here.
        </p>
      </div>
    </AppShell>
  );
}
