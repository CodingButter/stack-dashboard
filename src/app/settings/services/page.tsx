import type { Metadata } from "next";
import { like } from "drizzle-orm";

import { db } from "@/db";
import { settings } from "@/db/schema";
import { AppShell } from "@/components/shell/app-shell";
import { PanelCard } from "@/components/widgets/panel-card";
import { StatusPill } from "@/components/widgets/status-pill";
import { requireAdmin } from "@/lib/session";
import { SERVICES } from "@/poller/services";
import { ServiceForm } from "./service-form";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  await requireAdmin();

  // Load only key names + which are set — never decrypt/expose secrets here.
  const rows = await db
    .select({ key: settings.key, encrypted: settings.encrypted })
    .from(settings)
    .where(like(settings.key, "%.%"));
  const present = new Set(rows.map((r) => r.key));

  return (
    <AppShell title="Settings — Services">
      <div className="mx-auto max-w-3xl space-y-4">
        <PanelCard title="Service connections">
          <p className="mb-4 text-sm text-muted-foreground">
            Enter each service&apos;s URL and API key. Keys are encrypted at rest.
            Leave a secret field blank to keep the existing value.
          </p>
          <div className="space-y-3">
            {SERVICES.map((svc) => {
              const urlSet = present.has(`${svc.id}.url`);
              const keySet =
                present.has(`${svc.id}.apikey`) || present.has(`${svc.id}.password`);
              const configured = urlSet && (svc.auth === "none" || keySet);
              return (
                <details
                  key={svc.id}
                  className="rounded-lg border border-border bg-card/40 px-4 py-3"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3">
                    <span className="flex-1 text-sm font-medium">{svc.label}</span>
                    <StatusPill
                      status={configured ? "up" : "down"}
                      label={configured ? "Configured" : "Unset"}
                    />
                  </summary>
                  <div className="pt-3">
                    <ServiceForm
                      service={svc.id}
                      auth={svc.auth}
                      urlHint={svc.urlHint}
                      urlSet={urlSet}
                      keySet={keySet}
                    />
                  </div>
                </details>
              );
            })}
          </div>
        </PanelCard>
      </div>
    </AppShell>
  );
}
