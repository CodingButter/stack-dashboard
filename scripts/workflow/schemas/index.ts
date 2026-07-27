/**
 * Canonical, versioned contract schemas for the StackDash page-migration
 * apparatus. Reusable across pages — no page-specific (e.g. Tdarr) names live
 * here. See CONSTITUTION.md for the governing rules.
 */
export * from "./meta";
export * from "./primitives";
export * from "./artifacts";

import { pageSpecSchema } from "./artifacts";
import {
  componentInventorySchema,
  fieldInventorySchema,
  dataContractSchema,
  stateContractSchema,
  actionContractSchema,
  traceabilityMatrixSchema,
  acceptanceReportSchema,
} from "./artifacts";

/**
 * Registry of the 8 canonical artifact schemas keyed by canonical filename
 * (without extension). Validators and gate scripts resolve schemas by name.
 */
export const canonicalSchemas = {
  "page-spec": pageSpecSchema,
  "component-inventory": componentInventorySchema,
  "field-inventory": fieldInventorySchema,
  "data-contract": dataContractSchema,
  "state-contract": stateContractSchema,
  "action-contract": actionContractSchema,
  "traceability-matrix": traceabilityMatrixSchema,
  "acceptance-report": acceptanceReportSchema,
} as const;

export type CanonicalArtifactName = keyof typeof canonicalSchemas;
