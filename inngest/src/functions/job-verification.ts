/**
 * Durable Job Verification Workflow
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
import { jobVerificationEngine, type CreateJobInput } from "@job-hub/jobs";

export const verifyJobFunction = inngest.createFunction(
  {
    id: "verify-job",
    name: "Verify Normalized Job",
    retries: 3,
    triggers: [
      { event: "job.normalized" },
    ],
  },
  async ({ event, step }) => {
    const jobInput = event.data.job as unknown as CreateJobInput;

    // Step 1: Verify status, freshness, spam signals, and remote constraints
    const verification = await step.run("verify-job-status", async () => {
      return await jobVerificationEngine.verify(jobInput);
    });

    // Step 2: Emit job.verified for downstream deduplication
    await step.sendEvent("emit-job-verified", {
      name: "job.verified" as const,
      data: {
        job: event.data.job,
        source: event.data.source,
        sourceJobId: event.data.sourceJobId,
        status: verification.status,
        isVerified: verification.isVerified,
        isStale: verification.isStale,
        isSpam: verification.isSpam,
        remoteClassification: verification.remoteClassification,
        reasons: verification.reasons,
        verifiedAt: typeof verification.verifiedAt === "string"
          ? verification.verifiedAt
          : new Date().toISOString(),
      },
    });

    return {
      success: true,
      source: event.data.source,
      sourceJobId: event.data.sourceJobId,
      status: verification.status,
      isVerified: verification.isVerified,
      reasonsCount: verification.reasons.length,
    };
  }
);
