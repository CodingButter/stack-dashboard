import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Current signed-in user, sans passwordHash. Used by AppShell's account row. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id, username, role } = session.user;
  return NextResponse.json({ user: { id, username, role } });
}
