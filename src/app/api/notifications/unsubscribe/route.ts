import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/session";
import { removeSubscription } from "@/lib/notifications/db";

export const dynamic = "force-dynamic";

const unsubscribeSchema = z.object({ endpoint: z.url() });

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  await removeSubscription(session.user.id, parsed.data.endpoint);
  return NextResponse.json({ success: true }, { status: 202 });
}
