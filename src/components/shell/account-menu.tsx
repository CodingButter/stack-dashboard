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

/** Current signed-in user. Polls /api/me once. Shared by both account menus. */
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

/**
 * Deterministic Gravatar identicon keyed on username. This app has no email
 * column (users are keyed by username), so a real Gravatar lookup can't match;
 * hashing the username with d=identicon gives each user a stable, distinct
 * generated avatar. Falls back to the user icon if the image fails to load.
 */
function gravatarUrl(username: string): string {
  const hash = sha256Hex(username.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?s=64&d=identicon`;
}

/** Small synchronous SHA-256 hex for the Gravatar key (username, not a secret). */
function sha256Hex(input: string): string {
  // FNV-1a-ish stable hash rendered as 32 hex chars — deterministic per username
  // and good enough for Gravatar's identicon seed (which only needs a stable key).
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c << 5) | (c >> 2)), 0x85ebca6b) >>> 0;
  }
  const a = h1.toString(16).padStart(8, "0");
  const b = h2.toString(16).padStart(8, "0");
  const c = (Math.imul(h1, h2) >>> 0).toString(16).padStart(8, "0");
  const d = ((h1 ^ h2) >>> 0).toString(16).padStart(8, "0");
  return `${a}${b}${c}${d}`;
}

function AccountAvatar({ username, size = 24 }: { username: string; size?: number }) {
  const [failed, setFailed] = React.useState(false);
  if (failed || !username) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-primary"
        style={{ width: size, height: size }}
      >
        <UserIcon className="size-3.5" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={gravatarUrl(username)}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full bg-sidebar-accent"
      onError={() => setFailed(true)}
    />
  );
}

/** Shared menu body: Account, Notifications, Logout. */
function AccountMenuItems() {
  return (
    <>
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
    </>
  );
}

/** Sidebar account row (desktop). Full-width button with username label. */
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
          <AccountAvatar username={user?.username ?? ""} size={24} />
          {!collapsed && <span className="truncate text-sm">{label}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-52 p-1">
        <AccountMenuItems />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Topbar account avatar (all viewports). A round gravatar button that expands
 * the same Account / Notifications / Logout options. This is the mobile entry
 * point since the sidebar is hidden on phones.
 */
export function AccountAvatarMenu() {
  const user = useCurrentUser();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-11 rounded-full md:size-8"
          aria-label="Account menu"
        >
          <AccountAvatar username={user?.username ?? ""} size={28} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-52 p-1">
        {user && (
          <div className="border-b border-border px-2.5 pb-1.5 pt-1 text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{user.username}</span>
          </div>
        )}
        <div className="pt-1">
          <AccountMenuItems />
        </div>
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
