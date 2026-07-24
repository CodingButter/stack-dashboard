import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { buildStreams, buildUptimeMap } from "@/lib/panels/assemble";
import { latestSnapshots, metricSeries, statusHistory } from "@/lib/panels/queries";
import { streamsSchema } from "@/lib/panels/schemas";

export const dynamic = "force-dynamic";

const SERVICES = ["plex", "tautulli"];

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [snaps, history, series] = await Promise.all([
    latestSnapshots(),
    statusHistory(SERVICES),
    metricSeries([
      { box: "plex", metric: "plex.sessions" },
      { box: "plex", metric: "plex.bitrate_kbps" },
    ]),
  ]);

  const payload = streamsSchema.parse(
    buildStreams(snaps, series, buildUptimeMap(history, SERVICES)),
  );
  return NextResponse.json(payload);
}
