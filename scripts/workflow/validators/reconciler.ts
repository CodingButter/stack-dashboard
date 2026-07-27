import type { FieldInventory, DataContract } from "../schemas";

/**
 * Prior-art reconciler (plan §2 / Phase 2). Compares the workflow-generated
 * field inventory + data contract (AUTHORITATIVE) against a parsed prior-art
 * classification (e.g. `dashboard-data-classification.md`, NON-authoritative)
 * and emits drift. Drift is RECORDED, never silently merged.
 *
 * Parsing the markdown into `PriorArtField[]` is Phase 4's concern; the
 * reconciliation logic here is a pure function so it is trivially testable.
 */

export interface PriorArtField {
  /** Human label or stable id as it appears in the prior-art doc. */
  key: string;
  /** Declared source/transport in prior art (free text, e.g. "udp-push"). */
  source?: string;
  /** Declared owner/producer in prior art, if any. */
  owner?: string;
}

export type DriftKind =
  | "missing" // in generated inventory, absent from prior art
  | "stale" // in prior art, absent from generated inventory
  | "contradictory" // present in both but source/owner disagree
  | "duplicate" // appears more than once in prior art
  | "ambiguous-owner"; // prior art gives multiple owners for one key

export interface DriftEntry {
  kind: DriftKind;
  key: string;
  detail: string;
}

export interface ReconcileResult {
  drift: DriftEntry[];
  /** True when no drift was found. */
  clean: boolean;
}

/** Normalize a key for comparison (lowercase, trim, collapse whitespace). */
function norm(k: string): string {
  return k.toLowerCase().trim().replace(/\s+/g, " ");
}

export function reconcilePriorArt(
  generated: FieldInventory,
  data: DataContract,
  priorArt: PriorArtField[],
): ReconcileResult {
  const drift: DriftEntry[] = [];

  // Generated keys: field ids + labels.
  const genByKey = new Map<string, string>(); // norm key -> field id
  for (const f of generated.fields) {
    genByKey.set(norm(f.id), f.id);
    genByKey.set(norm(f.label), f.id);
  }
  const transportByFieldId = new Map(
    data.fields.map((f) => [f.fieldId, f.transportKind as string]),
  );

  // Detect duplicates + ambiguous owners in prior art.
  const seen = new Map<string, PriorArtField[]>();
  for (const pa of priorArt) {
    const k = norm(pa.key);
    const bucket = seen.get(k) ?? [];
    bucket.push(pa);
    seen.set(k, bucket);
  }
  for (const [k, bucket] of seen) {
    if (bucket.length > 1) {
      drift.push({
        kind: "duplicate",
        key: k,
        detail: `prior art lists "${k}" ${bucket.length} times`,
      });
      const owners = new Set(
        bucket.map((b) => b.owner).filter((o): o is string => !!o),
      );
      if (owners.size > 1) {
        drift.push({
          kind: "ambiguous-owner",
          key: k,
          detail: `prior art gives multiple owners: ${[...owners].join(", ")}`,
        });
      }
    }
  }

  // stale: prior-art key not in generated inventory.
  // contradictory: source disagrees with generated transport kind.
  for (const [k, bucket] of seen) {
    const genFieldId = genByKey.get(k);
    if (!genFieldId) {
      drift.push({
        kind: "stale",
        key: k,
        detail: `prior-art key "${k}" not present in generated field inventory`,
      });
      continue;
    }
    const genTransport = transportByFieldId.get(genFieldId);
    for (const pa of bucket) {
      if (pa.source && genTransport && norm(pa.source) !== norm(genTransport)) {
        drift.push({
          kind: "contradictory",
          key: k,
          detail: `prior art source "${pa.source}" contradicts generated transport "${genTransport}" for ${genFieldId}`,
        });
      }
    }
  }

  // missing: generated field with no prior-art mention (by id or label).
  const priorKeys = new Set([...seen.keys()]);
  for (const f of generated.fields) {
    if (!priorKeys.has(norm(f.id)) && !priorKeys.has(norm(f.label))) {
      drift.push({
        kind: "missing",
        key: f.id,
        detail: `generated field "${f.id}" has no prior-art entry`,
      });
    }
  }

  return { drift, clean: drift.length === 0 };
}
