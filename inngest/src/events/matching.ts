/**
 * Candidate-Job Matching Inngest Event Schemas
 * Grounded in:
 * - 01_build_the_system.md §4 Step 7
 * - 02_how_to_build.md §4 ("match candidate → save score")
 * - 04_ai_agent_skills.md §9 & §10
 */

import { eventType } from "inngest";
import { z } from "zod";

/**
 * Event: job.match.requested
 * Triggers matching evaluation between a candidate profile and an ingested job.
 * Enforces ownership: only identifiers are passed in the payload,
 * domain data is derived server-side from authoritative repositories.
 */
export const jobMatchRequestedDataSchema = z.object({
  candidateProfileId: z.string().min(1, "Candidate profile ID is required"),
  jobId: z.string().min(1, "Job ID is required"),
  customWeights: z.record(z.string(), z.number()).optional(),
  requestedAt: z.string().optional(),
});

export type JobMatchRequestedData = z.infer<typeof jobMatchRequestedDataSchema>;

export const jobMatchRequestedEvent = eventType("job.match.requested", {
  schema: jobMatchRequestedDataSchema,
});

/**
 * Event: job.matched
 * Emitted when a candidate-job match evaluation has completed and is persisted into job_matches.
 */
export const jobMatchedDataSchema = z.object({
  matchId: z.string().min(1),
  candidateProfileId: z.string().min(1),
  jobId: z.string().min(1),
  overallScore: z.number(),
  decision: z.enum(["SKIP", "REVIEW", "STRONG_MATCH", "EXCELLENT_MATCH"]),
  hardConstraintsPassed: z.boolean(),
  matchedAt: z.string(),
});

export type JobMatchedData = z.infer<typeof jobMatchedDataSchema>;

export const jobMatchedEvent = eventType("job.matched", {
  schema: jobMatchedDataSchema,
});
