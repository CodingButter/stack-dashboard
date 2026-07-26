"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Zap } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { navItems } from "@/components/shell/nav";
import { useActionRunner } from "@/components/actions/action-runner";
import type { ActionMeta } from "@/actions/types";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const run = useActionRunner();
  const [actions, setActions] = React.useState<ActionMeta[]>([]);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  // Load the role-filtered catalog when the palette opens.
  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    void fetch("/api/actions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { actions?: ActionMeta[] } | null) => {
        if (alive && json?.actions) {
          setActions(json.actions.filter((a) => a.palette));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette">
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {navItems.map((item) => (
            <CommandItem
              key={item.href}
              value={item.title}
              onSelect={() => {
                onOpenChange(false);
                router.push(item.href);
              }}
            >
              <item.icon className="size-4" />
              {item.title}
            </CommandItem>
          ))}
        </CommandGroup>
        {actions.length > 0 && (
          <CommandGroup heading="Actions">
            {actions.map((meta) => (
              <CommandItem
                key={meta.id}
                value={`${meta.service} ${meta.label}`}
                onSelect={() => {
                  onOpenChange(false);
                  // Never executes directly: safe actions run with a toast,
                  // disruptive/destructive open the confirm dialog via the runner.
                  const params = meta.paletteParams ?? {};
                  run({
                    meta,
                    params,
                    target: String(
                      params.target ?? params.name ?? params.unit ?? meta.service,
                    ),
                  });
                }}
              >
                {meta.blastRadius === "destructive" ? (
                  <AlertTriangle className="size-4 text-status-down" />
                ) : (
                  <Zap className="size-4" />
                )}
                <span className="text-muted-foreground">{meta.service}:</span> {meta.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
