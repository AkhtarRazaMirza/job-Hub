export * from "./job-discovery";
export * from "./job-normalization";
export * from "./job-verification";
export * from "./job-deduplication";

import { discoverJobsFunction } from "./job-discovery";
import { normalizeJobFunction } from "./job-normalization";
import { verifyJobFunction } from "./job-verification";
import { deduplicateAndIngestJobFunction } from "./job-deduplication";

export const functions = [
  discoverJobsFunction,
  normalizeJobFunction,
  verifyJobFunction,
  deduplicateAndIngestJobFunction,
];
