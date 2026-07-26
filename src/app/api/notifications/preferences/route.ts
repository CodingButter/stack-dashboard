import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/session";
import { getUserPreferences, setUserPreferences } from "@/lib/notifications/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const preferences = await getUserPreferences(session.user.id);
  return NextResponse.json({ preferences });
}

const preferencesSchema = z.object({ preferences: z.record(z.string(), z.boolean()) });

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
  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  await setUserPreferences(session.user.id, parsed.data.preferences);
  return NextResponse.json({ success: true });
}
