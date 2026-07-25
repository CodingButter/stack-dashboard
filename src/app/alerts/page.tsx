import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { AlertsView } from "@/components/alerts/alerts-view";
import { requireSession } from "@/lib/session";
import { listActiveAlerts, listResolvedAlerts } from "@/app/api/alerts/query";

export const metadata: Metadata = { title: "Alerts" };
export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const session = await requireSession();
  const [active, resolved] = await Promise.all([
    listActiveAlerts(),
    listResolvedAlerts(),
  ]);
  return (
    <AppShell title="Alerts" alertCount={active.filter((a) => !a.acked).length}>
      <AlertsView
        active={active}
        resolved={resolved}
        canAck={session.user.role === "admin"}
      />
    </AppShell>
  );
}
