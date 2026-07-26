"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, LogOut, User as UserIcon } from "lucide-react";

import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface MeUser {
  id: string;
  username: string;
  role: string;
}

/** Current signed-in user for the sidebar account row. Polls /api/me once. */
function useCurrentUser(): MeUser | null {
  const [user, setUser] = React.useState<MeUser | null>(null);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { user?: MeUser };
        if (alive && body.user) setUser(body.user);
      } catch {
        // transient — leave the row anonymous
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return user;
}

export function AccountMenu({ collapsed }: { collapsed?: boolean }) {
  const user = useCurrentUser();
  const label = user?.username ?? "Account";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-auto w-full items-center gap-2.5 px-2.5 py-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            collapsed ? "justify-center px-2" : "justify-start",
          )}
          aria-label="Account menu"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-primary">
            <UserIcon className="size-3.5" />
          </span>
          {!collapsed && <span className="truncate text-sm">{label}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-52 p-1">
        <MenuLink href="/settings/account" icon={<UserIcon className="size-4" />}>
          Account
        </MenuLink>
        <MenuLink href="/settings/notifications" icon={<Bell className="size-4" />}>
          Notifications
        </MenuLink>
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="size-4" />
            Logout
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent hover:text-foreground"
    >
      {icon}
      {children}
    </Link>
  );
}
