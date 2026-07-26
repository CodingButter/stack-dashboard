import { AppShell } from "@/components/shell/app-shell";
import { RecentlyAddedPanel } from "@/components/panels/recently-added-panel";
import { requireSession } from "@/lib/session";

export default async function RecentlyAddedPage() {
  await requireSession();
  return (
    <AppShell title="Recently Added">
      <RecentlyAddedPanel />
    </AppShell>
  );
}
