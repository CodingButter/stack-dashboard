"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, TerminalSquare } from "lucide-react";

import { logout } from "@/app/login/actions";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CommandPalette } from "@/components/shell/command-palette";
import { navItems } from "@/components/shell/nav";
import { cn } from "@/lib/utils";
import { ToastProvider } from '@/components/actions/toaster';
import { ActionRunnerProvider } from '@/components/actions/action-runner';
import { ActionCatalogProvider } from '@/components/actions/action-button';

function NavLinks({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {navItems.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const link = (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-2.5 rounded-md px-2.5 py-2 text-base text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground md:min-h-0",
              active && "bg-sidebar-accent text-sidebar-primary",
              collapsed && "justify-center px-2",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {!collapsed && <span>{item.title}</span>}
          </Link>
        );
        if (!collapsed) return link;
        return (
          <Tooltip key={item.href}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{item.title}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

/**
 * Live active-alert count for the shell badge. Polls /api/alerts?count=1 every
 * 20 s. Used when no explicit `alertCount` is passed (i.e. everywhere except
 * the static design gallery).
 */
function useLiveAlertCount(enabled: boolean): number {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/alerts?count=1", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { count?: number };
        if (alive && typeof body.count === "number") setCount(body.count);
      } catch {
        // transient — keep last known count
      }
    };
    load();
    const t = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled]);
  return count;
}

export function AppShell({
  title,
  alertCount,
  children,
}: {
  title: string;
  alertCount?: number;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const liveCount = useLiveAlertCount(alertCount === undefined);
  const badgeCount = alertCount ?? liveCount;

  return (
    <TooltipProvider delayDuration={200}>
      <ToastProvider>
      <ActionRunnerProvider>
      <ActionCatalogProvider>
      <div className="flex min-h-svh w-full">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] md:flex",
            collapsed ? "w-14" : "w-56",
          )}
        >
          <div
            className={cn(
              "flex h-14 items-center gap-2 border-b border-sidebar-border px-4",
              collapsed && "justify-center px-0",
            )}
          >
            <TerminalSquare className="size-5 text-sidebar-primary" />
            {!collapsed && (
              <span className="text-base font-semibold tracking-tight">
                stack<span className="text-sidebar-primary">dash</span>
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            <NavLinks collapsed={collapsed} />
          </div>
          <div
            className={cn(
              "flex items-center gap-1 border-t border-sidebar-border p-2",
              collapsed && "flex-col",
            )}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              className="flex-1"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </Button>
            <form action={logout} className={cn(collapsed ? "w-full" : "flex-1")}>
              <Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                className="w-full text-muted-foreground"
                aria-label="Sign out"
              >
                <LogOut className="size-4" />
              </Button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur">
            {/* Mobile drawer trigger */}
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-11 md:hidden"
                  aria-label="Open navigation"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 bg-sidebar p-0">
                <SheetHeader className="border-b border-sidebar-border">
                  <SheetTitle className="flex items-center gap-2 text-base">
                    <TerminalSquare className="size-5 text-sidebar-primary" />
                    stack<span className="text-sidebar-primary">dash</span>
                  </SheetTitle>
                </SheetHeader>
                <div className="py-2">
                  <NavLinks onNavigate={() => setDrawerOpen(false)} />
                  <form action={logout} className="mt-2 border-t border-sidebar-border px-2 pt-2">
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2.5 text-muted-foreground"
                    >
                      <LogOut className="size-4" />
                      Sign out
                    </Button>
                  </form>
                </div>
              </SheetContent>
            </Sheet>

            <h1 className="truncate text-base font-semibold">{title}</h1>

            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="hidden gap-2 text-muted-foreground md:inline-flex"
                onClick={() => setPaletteOpen(true)}
              >
                <Search className="size-3.5" />
                <span className="text-sm">Search…</span>
                <kbd className="pointer-events-none rounded border border-border bg-muted px-1 font-mono text-sm">
                  ⌘K
                </kbd>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-11 md:hidden"
                aria-label="Search"
                onClick={() => setPaletteOpen(true)}
              >
                <Search className="size-4" />
              </Button>
              <Button
                asChild
                variant="ghost"
                size="icon-sm"
                className="relative size-11 md:size-7"
                aria-label="Alerts"
              >
                <Link href="/alerts">
                  <Bell className="size-4" />
                  {badgeCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-accent-alerts text-[9px] font-bold text-background">
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}
                </Link>
              </Button>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </ActionCatalogProvider>
      </ActionRunnerProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}
