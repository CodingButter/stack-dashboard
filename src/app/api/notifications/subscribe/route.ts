import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/session";
import { addSubscription } from "@/lib/notifications/db";

export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ auth: z.string().min(1), p256dh: z.string().min(1) }),
});

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
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  await addSubscription(session.user.id, parsed.data);
  return NextResponse.json({ success: true }, { status: 202 });
}
