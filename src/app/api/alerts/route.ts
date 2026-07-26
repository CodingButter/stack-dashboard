import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSession, writeAudit } from "@/lib/session";
import { ackAlert, activeAlertCount, listActiveAlerts } from "./query";

export const dynamic = "force-dynamic";

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** `?count=1` → just the badge number; otherwise the active alert list. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (req.nextUrl.searchParams.get("count") === "1") {
    return NextResponse.json({ count: await activeAlertCount() });
  }
  return NextResponse.json({ alerts: await listActiveAlerts() });
}

const ackSchema = z.object({ id: z.string().min(1) });

/** Acknowledge an alert — admin only, writes an audit row. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    await writeAudit({
      userId: session.user.id,
      action: "alert.ack",
      result: "denied",
      detail: { reason: "not admin" },
    });
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
  const parsed = ackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const updated = await ackAlert(parsed.data.id, session.user.id);
  if (!updated) {
    await writeAudit({
      userId: session.user.id,
      action: "alert.ack",
      target: parsed.data.id,
      result: "error",
      detail: { reason: "not found or resolved" },
    });
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await writeAudit({
    userId: session.user.id,
    action: "alert.ack",
    target: `${updated.ruleId}/${updated.target}`,
    result: "ok",
  });
  return NextResponse.json({ alert: updated });
}
