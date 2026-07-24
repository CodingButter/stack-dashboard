import { AppShell } from "@/components/shell/app-shell";
import { DownloadsPanel } from "@/components/panels/downloads-panel";
import { requireSession } from "@/lib/session";

export default async function DownloadsPage() {
  await requireSession();
  return (
    <AppShell title="Downloads">
      <DownloadsPanel />
    </AppShell>
  );
}
