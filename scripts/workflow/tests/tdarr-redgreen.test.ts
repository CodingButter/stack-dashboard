import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkImplementation, hasBlocking, type ComponentMarker } from "../validators";

/**
 * Phase 5 reproducible red/green proof (plan amendment 6).
 *
 * The SAME validator + the SAME marker map runs against two implementations:
 *   - the pre-migration baseline (Git revision f8c137f, the branch point) -> RED
 *   - the migrated implementation (current working tree)                  -> GREEN
 *
 * A different outcome from identical validator/config proves the IMPLEMENTATION
 * changed, not the test. Results are written to evidence/baseline/{without,with}.txt.
 */

const BASE_REV = "f8c137f961fcfee6214845eef53b068d03138860";
const EVIDENCE_DIR = join(
  process.cwd(),
  ".mastracode/stackdash-workflow-builder/runs/tdarr/evidence/baseline",
);
const MARKERS_PATH = join(
  process.cwd(),
  ".mastracode/stackdash-workflow-builder/runs/tdarr/analysis/impl-markers.json",
);

interface MarkerFile {
  sourceFiles: string[];
  markers: ComponentMarker[];
}

const markerFile: MarkerFile = JSON.parse(readFileSync(MARKERS_PATH, "utf8"));

/** Concatenated source for a set of repo paths at a given git revision. */
function sourceAtRevision(paths: string[], rev: string): string {
  return paths
    .map((p) => {
      try {
        return execFileSync("git", ["show", `${rev}:${p}`], {
          encoding: "utf8",
          cwd: process.cwd(),
        });
      } catch {
        return ""; // file may not exist at that revision — absence is a valid red signal
      }
    })
    .join("\n");
}

/** Concatenated source for a set of repo paths in the working tree. */
function sourceInWorkingTree(paths: string[]): string {
  return paths
    .map((p) => {
      try {
        return readFileSync(join(process.cwd(), p), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");
}

describe("Phase 5 reproducible red/green — implementation conformance", () => {
  let baselineResult: ReturnType<typeof checkImplementation>;
  let migratedResult: ReturnType<typeof checkImplementation>;

  beforeAll(() => {
    const baselineSource = sourceAtRevision(markerFile.sourceFiles, BASE_REV);
    const migratedSource = sourceInWorkingTree(markerFile.sourceFiles);

    baselineResult = checkImplementation({ source: baselineSource, markers: markerFile.markers });
    migratedResult = checkImplementation({ source: migratedSource, markers: markerFile.markers });

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const render = (label: string, r: ReturnType<typeof checkImplementation>) =>
      [
        `# ${label}`,
        `# validator: checkImplementation  markers: analysis/impl-markers.json`,
        `ok: ${r.ok}`,
        `coveragePct: ${r.coveragePct}`,
        `blocking: ${hasBlocking(r)}`,
        "",
        ...r.findings.map((f) => `[${f.severity}] ${f.rule} ${f.ref ?? ""}: ${f.message}`),
        r.findings.length === 0 ? "(no findings — all contracted components rendered)" : "",
        "",
      ].join("\n");

    writeFileSync(
      join(EVIDENCE_DIR, "without.txt"),
      render(`RED — pre-migration baseline @ ${BASE_REV}`, baselineResult),
    );
    writeFileSync(
      join(EVIDENCE_DIR, "with.txt"),
      render("GREEN — migrated implementation (working tree)", migratedResult),
    );
  });

  it("baseline (pre-migration) FAILS — redesign components not yet rendered (red)", () => {
    expect(baselineResult.ok).toBe(false);
    expect(hasBlocking(baselineResult)).toBe(true);
    // The baseline must be missing genuinely redesign-only components.
    const missingIds = baselineResult.findings.map((f) => f.ref);
    expect(missingIds).toContain("tdarr.analytics.charts.throughput");
    expect(missingIds).toContain("tdarr.analytics.charts.load");
  });

  it("migrated implementation PASSES — every contracted component rendered (green)", () => {
    expect(migratedResult.ok).toBe(true);
    expect(migratedResult.coveragePct).toBe(100);
    expect(migratedResult.findings).toHaveLength(0);
  });

  it("same validator + config yields a different outcome across the two trees (proves impl changed, not test)", () => {
    expect(baselineResult.ok).not.toBe(migratedResult.ok);
  });
});
