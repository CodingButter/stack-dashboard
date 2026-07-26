# Tdarr Governor State — Data Contract (current, schema 3)

**Channel:** two-way. Wren (plexstack repo, NAS-side) ⇄ Dashboard agent (stack-dashboard, UI-side).
**Rule:** append to your own log section; don't edit the other's. Timestamp entries.

This is the **consolidated, current** reference for the governor status contract. It replaces the old
`AGENT_HANDOFF_tdarr-governor.md` (which had grown into an unreadable pile of schema-1→2→3 diffs and
day-of back-and-forth). Everything below reflects **what is deployed and live now.**

- **Wren owns:** the NAS. `scripts/tdarr_gate.py` (the `tdarr-gate` service running the stream gate + I/O
  governor), the `status.json` it emits, and the NAS agent endpoint that serves it.
- **Dashboard agent owns:** the Next.js app — poller client, DB persist, Tdarr page UI.

---

## Where the state lives

The `tdarr-gate` service on the NAS writes a **full snapshot every poll** to:

```
/var/lib/tdarr-gate/status.json
```

- Written **atomically** (tmp + rename) — a reader always sees a complete file, never a half-write.
- Reflects **current** state every cycle, not just transitions.
- **Deployed cadence: every 10s** (`poll_secs: 10`). Read `poll_secs` from the payload — don't hardcode.

## How to fetch it

Read-only endpoint on the NAS agent (`agent/nas_agent.py`), same shape as `/stats`, `/smart`, `/gpu`.
**Live at `100.86.8.110:9101`:**

```
GET /tdarr/governor        Authorization: Bearer <token>
```

- Returns the parsed `status.json` verbatim with `running:true` + `age_s` added.
- When the file is missing/stale: returns `{ "running": false, "reason": "...", "age_s": N }` (HTTP 200).
  Agent computes staleness so the client doesn't have to. **No `error` key** — `running:false` is the trigger.
- Cached ~5s agent-side.

> **Note:** a UDP push path for this same governor object is being added — see
> `AGENT_HANDOFF_udp-telemetry.md`. The HTTP endpoint stays as the fallback and for one-off reads.

---

## Schema 3 (current)

```jsonc
{
  "schema": 3,
  "ts": 1785053100.12,         // unix seconds. STALENESS MARKER.
  "poll_secs": 10,             // how often the gate rewrites this file (deployed value)
  "mode": "governing",         // "streaming" | "governing" | "idle"
  "frozen": false,             // true = in-flight ffmpeg SIGSTOP-frozen (Plex streaming)
  "active_streams": 0,         // count of playing/buffering Plex sessions
  "stream_kbps": 0,            // total bandwidth Plex reserved for those streams
  "sab_limit_mbps": null,      // gate-imposed SAB download cap; null = uncapped
  "lane_max_secs": 600,        // read-phase lane-hold timeout (write phases exempt)
  "lane_holder": null,         // nodeName currently holding the heavy I/O lane, or null
  "heavy_nodes": [],           // nodeNames in a heavy phase (scan/replace/copy)
  "governor_paused_nodes": [], // nodeNames the GOVERNOR paused (contention), by NAME
  "stream_paused_node_ids": [],// node _ids the STREAM GATE paused (ephemeral ids)

  "nodes": [                   // per-node view, keyed by nodeName (never _id)
    {
      "name": "BigBeastNode",
      "exempt": false,          // true only for NasTNode (local I/O, no SMB hop)
      "paused": false,          // node's actual nodePaused flag
      "heavy": false,           // in a heavy I/O phase right now
      "writing": false,         // in Replace/Copy write-back (the crash-class phase)
      "lane_held_secs": null,   // seconds this node has owned the lane, or null
      "worker_count": 1,
      "worker_statuses": ["Transcode ..."],

      // --- schema 2 ---
      "actively_working": true,  // node is transcoding right now (Execute/Transcode) — NOT idle/stopped
      "replace_deferred": false, // governor is holding this node's NEXT job grab (throttle), but its
                                 //   current transcode keeps running. Suppressed when this node IS the
                                 //   lane_holder (a holder isn't queued behind anything).

      // --- schema 3 ---
      "replace_progress": null   // null unless in a Replace/Copy write-back; object below when writing
    }
  ]
}
```

### `replace_progress` (schema 3) — only present during write-back

```jsonc
"replace_progress": {
  "tmp": "/volume1/.../Movie (2025) WEBDL-1080p.mkv.tmp",
  "written_bytes": 785000000,
  "final_bytes":   4680000000,
  "pct":  17.9,     // 0..100, written/final — the progress bar. null if final momentarily unknown.
  "mbps": 1.6       // MB/s to NAS this poll — throughput. null on FIRST poll of a Replace (needs 2 samples).
}
```

- `null` when the node is **not** in a write-back phase.
- `pct == null` → render an **indeterminate** bar (rare).
- `mbps == null` → "starting…", not zero (first sample of a new Replace).
- **Fleet total write-back** = `Σ nodes[].replace_progress.mbps` — compute dashboard-side, no server field.

---

## Semantics that drive the UI

### `mode` — top-level badge
- **`streaming`** — someone's watching Plex. External nodes paused, in-flight ffmpeg frozen. Governor idle.
- **`governing`** — no streams, one node holds the heavy I/O lane, governor paused the others to serialize write-back.
- **`idle`** — no streams, no contention. Nodes free.

### Per-node label (combine these three)
| Condition | Render |
|-----------|--------|
| `actively_working: true`, `replace_deferred: false` | **Transcoding** |
| `actively_working: true`, `replace_deferred: true` | **transcoding · replace queued** (NOT "paused" — it's still encoding) |
| `writing: true` + `replace_progress != null` | **Finalizing · `pct`% · `mbps` MB/s** (determinate bar) |
| `writing: true` + `replace_progress == null` | **Finalizing…** (indeterminate bar, don't show 0%) |

`actively_working` was added precisely because `replace_deferred`/`paused_by_governor` alone read as
"stopped" when the node was in fact still transcoding — a governor throttle only defers the *next* job
grab, it never freezes the current encode.

### Staleness — CRITICAL
If `now - ts > 3 * poll_secs` (~30s at the deployed 10s cadence), treat the governor as **NOT RUNNING**
(service dead/wedged) and surface a distinct "gate offline" state. **Never render stale data as live** —
a silently-stopped gate must not look identical to a healthy idle one. The agent also computes this and
returns `running:false`; honor either path.

---

## Wren log
- **2026-07-26 ~04:10 EDT** — Consolidated the old governor handoff (schema 1→2→3 diffs + day-of log)
  into this single current-state doc. No contract change — this is the same schema-3 that's deployed and
  that your parser already handles. Old file `AGENT_HANDOFF_tdarr-governor.md` deleted. If you have links
  or notes pointing at the old filename, repoint them here.

## Dashboard agent log
_(append here)_
