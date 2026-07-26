/**
 * Token-safe Plex art proxy. Plex cover-art URLs require the server's
 * X-Plex-Token, which is an encrypted vault secret that must never reach the
 * browser. This session-gated route takes a Plex-internal art path, fetches the
 * image server-side with the token injected, and streams the bytes back — so the
 * token only ever appears in the server→Plex request, never in anything the
 * client can observe.
 */
import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { loadServiceConfig } from "@/poller/settings";

export const dynamic = "force-dynamic";

/** Only Plex-internal art paths are proxyable — otherwise this is an open proxy (SSRF). */
export function isAllowedPath(path: string): boolean {
  return path.startsWith("/library/") || path.startsWith("/photo/");
}

/** Build the token-carrying upstream URL. Server-side only — never sent to clients. */
export function buildUpstreamUrl(
  baseUrl: string,
  apiKey: string,
  path: string,
): string {
  const base = baseUrl.replace(/\/$/, "");
  const token = encodeURIComponent(apiKey);
  return `${base}${path}?X-Plex-Token=${token}`;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!path || !isAllowedPath(path)) {
    return NextResponse.json({ error: "invalid art path" }, { status: 400 });
  }

  const cfg = await loadServiceConfig("plex");
  if (!cfg.url || !cfg.apiKey) {
    return NextResponse.json({ error: "plex not configured" }, { status: 502 });
  }

  const upstream = buildUpstreamUrl(cfg.url, cfg.apiKey, path);

  try {
    const res = await fetch(upstream, {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok || !res.body) {
      return NextResponse.json({ error: "upstream failed" }, { status: 502 });
    }
    // Stream the bytes straight through with the upstream content type. The
    // token never appears in this response — only in the upstream request above.
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    // Never echo the upstream URL (it carries the token) into an error body.
    return NextResponse.json({ error: "upstream error" }, { status: 502 });
  }
}
