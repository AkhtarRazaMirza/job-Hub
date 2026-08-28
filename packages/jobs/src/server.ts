/**
 * Server-only exports for @job-hub/jobs
 * Contains database repositories and server-side factories.
 */

import {
  DrizzleJobRepository,
  DrizzleJobSourceRepository,
  type JobRepository,
  type JobSourceRepository,
} from "./repository";

export * from "./repository";
export * from "./errors";
export * from "./source";

export const jobRepository: JobRepository = new DrizzleJobRepository();
export const jobSourceRepository: JobSourceRepository = new DrizzleJobSourceRepository();
