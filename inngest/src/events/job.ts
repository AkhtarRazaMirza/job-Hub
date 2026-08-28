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
