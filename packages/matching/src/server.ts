/**
 * Server-only exports for @job-hub/matching
 * Contains Drizzle repository instances and database access.
 */

import { DrizzleJobMatchRepository, type JobMatchRepository } from "./repository";

export * from "./types";
export * from "./validation";
export * from "./errors";
export * from "./repository";

export const jobMatchRepository: JobMatchRepository = new DrizzleJobMatchRepository();
