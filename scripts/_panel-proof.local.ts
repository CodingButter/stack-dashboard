import { buildArr, buildDownloads, buildStorage, buildStreams, buildTdarrPanel, buildUptimeMap } from "@/lib/panels/assemble";
import { latestSnapshots, metricSeries, statusHistory } from "@/lib/panels/queries";
import { arrSchema, downloadsSchema, storageSchema, streamsSchema, tdarrPanelSchema } from "@/lib/panels/schemas";

async function main() {
  const snaps = await latestSnapshots();
  const hist = await statusHistory(["plex","tautulli","sabnzbd","qbittorrent","sonarr","radarr","prowlarr","seerr","tdarr","agent"]);
  const storageSeries = await metricSeries([
    { box: "nas", metric: "fs.used_pct/volume1" },
    { box: "nas", metric: "fs.used_pct/volume2" },
    { box: "nas", metric: "bcache.hit_pct" },
  ]);
  const streams = streamsSchema.parse(buildStreams(snaps, {}, buildUptimeMap(hist, ["plex","tautulli"])));
  const downloads = downloadsSchema.parse(buildDownloads(snaps, {}, buildUptimeMap(hist, ["sabnzbd","qbittorrent"])));
  const arr = arrSchema.parse(buildArr(snaps, buildUptimeMap(hist, ["sonarr","radarr","prowlarr","seerr"])));
  const tdarr = tdarrPanelSchema.parse(buildTdarrPanel(snaps, {}, buildUptimeMap(hist, ["tdarr"])));
  const storage = storageSchema.parse(buildStorage(snaps, storageSeries, buildUptimeMap(hist, ["agent"])));

  console.log("streams:", JSON.stringify({ plex: streams.plex, tautulli: streams.tautulli }));
  console.log("downloads.sab:", JSON.stringify({ ...downloads.sab, jobs: downloads.sab?.jobs.length }));
  console.log("downloads.qbit:", JSON.stringify(downloads.qbit));
  console.log("arr.sonarr:", JSON.stringify(arr.sonarr?.queue), "health:", JSON.stringify(arr.sonarr?.health));
  console.log("arr.prowlarr:", JSON.stringify(arr.prowlarr?.indexers.map(i => ({ name: i.name, enabled: i.enabled, disabledTill: i.disabledTill }))));
  console.log("arr.seerr:", JSON.stringify(arr.seerr));
  console.log("tdarr.nodes:", JSON.stringify(tdarr.nodes.map(n => ({ n: n.nodeName, paused: n.paused, w: n.workerCount, lim: n.limits, viol: n.limitViolation, q: n.queue }))));
  console.log("tdarr.stats:", JSON.stringify(tdarr.stats));
  console.log("storage.tiers:", JSON.stringify(storage.tiers.map(t => ({ p: t.path, pct: t.usedPct }))));
  console.log("storage.disks:", storage.disks.length, "smart:", storage.smart.length, "bcache:", storage.bcacheHitPct, "rootFolders:", JSON.stringify(storage.rootFolders.map(r => r.app + ":" + r.path)));
  console.log("storage.series pts:", storage.series.vol1UsedPct.length, storage.series.bcacheHitPct.length);
  console.log("uptime cells (agent):", Object.fromEntries(Object.entries(buildUptimeMap(hist, ["agent"])).map(([k,v]) => [k, v.filter(c=>c.state!=="empty").length + " polls"])));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
