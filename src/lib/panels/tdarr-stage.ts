/**
 * Map a Tdarr worker's raw `status` string to a user-facing stage.
 *
 * Tdarr reports the true per-worker stage via `status`; the progress
 * `percentage` is per-stage (it resets between phases). The dashboard bug this
 * fixes was rendering a bare "Scanning" with a 0% bar — which reads as stalled —
 * when a node was actually mid-job. Contract per Wren's handoff
 * (AGENT_HANDOFF_tdarr-stage-progress.md):
 *
 *  - Scanning        → brief probe/setup at job start. "Analyzing…", indeterminate.
 *  - Execute         → the actual transcode. "Transcoding", determinate bar + fps/eta.
 *  - Replace/Copy*   → writing output back to the NAS. "Finalizing", indeterminate
 *                      (percentage is unreliable, often 0 during a big network write).
 *  - idle / no work  → "Idle", no bar.
 *  - unknown         → neutral "Working…", indeterminate, keep raw status as tooltip.
 */
export type StageBar = "determinate" | "indeterminate" | "none";

export interface WorkerStage {
  /** User-facing stage label. */
  label: string;
  /** How to render the progress bar for this stage. */
  bar: StageBar;
  /** True only for the live transcode (Execute) — show fps/eta and the % readout. */
  isTranscoding: boolean;
  /** True for the Replace/Copy write-back family — where schema:3 replaceProgress applies. */
  isFinalizing: boolean;
}

export function workerStage(status: string): WorkerStage {
  const s = status.trim().toLowerCase();

  if (!s || s === "idle") {
    return { label: "Idle", bar: "none", isTranscoding: false, isFinalizing: false };
  }
  if (s === "scanning") {
    return { label: "Analyzing…", bar: "indeterminate", isTranscoding: false, isFinalizing: false };
  }
  if (s === "execute") {
    return { label: "Transcoding", bar: "determinate", isTranscoding: true, isFinalizing: false };
  }
  // "Replace Original" and any "Copy…" variant are the write-back/finalize family.
  if (s.startsWith("replace") || s.startsWith("copy")) {
    return { label: "Finalizing · writing to NAS", bar: "indeterminate", isTranscoding: false, isFinalizing: true };
  }
  // Tolerate unseen/future status strings rather than hiding the worker.
  return { label: "Working…", bar: "indeterminate", isTranscoding: false, isFinalizing: false };
}
