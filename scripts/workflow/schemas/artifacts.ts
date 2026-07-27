import { z } from "zod";
import { metaSchema } from "./meta";
import {
  transportKindSchema,
  cadenceTierSchema,
  stableIdSchema,
  uiStateSchema,
  actionSafetySchema,
} from "./primitives";

/**
 * The 8 canonical, versioned contract artifacts (plan §3). Each embeds the
 * shared `meta` block so schema-version vs contract-version discipline and
 * provenance are machine-checkable on every artifact.
 *
 * Every `.strict()` object rejects unknown keys — a fabricated/placeholder
 * field cannot ride along undetected.
 */

// ─── 1. page-spec ────────────────────────────────────────────────────────────
// The source-of-truth decomposition: page → region → section → component.
const componentRefSchema = z
  .object({
    id: stableIdSchema,
    name: z.string().min(1),
    /** Redesign evidence this component is derived from (screenshot ref). */
    designRef: z.string().min(1),
  })
  .strict();

const sectionSchema = z
  .object({
    id: stableIdSchema,
    name: z.string().min(1),
    components: z.array(componentRefSchema),
  })
  .strict();

const regionSchema = z
  .object({
    id: stableIdSchema,
    name: z.string().min(1),
    sections: z.array(sectionSchema),
  })
  .strict();

export const pageSpecSchema = z
  .object({
    meta: metaSchema,
    pageId: z.string().min(1),
    title: z.string().min(1),
    regions: z.array(regionSchema).min(1),
  })
  .strict();
export type PageSpec = z.infer<typeof pageSpecSchema>;

// ─── 2. component-inventory ──────────────────────────────────────────────────
const componentInventoryEntrySchema = z
  .object({
    id: stableIdSchema,
    name: z.string().min(1),
    /** Redesign requires this component (vs optional/nice-to-have). */
    required: z.boolean(),
    /** States this component must render. */
    states: z.array(uiStateSchema).min(1),
    designRef: z.string().min(1),
  })
  .strict();

export const componentInventorySchema = z
  .object({
    meta: metaSchema,
    components: z.array(componentInventoryEntrySchema),
  })
  .strict();
export type ComponentInventory = z.infer<typeof componentInventorySchema>;

// ─── 3. field-inventory ──────────────────────────────────────────────────────
const fieldInventoryEntrySchema = z
  .object({
    id: stableIdSchema,
    label: z.string().min(1),
    /** Component that displays this field. */
    componentId: stableIdSchema,
    required: z.boolean(),
    designRef: z.string().min(1),
  })
  .strict();

export const fieldInventorySchema = z
  .object({
    meta: metaSchema,
    fields: z.array(fieldInventoryEntrySchema),
  })
  .strict();
export type FieldInventory = z.infer<typeof fieldInventorySchema>;

// ─── 4. data-contract ────────────────────────────────────────────────────────
// Every field mapped to a producer + update mechanism (transport kind).
export const dataContractFieldSchema = z
  .object({
    fieldId: stableIdSchema,
    transportKind: transportKindSchema,
    cadenceTier: cadenceTierSchema.nullable(),
    /**
     * The producer of record — the symbol/derivation that yields this value.
     * For the Tdarr write-back trap, this must point at the `replaceProgress`
     * derivation, NOT the raw `percentage`.
     */
    producer: z.string().min(1),
    /** Path/symbol where the producer lives. */
    producerRef: z.string().min(1),
    /** How consumers learn of updates (poll tick, push frame, event, etc.). */
    updateMechanism: z.string().min(1),
    /** Free-form notes; e.g. the MTU-budget caveat for udp-push fields. */
    notes: z.string().nullable(),
  })
  .strict()
  .refine(
    (f) => f.transportKind !== "http-poll" || f.cadenceTier !== null,
    { message: "http-poll fields must declare a cadenceTier", path: ["cadenceTier"] },
  );

export const dataContractSchema = z
  .object({
    meta: metaSchema,
    fields: z.array(dataContractFieldSchema),
  })
  .strict();
export type DataContract = z.infer<typeof dataContractSchema>;

// ─── 5. state-contract ───────────────────────────────────────────────────────
const stateEntrySchema = z
  .object({
    /** Component whose state behavior this describes. */
    componentId: stableIdSchema,
    state: uiStateSchema,
    /** What condition triggers this state (e.g. `governor === null`). */
    trigger: z.string().min(1),
    /** What the UI shows in this state. */
    presentation: z.string().min(1),
  })
  .strict();

export const stateContractSchema = z
  .object({
    meta: metaSchema,
    states: z.array(stateEntrySchema),
  })
  .strict();
export type StateContract = z.infer<typeof stateContractSchema>;

