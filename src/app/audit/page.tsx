import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { AppShell } from "@/components/shell/app-shell";
import { PanelCard } from "@/components/widgets/panel-card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Audit log" };

const RESULTS = ["all", "ok", "denied", "error"] as const;
const PAGE_SIZE = 100;

function resultBadge(result: string) {
  if (result === "ok") return <Badge variant="secondary">ok</Badge>;
  if (result === "denied") return <Badge variant="destructive">denied</Badge>;
  return <Badge variant="destructive">error</Badge>;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; q?: string }>;
}) {
  await requireAdmin();
  const { result = "all", q = "" } = await searchParams;

  const conds: SQL[] = [];
  if (result !== "all" && (RESULTS as readonly string[]).includes(result)) {
    conds.push(eq(auditLog.result, result));
  }
  if (q) {
    const like = `%${q}%`;
    const cond = or(ilike(auditLog.action, like), ilike(auditLog.target, like));
    if (cond) conds.push(cond);
  }

  const rows = await db
    .select({ entry: auditLog, username: users.username })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(PAGE_SIZE);

  return (
    <AppShell title="Audit log">
      <div className="mx-auto max-w-5xl space-y-4">
        <PanelCard title={`Audit trail (last ${rows.length})`} subsystem="alerts">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {RESULTS.map((r) => (
              <Link
                key={r}
                href={`/audit?result=${r}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={
                  r === result
                    ? "rounded-md bg-accent px-2.5 py-1 text-xs font-medium"
                    : "rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent/50"
                }
              >
                {r}
              </Link>
            ))}
            <form className="ml-auto" action="/audit" method="get">
              {result !== "all" && <input type="hidden" name="result" value={result} />}
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="filter action/target…"
                className="h-8 rounded-md border border-border bg-transparent px-2.5 font-mono text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
              />
            </form>
          </div>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No audit entries match.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">time</th>
                    <th className="py-2 pr-3 font-medium">user</th>
                    <th className="py-2 pr-3 font-medium">action</th>
                    <th className="py-2 pr-3 font-medium">target</th>
                    <th className="py-2 font-medium">result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {rows.map(({ entry, username }) => (
                    <tr key={entry.id}>
                      <td className="stat-num whitespace-nowrap py-2 pr-3 text-muted-foreground">
                        {entry.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                      </td>
                      <td className="py-2 pr-3">{username ?? "—"}</td>
                      <td className="py-2 pr-3 font-mono">{entry.action}</td>
                      <td className="max-w-48 truncate py-2 pr-3 font-mono text-muted-foreground">
                        {entry.target ?? "—"}
                      </td>
                      <td className="py-2">{resultBadge(entry.result)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PanelCard>
      </div>
    </AppShell>
  );
}
