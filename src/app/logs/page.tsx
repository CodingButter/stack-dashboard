import { AppShell } from "@/components/shell/app-shell";
import { LogViewer } from "@/components/logs/log-viewer";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string }>;
}) {
  await requireSession();
  const { unit } = await searchParams;
  return (
    <AppShell title="Logs">
      <LogViewer initialUnit={unit} />
    </AppShell>
  );
}