// ─── 6. action-contract ──────────────────────────────────────────────────────
const actionEntrySchema = z
  .object({
    id: stableIdSchema,
    name: z.string().min(1),
    safety: actionSafetySchema,
    /** Request contract: the action registry symbol / API route. */
    handlerRef: z.string().min(1),
    /** RBAC role(s) permitted to invoke. */
    requiredRoles: z.array(z.string().min(1)),
    /** Whether a confirmation flow is required before execution. */
    requiresConfirmation: z.boolean(),
    /** Expected effect + rollback (plan §6 amendment 5). */
    expectedEffect: z.string().min(1),
    rollback: z.string().nullable(),
  })
  .strict()
  .refine(
    (a) => a.safety === "read-only" || a.requiresConfirmation,
    {
      message: "non-read-only actions must requireConfirmation",
      path: ["requiresConfirmation"],
    },
  );

export const actionContractSchema = z
  .object({
    meta: metaSchema,
    actions: z.array(actionEntrySchema),
  })
  .strict();
export type ActionContract = z.infer<typeof actionContractSchema>;

// ─── 7. traceability-matrix ──────────────────────────────────────────────────
// Links every displayed field to its producer AND its consumer.
const traceLinkSchema = z
  .object({
    fieldId: stableIdSchema,
    producerRef: z.string().min(1),
    consumerRef: z.string().min(1),
    /** True once producer→consumer path is verified against real code. */
    verified: z.boolean(),
  })
  .strict();

export const traceabilityMatrixSchema = z
  .object({
    meta: metaSchema,
    links: z.array(traceLinkSchema),
  })
  .strict();
export type TraceabilityMatrix = z.infer<typeof traceabilityMatrixSchema>;

// ─── 8. acceptance-report ────────────────────────────────────────────────────
export const acceptanceStatusSchema = z.enum([
  "live-verified",
  "fixture-verified-with-live-follow-up",
  // Contracts drafted + validated by static analysis only; nothing executed
  // against live infra OR captured fixtures yet. The honest status for a
  // contract stage (plan §4 acceptance-status honesty).
  "contract-only",
  "blocked",
  "failed",
]);
export type AcceptanceStatus = z.infer<typeof acceptanceStatusSchema>;

const coverageSchema = z
  .object({
    field: z.number().min(0).max(100),
    component: z.number().min(0).max(100),
    state: z.number().min(0).max(100),
    action: z.number().min(0).max(100),
    traceability: z.number().min(0).max(100),
  })
  .strict();

const followUpItemSchema = z
  .object({
    /** What still needs live verification. */
    item: z.string().min(1),
    /** The field/action/behavior it concerns. */
    ref: z.string().min(1),
    resolved: z.boolean(),
  })
  .strict();

/**
 * Outcome of the Phase-6 independent adversarial ship-gate review (plan §2, Phase 6).
 * Optional: contracts approved before a ship gate (e.g. Phase-4 decision-gate state)
 * simply omit it. A "pass" verdict must record zero unresolved critical/high findings.
 */
const shipGateSchema = z
  .object({
    verdict: z.enum(["pass", "blocked"]),
    criticalHighFindings: z.number().int().min(0),
    priorFixesReVerified: z.array(z.string().min(1)),
    nonBlockingRisks: z.array(z.string().min(1)),
  })
  .strict()
  .refine((g) => g.verdict !== "pass" || g.criticalHighFindings === 0, {
    message: "a passing ship gate cannot carry unresolved critical/high findings",
    path: ["criticalHighFindings"],
  });

export const acceptanceReportSchema = z
  .object({
    meta: metaSchema,
    acceptanceStatus: acceptanceStatusSchema,
    coverage: coverageSchema,
    /** Independent reviewer identity/type (plan §2). */
    reviewer: z.string().min(1),
    /** Preserved live follow-up checklist (plan §4). */
    liveFollowUp: z.array(followUpItemSchema),
    /** Phase-6 independent ship-gate outcome (optional; absent pre-ship-gate). */
    shipGate: shipGateSchema.optional(),
  })
  .strict()
  .refine(
    (r) =>
      r.acceptanceStatus !== "live-verified" ||
      r.meta.provenance === "live" ||
      r.meta.provenance === "mixed",
    {
      message:
        "live-verified requires provenance live|mixed; fixture-only runs cannot claim live",
      path: ["acceptanceStatus"],
    },
  )
  .refine(
    (r) =>
      r.acceptanceStatus !== "fixture-verified-with-live-follow-up" ||
      r.liveFollowUp.length > 0,
    {
      message:
        "fixture-verified-with-live-follow-up must preserve a non-empty follow-up checklist",
      path: ["liveFollowUp"],
    },
  )
  .refine(
    (r) =>
      r.acceptanceStatus !== "fixture-verified-with-live-follow-up" ||
      r.meta.provenance === "fixture" ||
      r.meta.provenance === "mixed",
    {
      message:
        "fixture-verified-with-live-follow-up requires provenance fixture|mixed; static-analysis runs that exercised no fixtures must use contract-only",
      path: ["acceptanceStatus"],
    },
  )
  .refine(
    (r) =>
      r.acceptanceStatus !== "contract-only" ||
      (r.meta.provenance === "static-analysis" && r.liveFollowUp.length > 0),
    {
      message:
        "contract-only requires provenance static-analysis and a preserved non-empty follow-up checklist",
      path: ["acceptanceStatus"],
    },
  );
export type AcceptanceReport = z.infer<typeof acceptanceReportSchema>;
