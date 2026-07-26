import { AppShell } from "@/components/shell/app-shell";
import { StoragePanel } from "@/components/panels/storage-panel";
import { requireSession } from "@/lib/session";

export default async function StoragePage() {
  await requireSession();
  return (
    <AppShell title="Storage">
      <StoragePanel />
    </AppShell>
  );
}
