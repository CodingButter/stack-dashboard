import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { buildArr, buildUptimeMap } from "@/lib/panels/assemble";
import { latestSnapshots, statusHistory } from "@/lib/panels/queries";
import { arrSchema } from "@/lib/panels/schemas";

export const dynamic = "force-dynamic";

const SERVICES = ["sonarr", "radarr", "prowlarr", "seerr"];

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [snaps, history] = await Promise.all([
    latestSnapshots(),
    statusHistory(SERVICES),
  ]);

  const payload = arrSchema.parse(
    buildArr(snaps, buildUptimeMap(history, SERVICES)),
  );
  return NextResponse.json(payload);
}
