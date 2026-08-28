export * from "./job-discovery";
export * from "./job-normalization";
export * from "./job-verification";
export * from "./job-deduplication";
export * from "./matching";

import { discoverJobsFunction } from "./job-discovery";
import { normalizeJobFunction } from "./job-normalization";
import { verifyJobFunction } from "./job-verification";
import { deduplicateAndIngestJobFunction } from "./job-deduplication";
import { matchCandidateJobFunction } from "./matching";

export const functions = [
  discoverJobsFunction,
  normalizeJobFunction,
  verifyJobFunction,
  deduplicateAndIngestJobFunction,
  matchCandidateJobFunction,
];
