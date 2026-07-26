import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { buildOverview } from "@/lib/panels/assemble";
import { latestSnapshots, latestStatuses, metricSeries } from "@/lib/panels/queries";
import { overviewSchema } from "@/lib/panels/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [statuses, snaps, series] = await Promise.all([
    latestStatuses(),
    latestSnapshots(),
    metricSeries(
      ["cpu.busy", "cpu.iowait", "net.rx_mbs", "net.tx_mbs"].map((metric) => ({
        box: "nas",
        metric,
      })),
    ),
  ]);

  const payload = overviewSchema.parse(buildOverview(statuses, snaps, series));
  return NextResponse.json(payload);
}
