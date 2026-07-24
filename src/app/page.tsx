import Link from "next/link";

import { AppShell } from "@/components/shell/app-shell";
import { requireSession } from "@/lib/session";

export default async function Home() {
  await requireSession();
  return (
    <AppShell title="Overview">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
        <h1 className="text-lg font-semibold">Command center coming online</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Monitoring panels arrive in Segment 04. Meanwhile, the{" "}
          <Link href="/design" className="text-primary underline-offset-4 hover:underline">
            design gallery
          </Link>{" "}
          shows every widget primitive.
        </p>
      </div>
    </AppShell>
  );
}
