"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * SWR-style polling: fetch immediately, refetch on an interval (default 12 s,
 * inside the segment's 10–15 s budget), keep the last good payload on
 * transient failures and surface the error alongside it.
 */
export function usePanelData<T>(url: string, intervalMs = 12_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as T;
      if (alive.current) {
        setData(json);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "fetch failed");
    }
  }, [url]);

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = setInterval(() => void load(), intervalMs);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [load, intervalMs]);

  return { data, error, refresh: load };
}
