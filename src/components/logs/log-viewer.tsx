"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Filter, Pause, Play, ScrollText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface LogRow {
  id: number;
  box: string;
  source: string;
  unit: string;
  severity: number;
  ts: string;
  message: string;
}

interface Facets {
  boxes: string[];
  sources: string[];
  units: Array<{ source: string; unit: string }>;
}

interface Filters {
  box: string;
  source: string;
  unit: string;
  maxSeverity: string;
  q: string;
  regex: boolean;
}

const SOURCES = ["journal", "docker", "auth", "kernel", "app"] as const;
const TAIL_INTERVAL_MS = 3_000;
const PAGE = 100;

/** syslog priority → tailwind text color. 0-3 error, 4 warn, 5-7 info/debug. */
function severityClass(sev: number): string {
  if (sev <= 3) return "text-status-down";
  if (sev === 4) return "text-status-degraded";
  if (sev >= 7) return "text-muted-foreground/60";
  return "text-foreground/80";
}

function severityLabel(sev: number): string {
  if (sev <= 3) return "ERR";
  if (sev === 4) return "WARN";
  if (sev >= 7) return "DBG";
  return "INFO";
}

function buildParams(f: Filters, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ limit: String(PAGE) });
  if (f.box) p.set("box", f.box);
  if (f.source) p.set("source", f.source);
  if (f.unit) p.set("unit", f.unit);
  if (f.maxSeverity) p.set("maxSeverity", f.maxSeverity);
  if (f.q) {
    p.set("q", f.q);
    if (f.regex) p.set("regex", "1");
  }
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p;
}

export function LogViewer({ initialUnit }: { initialUnit?: string }) {
  const [filters, setFilters] = useState<Filters>({
    box: "",
    source: "",
    unit: initialUnit ?? "",
    maxSeverity: "",
    q: "",
    regex: false,
  });
  const [rows, setRows] = useState<LogRow[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tailing, setTailing] = useState(true);
  const [olderCursor, setOlderCursor] = useState<{
    beforeTs: string;
    beforeId: number;
  } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const newestRef = useRef<{ ts: string; id: number } | null>(null);
  // Pause auto-scroll (and treat tail as "read-behind") when the user scrolls up.
  const pinnedBottomRef = useRef(true);

  const setFilter = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  // Facets once.
  useEffect(() => {
    let alive = true;
    void fetch("/api/logs?facets=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((f) => alive && f && setFacets(f as Facets))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Initial + on-filter-change fetch (newest page, resets the view).
  const loadInitial = useCallback(async () => {
    try {
      const res = await fetch(`/api/logs?${buildParams(filters)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        rows: LogRow[];
        nextCursor: typeof olderCursor;
      };
      setRows(json.rows);
      setOlderCursor(json.nextCursor);
      newestRef.current = json.rows[0]
        ? { ts: json.rows[0].ts, id: json.rows[0].id }
        : null;
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    }
  }, [filters]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  // Live tail: pull rows strictly newer than the newest we hold.
  useEffect(() => {
    if (!tailing) return;
    const timer = setInterval(async () => {
      const newest = newestRef.current;
      if (!newest) {
        void loadInitial();
        return;
      }
      try {
        const params = buildParams(filters, {
          afterTs: newest.ts,
          afterId: String(newest.id),
        });
        const res = await fetch(`/api/logs?${params}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { rows: LogRow[] };
        if (json.rows.length === 0) return;
        // after* returns ascending; prepend newest-first to match the view.
        const fresh = [...json.rows].reverse();
        newestRef.current = { ts: fresh[0].ts, id: fresh[0].id };
        setRows((prev) => [...fresh, ...prev].slice(0, 2000));
      } catch {
        /* transient — next tick retries */
      }
    }, TAIL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [tailing, filters, loadInitial]);

  // Auto-scroll to top (newest) only while pinned to the bottom edge.
  useEffect(() => {
    if (tailing && pinnedBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [rows, tailing]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedBottomRef.current = el.scrollTop <= 8;
  }, []);

  const loadOlder = useCallback(async () => {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const params = buildParams(filters, {
        beforeTs: olderCursor.beforeTs,
        beforeId: String(olderCursor.beforeId),
      });
      const res = await fetch(`/api/logs?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        rows: LogRow[];
        nextCursor: typeof olderCursor;
      };
      setRows((prev) => [...prev, ...json.rows]);
      setOlderCursor(json.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoadingOlder(false);
    }
  }, [olderCursor, loadingOlder, filters]);

  const unitOptions = facets
    ? [...new Set(facets.units.map((u) => u.unit))].sort()
    : [];

  const controls = (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Box
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          value={filters.box}
          onChange={(e) => setFilter({ box: e.target.value })}
        >
          <option value="">all</option>
          {facets?.boxes.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Source
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          value={filters.source}
          onChange={(e) => setFilter({ source: e.target.value })}
        >
          <option value="">all</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Unit
        <select
          className="h-8 max-w-40 rounded-lg border border-input bg-transparent px-2 text-sm"
          value={filters.unit}
          onChange={(e) => setFilter({ unit: e.target.value })}
        >
          <option value="">all</option>
          {unitOptions.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Severity ≤
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          value={filters.maxSeverity}
          onChange={(e) => setFilter({ maxSeverity: e.target.value })}
        >
          <option value="">all</option>
          <option value="3">errors</option>
          <option value="4">warnings</option>
          <option value="6">info</option>
        </select>
      </label>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              placeholder={filters.regex ? "regex (Postgres ~*)" : "search message…"}
              value={filters.q}
              onChange={(e) => setFilter({ q: e.target.value })}
              className="font-mono"
            />
          </div>
          <Button
            variant={filters.regex ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter({ regex: !filters.regex })}
            title="Toggle regex mode"
          >
            .*
          </Button>
          <Button
            variant={tailing ? "default" : "outline"}
            size="sm"
            onClick={() => setTailing((t) => !t)}
          >
            {tailing ? <Pause className="size-4" /> : <Play className="size-4" />}
            <span className="hidden sm:inline">{tailing ? "Live" : "Paused"}</span>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden">
                <Filter className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-4">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="mt-4">{controls}</div>
            </SheetContent>
          </Sheet>
        </div>
        <div className="hidden md:block">{controls}</div>
      </div>

      {error && (
        <p className="text-xs text-status-down">Log query failed: {error}</p>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto rounded-xl border border-border/60 bg-background/60 font-mono text-xs"
      >
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-24 text-center text-muted-foreground">
            <ScrollText className="size-7 opacity-50" />
            <p>No log lines match these filters.</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border/30 align-top hover:bg-muted/30"
                >
                  <td className="whitespace-nowrap px-2 py-1 text-muted-foreground/70 tabular-nums">
                    {new Date(r.ts).toLocaleTimeString([], { hour12: false })}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-2 py-1 font-semibold",
                      severityClass(r.severity),
                    )}
                  >
                    {severityLabel(r.severity)}
                  </td>
                  <td className="hidden whitespace-nowrap px-2 py-1 text-accent/80 sm:table-cell">
                    {r.unit}
                  </td>
                  <td
                    className={cn(
                      "w-full px-2 py-1 break-all whitespace-pre-wrap",
                      severityClass(r.severity),
                    )}
                  >
                    {r.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {olderCursor && (
          <div className="flex justify-center p-3">
            <Button
              variant="outline"
              size="sm"
              onClick={loadOlder}
              disabled={loadingOlder}
            >
              {loadingOlder ? "Loading…" : "Load older"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
