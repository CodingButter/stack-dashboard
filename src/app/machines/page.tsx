import { AppShell } from "@/components/shell/app-shell";
import { MachinesPanel } from "@/components/panels/machines-panel";
import { requireSession } from "@/lib/session";

export default async function MachinesPage() {
  await requireSession();
  return (
    <AppShell title="Machines">
      <MachinesPanel />
    </AppShell>
  );
}
