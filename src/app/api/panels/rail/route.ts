import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { buildRail } from "@/lib/panels/assemble";
import { latestSnapshots } from "@/lib/panels/queries";
import { railSchema } from "@/lib/panels/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const snaps = await latestSnapshots();
  const payload = railSchema.parse(buildRail(snaps));
  return NextResponse.json(payload);
}
