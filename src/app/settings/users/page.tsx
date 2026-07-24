import type { Metadata } from "next";
import { asc } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { AppShell } from "@/components/shell/app-shell";
import { PanelCard } from "@/components/widgets/panel-card";
import { StatusPill } from "@/components/widgets/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/session";
import { AddUserForm } from "./add-user-form";
import { setUserDisabled } from "./actions";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const session = await requireAdmin();
  const allUsers = await db.select().from(users).orderBy(asc(users.createdAt));

  return (
    <AppShell title="Settings — Users">
      <div className="mx-auto max-w-3xl space-y-4">
        <PanelCard title="Add user">
          <AddUserForm />
        </PanelCard>

        <PanelCard title={`Users (${allUsers.length})`}>
          <ul className="divide-y divide-border">
            {allUsers.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{u.username}</span>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {u.role}
                    </Badge>
                    {u.id === session.user.id ? (
                      <span className="text-xs text-muted-foreground">(you)</span>
                    ) : null}
                  </div>
                  <span className="stat-num text-xs text-muted-foreground">
                    created {u.createdAt.toISOString().slice(0, 10)}
                  </span>
                </div>
                <StatusPill
                  status={u.disabledAt ? "down" : "up"}
                  label={u.disabledAt ? "Disabled" : "Active"}
                />
                {u.id !== session.user.id ? (
                  <form action={setUserDisabled}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input
                      type="hidden"
                      name="disable"
                      value={u.disabledAt ? "false" : "true"}
                    />
                    <Button type="submit" variant="outline" size="sm">
                      {u.disabledAt ? "Enable" : "Disable"}
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </PanelCard>
      </div>
    </AppShell>
  );
}
