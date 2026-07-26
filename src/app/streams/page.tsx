import { AppShell } from "@/components/shell/app-shell";
import { StreamsPanel } from "@/components/panels/streams-panel";
import { requireSession } from "@/lib/session";

export default async function StreamsPage() {
  await requireSession();
  return (
    <AppShell title="Streams">
      <StreamsPanel />
    </AppShell>
  );
}
