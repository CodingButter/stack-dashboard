import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { PanelCard } from "@/components/widgets/panel-card";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const session = await requireSession();

  return (
    <AppShell title="Settings — Account">
      <div className="mx-auto max-w-3xl space-y-4">
        <PanelCard title="Signed in as">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{session.user.username}</span>
            <Badge variant={session.user.role === "admin" ? "default" : "secondary"}>
              {session.user.role}
            </Badge>
          </div>
        </PanelCard>

        <PanelCard title="Change password">
          <ChangePasswordForm />
        </PanelCard>
      </div>
    </AppShell>
  );
}
