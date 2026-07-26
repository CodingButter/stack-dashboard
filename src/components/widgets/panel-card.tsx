import { cn } from "@/lib/utils";
import { InfoDot } from "@/components/widgets/info-dot";
import type { GlossaryTerm } from "@/lib/glossary";

export type Subsystem =
  | "storage"
  | "plex"
  | "downloads"
  | "tdarr"
  | "alerts"
  | "machines";

const accentBar: Record<Subsystem, string> = {
  storage: "bg-accent-storage",
  plex: "bg-accent-plex",
  downloads: "bg-accent-downloads",
  tdarr: "bg-accent-tdarr",
  alerts: "bg-accent-alerts",
  machines: "bg-accent-machines",
};

export function PanelCard({
  title,
  subsystem,
  actions,
  info,
  children,
  className,
}: {
  title: string;
  subsystem?: Subsystem;
  actions?: React.ReactNode;
  info?: GlossaryTerm;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      {subsystem ? (
        <span
          aria-hidden
          className={cn("absolute inset-y-0 left-0 w-0.5", accentBar[subsystem])}
        />
      ) : null}
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
          {info ? <InfoDot term={info} /> : null}
        </h3>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
