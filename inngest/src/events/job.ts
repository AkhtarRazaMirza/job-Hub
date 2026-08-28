/**
 * Job Ingestion & Workflow Inngest Event Schemas
 * Grounded in 02_how_to_build.md §4:
 *
 * Example conceptual workflow:
 * job.discovered
 * → normalize
 * → verify
 * → deduplicate
 * → analyze
 * → match candidate
 * → save score
 */

import { eventType } from "inngest";
import { z } from "zod";

/**
 * Event: jobs/discovery.trigger
 * Triggers discovery of new jobs across all or specified registered adapters.
 */
export const jobDiscoveryTriggerDataSchema = z.object({
  sourceId: z.string().optional(),
  limit: z.number().int().positive().optional(),
  tag: z.string().optional(),
  triggeredBy: z.enum(["cron", "manual", "api"]).optional(),
});

export type JobDiscoveryTriggerData = z.infer<typeof jobDiscoveryTriggerDataSchema>;

export const jobDiscoveryTriggerEvent = eventType("jobs/discovery.trigger", {
  schema: jobDiscoveryTriggerDataSchema,
});

/**
 * Event: job.discovered
 * Emitted when an external job listing is found by an adapter during discovery.
 */
export const jobDiscoveredDataSchema = z.object({
  source: z.string().min(1),
  sourceJobId: z.string().min(1),
  jobSourceId: z.string().nullable().optional(),
  url: z.string().url().optional(),
  data: z.record(z.unknown()),
  discoveredAt: z.string(), // ISO date string
});

export type JobDiscoveredData = z.infer<typeof jobDiscoveredDataSchema>;

export const jobDiscoveredEvent = eventType("job.discovered", {
  schema: jobDiscoveredDataSchema,
});

/**
 * Event: job.normalize.requested
 * Emitted to request canonical normalization of a raw discovered job.
 */
export const jobNormalizeRequestedDataSchema = z.object({
  source: z.string().min(1),
  sourceJobId: z.string().min(1),
  raw: z.record(z.unknown()),
});

export type JobNormalizeRequestedData = z.infer<typeof jobNormalizeRequestedDataSchema>;

export const jobNormalizeRequestedEvent = eventType("job.normalize.requested", {
  schema: jobNormalizeRequestedDataSchema,
});

/**
 * Event: job.normalized
 * Emitted after a discovered job is successfully normalized into the canonical Job model.
 */
export const jobNormalizedDataSchema = z.object({
  job: z.record(z.unknown()),
  source: z.string().min(1),
  sourceJobId: z.string().min(1),
  rawUrl: z.string().url().optional(),
  normalizedAt: z.string(),
});

export type JobNormalizedData = z.infer<typeof jobNormalizedDataSchema>;

export const jobNormalizedEvent = eventType("job.normalized", {
  schema: jobNormalizedDataSchema,
});

/**
 * Event: job.verified
 * Emitted after a normalized job has passed verification checks.
 */
export const jobVerifiedDataSchema = z.object({
  job: z.record(z.unknown()),
  source: z.string().min(1),
  sourceJobId: z.string().min(1),
  status: z.enum(["ACTIVE", "CLOSED", "UNKNOWN"]),
  isVerified: z.boolean(),
  isStale: z.boolean(),
  isSpam: z.boolean(),
  remoteClassification: z.enum([
    "WORLDWIDE_REMOTE",
    "COUNTRY_REMOTE",
    "REGION_REMOTE",
    "HYBRID",
    "ONSITE",
    "UNKNOWN",
  ]),
  reasons: z.array(z.string()),
  verifiedAt: z.string(),
});

export type JobVerifiedData = z.infer<typeof jobVerifiedDataSchema>;

export const jobVerifiedEvent = eventType("job.verified", {
  schema: jobVerifiedDataSchema,
});

/**
 * Event: job.duplicate.detected
 * Emitted when a job matches an existing canonical job record during deduplication.
 */
export const jobDuplicateDetectedDataSchema = z.object({
  source: z.string().min(1),
  sourceJobId: z.string().min(1),
  canonicalJobId: z.string().min(1),
  matchType: z.string(),
  confidence: z.number(),
  reasons: z.array(z.string()),
  detectedAt: z.string(),
});

export type JobDuplicateDetectedData = z.infer<typeof jobDuplicateDetectedDataSchema>;

export const jobDuplicateDetectedEvent = eventType("job.duplicate.detected", {
  schema: jobDuplicateDetectedDataSchema,
});

/**
 * Event: job.ingested
 * Emitted when a unique canonical job is successfully stored in the jobs database.
 */
export const jobIngestedDataSchema = z.object({
  jobId: z.string().min(1),
  source: z.string().min(1),
  sourceJobId: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  remoteType: z.enum([
    "WORLDWIDE_REMOTE",
    "COUNTRY_REMOTE",
    "REGION_REMOTE",
    "HYBRID",
    "ONSITE",
    "UNKNOWN",
  ]),
  ingestedAt: z.string(),
});

export type JobIngestedData = z.infer<typeof jobIngestedDataSchema>;

export const jobIngestedEvent = eventType("job.ingested", {
  schema: jobIngestedDataSchema,
});
