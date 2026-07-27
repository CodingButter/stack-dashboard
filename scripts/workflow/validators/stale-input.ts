import { type ValidationResult, type Finding, fail } from "./types";

/**
 * Stale-artifact guard (plan §5b / CONSTITUTION §7). Compares the CURRENT hash
 * of every recorded manifest input against the recorded hash. A changed
 * upstream input marks its consuming phase — and every downstream phase — as
 * `invalidated`, and blocks stale feed-forward.
 *
 * The apparatus stays IO-free here: the caller passes the recorded manifest and
 * a map of freshly-computed current hashes, so this is a pure function that is
 * trivial to test (a mutated hash must invalidate downstream stages).
 */

export interface ManifestInput {
  path: string;
  hash: string;
}

/** Ordered phase pipeline; earlier phases feed later ones. */
export interface PhaseConsumption {
  phase: string;
  /** Manifest input paths this phase consumed. */
  consumes: string[];
}

export interface StaleCheckArgs {
  /** Recorded manifest inputs (path → recorded hash). */
  recorded: ManifestInput[];
  /** Freshly computed current hashes (path → current hash). */
  current: Record<string, string>;
  /** Ordered phases with the inputs each consumed. */
  pipeline: PhaseConsumption[];
}

export interface StaleCheckResult extends ValidationResult {
  /** Phases that must be re-run, in pipeline order (changed + all downstream). */
  invalidatedPhases: string[];
  /** Input paths whose hash changed. */
  changedInputs: string[];
}

export function checkStaleInputs(args: StaleCheckArgs): StaleCheckResult {
  const { recorded, current, pipeline } = args;
  const recordedByPath = new Map(recorded.map((r) => [r.path, r.hash]));
  const findings: Finding[] = [];
  const changedInputs: string[] = [];

  for (const [path, recordedHash] of recordedByPath) {
    const currentHash = current[path];
    if (currentHash === undefined) {
      findings.push({
        rule: "stale-input",
        severity: "high",
        message: `manifest input missing from current tree: ${path}`,
        ref: path,
      });
      changedInputs.push(path);
      continue;
    }
    if (currentHash !== recordedHash) {
      findings.push({
        rule: "stale-input",
        severity: "high",
        message: `manifest input changed since recorded: ${path}`,
        ref: path,
      });
      changedInputs.push(path);
    }
  }

  // Find the earliest phase that consumed a changed input; it and everything
  // downstream is invalidated (no stale feed-forward).
  const changed = new Set(changedInputs);
  let firstAffected = -1;
  for (let i = 0; i < pipeline.length; i++) {
    if (pipeline[i].consumes.some((p) => changed.has(p))) {
      firstAffected = i;
      break;
    }
  }
  const invalidatedPhases =
    firstAffected === -1
      ? []
      : pipeline.slice(firstAffected).map((p) => p.phase);

  const base = fail(findings);
  return { ...base, invalidatedPhases, changedInputs };
}
