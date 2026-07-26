import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { logFacets, runLogQuery } from "./execute";
import { logQuerySchema } from "./query";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());

  // Facets sub-request: distinct filter values for the dropdowns.
  if (params.facets === "1") {
    return NextResponse.json(await logFacets());
  }

  const parsed = logQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const rows = await runLogQuery(parsed.data);

  // For "load older", rows come newest-first; the oldest row is the cursor for
  // the next older page. Live-tail (after*) returns ascending — no older cursor.
  const oldest = parsed.data.afterTs ? rows[0] : rows[rows.length - 1];
  const nextCursor = oldest
    ? { beforeTs: oldest.ts, beforeId: oldest.id }
    : null;

  return NextResponse.json({ rows, nextCursor });
}
