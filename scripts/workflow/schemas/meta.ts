import { z } from "zod";

/**
 * Shared `meta` block embedded in every canonical contract artifact.
 *
 * Versioning discipline (see CONSTITUTION.md §"Version-bump discipline"):
 * - `schemaVersion` bumps when the ARTIFACT SCHEMA shape/semantics change.
 * - `contractVersion` bumps when THIS page's contract CONTENT changes.
 * These are declared independently so a schema migration is always
 * distinguishable from a page-contract change; an existing field's meaning
 * must never silently change under the same version.
 */

/** Semantic version `MAJOR.MINOR.PATCH` (no pre-release/build for contracts). */
export const semverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, "must be semver MAJOR.MINOR.PATCH");

/** Lowercase page slug — the stable-ID root and run identifier. */
export const pageIdSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, "pageId must match [a-z0-9-]+");

/** ISO-8601 timestamp. */
export const isoTimestampSchema = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO-8601 timestamp");

/**
 * How a canonical artifact's values were obtained. Governs the acceptance
 * claims that may be made from it (plan §4).
 */
export const provenanceSchema = z.enum([
  "live",
  "fixture",
  "static-analysis",
  "mixed",
]);
export type Provenance = z.infer<typeof provenanceSchema>;

export const metaSchema = z
  .object({
    schemaVersion: semverSchema,
    contractVersion: semverSchema,
    pageId: pageIdSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    /** Git sha or tag of `scripts/workflow` that generated the artifact. */
    apparatusVersion: z.string().min(1),
    /** Design source, e.g. `.../tdarr-redesign.png@<sha>`. */
    sourceDesignRef: z.string().min(1),
    provenance: provenanceSchema,
    /** Prior `contractVersion` this supersedes, or null for the first. */
    supersedes: semverSchema.nullable(),
  })
  .strict();
export type Meta = z.infer<typeof metaSchema>;
