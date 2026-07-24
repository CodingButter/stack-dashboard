import { AppShell } from "@/components/shell/app-shell";
import { OverviewPanel } from "@/components/panels/overview-panel";
import { requireSession } from "@/lib/session";

export default async function Home() {
  await requireSession();
  return (
    <AppShell title="Overview">
      <OverviewPanel />
    </AppShell>
  );
}
