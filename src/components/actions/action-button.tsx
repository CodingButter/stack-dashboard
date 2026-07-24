"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { useActionRunner } from "./action-runner";
import type { ActionMeta } from "@/actions/types";

interface Catalog {
  loaded: boolean;
  byId: Map<string, ActionMeta>;
}

const CatalogContext = React.createContext<Catalog>({ loaded: false, byId: new Map() });

/**
 * Fetches the role-filtered action catalog once per mount. Because the server
 * filters by role, an action id missing from the catalog means "not permitted"
 * — buttons render disabled. This is presentation only; the API enforces RBAC.
 */
export function ActionCatalogProvider({ children }: { children: React.ReactNode }) {
  const [catalog, setCatalog] = React.useState<Catalog>({ loaded: false, byId: new Map() });

  React.useEffect(() => {
    let alive = true;
    void fetch("/api/actions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { actions?: ActionMeta[] } | null) => {
        if (!alive || !json?.actions) return;
        setCatalog({ loaded: true, byId: new Map(json.actions.map((a) => [a.id, a])) });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>;
}

export function ActionButton({
  actionId,
  params = {},
  target,
  onDone,
  variant = "outline",
  size = "sm",
  className,
  children,
}: {
  actionId: string;
  params?: Record<string, unknown>;
  target: string;
  onDone?: () => void;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  children: React.ReactNode;
}) {
  const catalog = React.useContext(CatalogContext);
  const run = useActionRunner();
  const meta = catalog.byId.get(actionId);

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={!meta}
      title={catalog.loaded && !meta ? "Requires admin role" : undefined}
      onClick={() => {
        if (!meta) return;
        run({ meta, params, target, onDone });
      }}
    >
      {children}
    </Button>
  );
}
