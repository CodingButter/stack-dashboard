import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { buildTdarrPanel, buildUptimeMap } from "@/lib/panels/assemble";
import { latestSnapshots, metricSeries, statusHistory } from "@/lib/panels/queries";
import { tdarrPanelSchema } from "@/lib/panels/schemas";

export const dynamic = "force-dynamic";

const SERVICES = ["tdarr"];

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [snaps, history, series] = await Promise.all([
    latestSnapshots(),
    statusHistory(SERVICES),
    metricSeries([
      { box: "tdarr", metric: "tdarr.queue.depth" },
      { box: "tdarr", metric: "tdarr.workers.active" },
    ]),
  ]);

  const payload = tdarrPanelSchema.parse(
    buildTdarrPanel(snaps, series, buildUptimeMap(history, SERVICES)),
  );
  return NextResponse.json(payload);
}
