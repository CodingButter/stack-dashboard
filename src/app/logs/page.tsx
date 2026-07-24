import { ScrollText } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { requireSession } from "@/lib/session";

/** Honest placeholder — log aggregation ships in Segment 06. */
export default async function LogsPage() {
  await requireSession();
  return (
    <AppShell title="Logs">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
        <ScrollText className="size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Log aggregation isn&apos;t wired up yet.
        </p>
        <p className="max-w-sm text-xs text-muted-foreground/70">
          Journal and container logs will stream here — cursor-pulled off the
          NAS into Postgres with filtering and 14-day retention.
        </p>
      </div>
    </AppShell>
  );
}
