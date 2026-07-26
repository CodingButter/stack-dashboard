import { NextResponse, type NextRequest } from "next/server";

import { getRegistry } from "@/actions";
import { actionRequestSchema, executeAction } from "@/actions/execute";
import { getSession, writeAudit } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Same-origin check — the session cookie is SameSite=Lax, which already
 * blocks cross-site POSTs in modern browsers; this rejects anything that
 * slips through (older UAs, subdomain tricks).
 */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients (curl) carry the cookie or nothing
  const host = req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Role-filtered action catalog for the palette and panel controls. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    role: session.user.role,
    actions: getRegistry().metaForRole(session.user.role),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "cross-origin request rejected" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = actionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `invalid request: ${parsed.error.issues[0]?.message}` },
      { status: 400 },
    );
  }

  const outcome = await executeAction(
    getRegistry(),
    { id: session.user.id, username: session.user.username, role: session.user.role },
    parsed.data,
    writeAudit,
  );
  return NextResponse.json(outcome.body, { status: outcome.status });
}
