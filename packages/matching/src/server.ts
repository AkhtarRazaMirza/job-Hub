/**
 * Server-only exports for @job-hub/matching
 * Contains Drizzle repository instances, default matching engine, and database access.
 */

import { DrizzleJobMatchRepository, type JobMatchRepository } from "./repository";
import { MatchingEngine } from "./engine";
import { defaultAiProvider } from "@job-hub/ai";

export * from "./index";
export * from "./repository";

export const jobMatchRepository: JobMatchRepository = new DrizzleJobMatchRepository();
export const defaultMatchingEngine = new MatchingEngine({ aiProvider: defaultAiProvider });
