/**
 * Plain-English explanations for dashboard terms, surfaced by the little "i"
 * info dots next to metrics and panel titles. Written for a reader who does
 * not know the media-stack internals — no jargon, one or two short sentences.
 *
 * Keys are stable slugs referenced by <InfoDot term="..." />. Keep them
 * lowercase-kebab so they read clearly at the call site.
 */
export type GlossaryEntry = {
  /** Short heading shown at the top of the popover. */
  title: string;
  /** One or two plain sentences explaining what the thing means. */
  body: string;
};

export const GLOSSARY = {
  // ---- Tdarr ---------------------------------------------------------------
  "queue-depth": {
    title: "Queue depth",
    body: "How many video files are waiting to be processed by Tdarr. A higher number means more work is backed up; it should trend down over time as nodes chew through it.",
  },
  "library-files": {
    title: "Library files",
    body: "The total number of video files Tdarr is tracking in your library.",
  },
  transcodes: {
    title: "Transcodes",
    body: "How many files Tdarr has re-encoded so far. Transcoding converts a video into a smaller or more compatible format.",
  },
  "health-checks": {
    title: "Health checks",
    body: "How many files Tdarr has scanned for corruption or playback problems, separate from re-encoding them.",
  },
  "space-saved": {
    title: "Space saved",
    body: "Total disk space reclaimed by re-encoding files into smaller versions, added up across everything Tdarr has processed.",
  },
  "active-workers": {
    title: "Active workers",
    body: "How many transcode jobs are running right now across all your Tdarr nodes. Each worker handles one file at a time.",
  },
  "writeback-throughput": {
    title: "Write-back throughput",
    body: "The combined speed, in megabytes per second, at which finished transcodes are being written back to storage across all nodes. This is the total across every node, not a per-node breakdown.",
  },
  "tdarr-node": {
    title: "Tdarr node",
    body: "A machine that does the actual video processing for Tdarr. You can run several nodes so files get processed in parallel.",
  },
  "node-limits": {
    title: "Worker limits",
    body: "The maximum jobs this node will run at once, split between the GPU (fast, uses the graphics card) and the CPU (slower, uses the main processor).",
  },
  "node-queue": {
    title: "Node queue",
    body: "Files assigned to this specific node — how many are waiting to be transcoded versus health-checked.",
  },
  "worker-stage": {
    title: "Worker stage",
    body: "What a job is doing right now: Analyzing (inspecting the file), Transcoding (re-encoding, with live speed and progress), or Finalizing (writing the finished file back to storage).",
  },

  // ---- I/O Governor --------------------------------------------------------
  governor: {
    title: "I/O Governor",
    body: "An automatic traffic controller for the NAS. When people are streaming, it pauses or slows heavy background transcoding so playback stays smooth, then lets it resume when things are quiet.",
  },
  "governor-mode": {
    title: "Governor mode",
    body: "Streaming = someone is watching, so heavy work is held back. Governing = actively throttling background jobs. Idle = nothing to manage, full speed ahead.",
  },
  "lane-holder": {
    title: "Lane holder",
    body: "The one node currently allowed to write to the NAS through the reserved 'fast lane', so big writes don't collide and slow everything down.",
  },
  "lane-timeout": {
    title: "Lane timeout",
    body: "The most time a node may hold the write lane before it must hand it off, so no single node hogs disk access.",
  },
  "governor-paused": {
    title: "Governor-paused",
    body: "Nodes the governor has temporarily stopped to protect streaming or disk performance. They resume automatically once it's safe.",
  },
  "replace-queued": {
    title: "Replace queued",
    body: "The node finished transcoding and is waiting for its turn to write the new file back to the NAS. It is still working, not stuck.",
  },
  "write-back": {
    title: "Write-back",
    body: "Total speed at which finished transcodes are being copied back to the NAS right now, summed across every node currently finalizing. \"Idle\" means nothing is being written.",
  },
  "sab-cap": {
    title: "SAB cap",
    body: "The download speed limit the governor is currently applying to the usenet downloader, to keep bandwidth free for streaming.",
  },

  // ---- Streams / Plex ------------------------------------------------------
  "active-streams": {
    title: "Active streams",
    body: "How many people are watching something through Plex right now.",
  },
  "stream-bandwidth": {
    title: "Stream bandwidth",
    body: "The combined network speed all current streams are using to deliver video to viewers.",
  },
  "direct-play": {
    title: "Direct play",
    body: "Plex is sending the original file straight to the device with no conversion — the most efficient way to stream, using almost no server power.",
  },
  "direct-stream": {
    title: "Direct stream",
    body: "Plex is repackaging the file but not re-encoding the video, so it uses a little server power but keeps the original quality.",
  },
  "stream-transcode": {
    title: "Transcode (stream)",
    body: "Plex is converting the video on the fly to fit the viewer's device or connection. This uses the most server power.",
  },
  "now-playing": {
    title: "Now playing",
    body: "The titles currently being watched, who is watching, and how each stream is being delivered.",
  },
  "session-history": {
    title: "Session history",
    body: "A log of what was recently watched on Plex.",
  },
  "tautulli-breakdown": {
    title: "Tautulli breakdown",
    body: "Viewing statistics from Tautulli, a tool that tracks Plex activity and usage over time.",
  },
  streams: {
    title: "Streams",
    body: "The number of playback sessions Tautulli is currently tracking on Plex.",
  },
  lan: {
    title: "LAN bandwidth",
    body: "Combined stream bandwidth being delivered to devices inside your home network.",
  },
  wan: {
    title: "WAN bandwidth",
    body: "Combined stream bandwidth being delivered to viewers over the internet.",
  },

  // ---- Downloads (SABnzbd / qBittorrent) -----------------------------------
  "sab-queue": {
    title: "SABnzbd queue",
    body: "Files waiting to download over usenet. SABnzbd is the usenet download client.",
  },
  "usenet-speed": {
    title: "Usenet speed",
    body: "The current download speed from usenet servers.",
  },
  qbittorrent: {
    title: "qBittorrent",
    body: "The torrent download client. It downloads files and can keep sharing (seeding) them afterward.",
  },
  "torrent-down": {
    title: "Torrent download",
    body: "Current combined download speed across all active torrents.",
  },
  "torrent-up": {
    title: "Torrent upload",
    body: "Current combined upload speed — data you are sharing back to other people (seeding).",
  },
  seeding: {
    title: "Seeding",
    body: "Torrents you have finished downloading and are now sharing back to others.",
  },
  seedboost: {
    title: "Seedboost",
    body: "A temporary bump in upload priority to help a torrent reach its sharing target faster.",
  },
  throughput: {
    title: "Throughput",
    body: "The overall rate of data moving through the downloaders over time.",
  },

  // ---- Arr apps (Sonarr / Radarr / Prowlarr) -------------------------------
  "arr-queue": {
    title: "Download queue",
    body: "Items the *arr apps (Sonarr for TV, Radarr for movies) have sent to a downloader and are tracking until they finish and get imported.",
  },
  "import-pending": {
    title: "Import pending",
    body: "A download finished but hasn't been moved into your library yet — often because the app is deciding whether it's an upgrade over what you already have.",
  },
  stalled: {
    title: "Stalled",
    body: "A download that has stopped making progress. It may need attention or removal.",
  },
  errored: {
    title: "Errored",
    body: "A download the app flagged as failed — for example the file wasn't found on the server or couldn't be grabbed.",
  },
  "arr-root-folders": {
    title: "Root folders",
    body: "The top-level library folders where Sonarr and Radarr store your TV shows and movies.",
  },
  "prowlarr-indexers": {
    title: "Prowlarr indexers",
    body: "The search sources (trackers and usenet indexers) Prowlarr manages and shares with the other apps to find content.",
  },
  "seerr-requests": {
    title: "Seerr requests",
    body: "Content people have requested through Overseerr/Jellyseerr, shown as approved, pending, or declined.",
  },

  // ---- Storage -------------------------------------------------------------
  "storage-tiers": {
    title: "Storage tiers",
    body: "The NAS splits storage into a fast 'hot' tier for active files and a large 'cold' tier for long-term storage. Files move between them automatically.",
  },
  "hot-tier": {
    title: "Hot tier",
    body: "Fast storage for recently added or frequently used files. Fills up quicker, so it's watched closely.",
  },
  "cold-tier": {
    title: "Cold tier",
    body: "The big, slower storage pool where most of the library lives long-term.",
  },
  "disk-utilization": {
    title: "Disk utilization",
    body: "How busy the disks are handling reads and writes right now — not how full they are, but how hard they're working.",
  },
  "bcache-hit-ratio": {
    title: "bcache hit ratio",
    body: "How often reads are served from the fast SSD cache instead of the slow disks. Higher is better — it means more data is coming from cache.",
  },
  smart: {
    title: "S.M.A.R.T.",
    body: "Built-in drive self-diagnostics that report health, temperature, and early warning signs of a disk starting to fail.",
  },

  // ---- Machines / NAS vitals -----------------------------------------------
  "nas-vitals": {
    title: "NAS vitals",
    body: "Live health readings for the NAS: processor load, memory use, disk wait, and network activity.",
  },
  cpu: {
    title: "CPU",
    body: "How much of the processor is in use. Sustained high numbers mean the machine is working hard.",
  },
  memory: {
    title: "Memory (RAM)",
    body: "How much working memory is in use. When it runs low the system slows down.",
  },
  load: {
    title: "Load average",
    body: "A rough measure of how much work is queued for the processor. Compare it to the number of CPU cores — higher than the core count means tasks are waiting.",
  },
  iowait: {
    title: "iowait",
    body: "The share of time the processor spends waiting on disk or network instead of doing work. High iowait usually points to slow storage.",
  },
  "d-state": {
    title: "D-state processes",
    body: "Programs stuck waiting on the disk and unable to be interrupted. A few briefly is normal; many for a long time signals a storage problem.",
  },
  "failed-units": {
    title: "Failed units",
    body: "Background system services that have crashed or failed to start on this machine.",
  },
  uptime: {
    title: "Uptime",
    body: "How long the service or machine has been running without a restart.",
  },
  "lan-wan": {
    title: "LAN / WAN",
    body: "LAN is traffic inside your home network; WAN is traffic to and from the internet.",
  },

  // ---- Service health / alerts ---------------------------------------------
  "service-health": {
    title: "Service health",
    body: "A quick up/down status for each service in the stack, based on whether it's responding to checks.",
  },
  alerts: {
    title: "Alerts",
    body: "Conditions the system is warning you about, like a disk filling up or a service being down. They clear automatically once resolved.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryTerm = keyof typeof GLOSSARY;
