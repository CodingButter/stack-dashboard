import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { PanelCard } from "@/components/widgets/panel-card";
import { requireSession } from "@/lib/session";
import { NotificationsForm } from "./notifications-form";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requireSession();
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? "";

  return (
    <AppShell title="Settings — Notifications">
      <div className="mx-auto max-w-3xl space-y-4">
        <PanelCard title="Push notifications">
          <NotificationsForm vapidPublicKey={vapidPublicKey} />
        </PanelCard>
      </div>
    </AppShell>
  );
}
