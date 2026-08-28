export * from "./job-discovery";
export * from "./job-normalization";
export * from "./job-verification";

import { discoverJobsFunction } from "./job-discovery";
import { normalizeJobFunction } from "./job-normalization";
import { verifyJobFunction } from "./job-verification";

export const functions = [
  discoverJobsFunction,
  normalizeJobFunction,
  verifyJobFunction,
];
