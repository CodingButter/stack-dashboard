import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { buildRecentlyAdded } from "@/lib/panels/assemble";
import { latestSnapshots } from "@/lib/panels/queries";
import { recentlyAddedSchema } from "@/lib/panels/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const snaps = await latestSnapshots();
  const payload = recentlyAddedSchema.parse(buildRecentlyAdded(snaps));
  return NextResponse.json(payload);
}
