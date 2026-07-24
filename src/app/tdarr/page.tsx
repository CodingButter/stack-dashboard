import { AppShell } from "@/components/shell/app-shell";
import { TdarrPanel } from "@/components/panels/tdarr-panel";
import { requireSession } from "@/lib/session";

export default async function TdarrPage() {
  await requireSession();
  return (
    <AppShell title="Tdarr">
      <TdarrPanel />
    </AppShell>
  );
}
