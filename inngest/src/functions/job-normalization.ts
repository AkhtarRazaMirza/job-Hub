/**
 * Durable Job Normalization Workflow
 * Grounded in 02_how_to_build.md §4:
 *
 * Example conceptual workflow:
 * job.discovered
 * → normalize
 * → verify
 * → deduplicate
 *
 * "Use retries, idempotency and step boundaries so the same event does not create duplicate jobs."
 */

import { inngest } from "../client";
import { jobNormalizationEngine, type DiscoveredRawJob } from "@job-hub/jobs";

export const normalizeJobFunction = inngest.createFunction(
  {
    id: "normalize-job",
    name: "Normalize Discovered Job",
    retries: 3,
    triggers: [
      { event: "job.discovered" },
    ],
  },
  async ({ event, step }) => {
    const rawJob: DiscoveredRawJob = {
      source: event.data.source,
      sourceJobId: event.data.sourceJobId,
      data: event.data.data,
      url: event.data.url,
      discoveredAt: new Date(event.data.discoveredAt),
    };

    // Step 1: Normalize via domain engine inside durable step boundary
    const normalized = await step.run("normalize-payload", async () => {
      return await jobNormalizationEngine.normalize(rawJob);
    });

    // Step 2: Emit job.normalized for downstream verification / deduplication
    await step.sendEvent("emit-job-normalized", {
      name: "job.normalized" as const,
      data: {
        job: normalized as unknown as Record<string, unknown>,
        source: rawJob.source,
        sourceJobId: rawJob.sourceJobId,
        rawUrl: rawJob.url,
        normalizedAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      source: rawJob.source,
      sourceJobId: rawJob.sourceJobId,
      canonicalUrl: normalized.canonicalUrl,
      remoteType: normalized.remoteType,
    };
  }
);
