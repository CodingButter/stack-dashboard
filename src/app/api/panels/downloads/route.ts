import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { buildDownloads, buildUptimeMap } from "@/lib/panels/assemble";
import { latestSnapshots, metricSeries, statusHistory } from "@/lib/panels/queries";
import { downloadsSchema } from "@/lib/panels/schemas";

export const dynamic = "force-dynamic";

const SERVICES = ["sabnzbd", "qbittorrent"];

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [snaps, history, series] = await Promise.all([
    latestSnapshots(),
    statusHistory(SERVICES),
    metricSeries([
      { box: "sabnzbd", metric: "sabnzbd.speed_bps" },
      { box: "qbittorrent", metric: "qbittorrent.dl_speed" },
      { box: "qbittorrent", metric: "qbittorrent.up_speed" },
    ]),
  ]);

  const payload = downloadsSchema.parse(
    buildDownloads(snaps, series, buildUptimeMap(history, SERVICES)),
  );
  return NextResponse.json(payload);
}
