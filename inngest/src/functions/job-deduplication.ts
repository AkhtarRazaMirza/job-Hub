/**
 * Durable Job Deduplication & Canonical Ingestion Workflow
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
 *
 * "Use retries, idempotency and step boundaries so the same event does not create duplicate jobs."
 */

import { inngest } from "../client";
import {
  jobDeduplicationEngine,
  type CreateJobInput,
} from "@job-hub/jobs";
import { jobRepository } from "@job-hub/jobs/server";

export const deduplicateAndIngestJobFunction = inngest.createFunction(
  {
    id: "deduplicate-and-ingest-job",
    name: "Deduplicate and Ingest Verified Job",
    retries: 3,
    triggers: [
      { event: "job.verified" },
    ],
  },
  async ({ event, step }) => {
    const jobInput = event.data.job as unknown as CreateJobInput;

    // Step 1: Run deterministic two-tier deduplication check
    const dedupResult = await step.run("check-duplicate", async () => {
      return await jobDeduplicationEngine.findDuplicate(jobInput);
    });

    if (dedupResult.isDuplicate && dedupResult.match) {
      // Step 2a: Emit duplicate detected event and avoid creating duplicate in DB
      await step.sendEvent("emit-duplicate-detected", {
        name: "job.duplicate.detected" as const,
        data: {
          source: event.data.source,
          sourceJobId: event.data.sourceJobId,
          canonicalJobId: dedupResult.match.canonicalJobId,
          matchType: dedupResult.match.matchType,
          confidence: dedupResult.match.confidence,
          reasons: dedupResult.match.reasons,
          detectedAt: new Date().toISOString(),
        },
      });

      return {
        status: "DUPLICATE" as const,
        canonicalJobId: dedupResult.match.canonicalJobId,
        matchType: dedupResult.match.matchType,
        source: event.data.source,
        sourceJobId: event.data.sourceJobId,
      };
    }

    // Step 2b: Persist new canonical job in PostgreSQL inside durable step boundary
    const createdJob = await step.run("persist-canonical-job", async () => {
      return await jobRepository.create(jobInput);
    });

    // Step 3: Emit job.ingested for Phase 4 matching subsystem
    await step.sendEvent("emit-job-ingested", {
      name: "job.ingested" as const,
      data: {
        jobId: createdJob.id,
        source: createdJob.source,
        sourceJobId: createdJob.sourceJobId ?? event.data.sourceJobId,
        title: createdJob.title,
        company: createdJob.company,
        remoteType: createdJob.remoteType as
          | "WORLDWIDE_REMOTE"
          | "COUNTRY_REMOTE"
          | "REGION_REMOTE"
          | "HYBRID"
          | "ONSITE"
          | "UNKNOWN",
        ingestedAt: new Date().toISOString(),
      },
    });

    return {
      status: "INGESTED" as const,
      jobId: createdJob.id,
      title: createdJob.title,
      company: createdJob.company,
      source: createdJob.source,
      sourceJobId: createdJob.sourceJobId,
    };
  }
);

Object.defineProperty(deduplicateAndIngestJobFunction, "id", {
  value: "deduplicate-and-ingest-job",
  configurable: true,
  writable: true,
});
