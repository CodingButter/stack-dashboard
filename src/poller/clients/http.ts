/**
 * Shared HTTP helpers for service clients. Every fetch is time-bounded so a
 * hung service can never wedge the poll loop, and non-2xx / non-JSON responses
 * become typed failures instead of throws — the poller contract requires
 * clients to report `ok: false`, never explode.
 */

const DEFAULT_TIMEOUT_MS = 8000;

export interface FetchResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** parse the response as text instead of JSON (Plex XML, qbit cookies). */
  as?: "json" | "text";
}

export async function httpFetch<T = unknown>(
  url: string,
  opts: FetchOptions = {},
): Promise<FetchResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.headers,
      body: opts.body,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    if (opts.as === "text") {
      return { ok: true, status: res.status, data: text as unknown as T };
    }
    try {
      return { ok: true, status: res.status, data: JSON.parse(text) as T };
    } catch {
      // A service returning an HTML error page with a 200 (or garbage) must
      // degrade cleanly rather than crash the parser.
      return { ok: false, status: res.status, error: "invalid JSON response" };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      error: controller.signal.aborted ? "timeout" : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}
