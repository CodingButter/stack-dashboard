import { AppShell } from "@/components/shell/app-shell";
import { ArrPanel } from "@/components/panels/arr-panel";
import { requireSession } from "@/lib/session";

export default async function ArrPage() {
  await requireSession();
  return (
    <AppShell title="Arr stack">
      <ArrPanel />
    </AppShell>
  );
}
