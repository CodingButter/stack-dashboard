import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { buildStorage, buildUptimeMap } from "@/lib/panels/assemble";
import { latestSnapshots, metricSeries, statusHistory } from "@/lib/panels/queries";
import { storageSchema } from "@/lib/panels/schemas";

export const dynamic = "force-dynamic";

const SERVICES = ["agent"];

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [snaps, history, series] = await Promise.all([
    latestSnapshots(),
    statusHistory(SERVICES),
    metricSeries([
      { box: "nas", metric: "fs.used_pct/volume1" },
      { box: "nas", metric: "fs.used_pct/volume2" },
      { box: "nas", metric: "bcache.hit_pct" },
    ]),
  ]);

  const payload = storageSchema.parse(
    buildStorage(snaps, series, buildUptimeMap(history, SERVICES)),
  );
  return NextResponse.json(payload);
}
