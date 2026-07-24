import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { FLEET, buildMachine } from "@/lib/panels/assemble";
import { latestSnapshots, latestStatuses, metricSeries } from "@/lib/panels/queries";
import { machinesSchema } from "@/lib/panels/schemas";

export const dynamic = "force-dynamic";

const BOX_METRICS = ["cpu.busy", "mem.used_pct", "net.rx_mbs", "net.tx_mbs"];

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [statuses, snaps, series] = await Promise.all([
    latestStatuses(),
    latestSnapshots(),
    metricSeries(
      FLEET.flatMap((f) => BOX_METRICS.map((metric) => ({ box: f.box, metric }))),
      { keyByBox: true },
    ),
  ]);

  const now = new Date();
  const payload = machinesSchema.parse({
    generatedAt: now.toISOString(),
    boxes: FLEET.map((def) => buildMachine(def, statuses, snaps, series, now)),
  });
  return NextResponse.json(payload);
}
