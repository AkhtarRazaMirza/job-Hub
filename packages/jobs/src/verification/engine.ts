/**
 * Job Hub — Job Verification Engine
 * Grounded in:
 * - 01_build_the_system.md §4 Step 5
 * - 02_how_to_build.md §4 & §5
 * - 04_ai_agent_skills.md §6 & §7
 *
 * Verifies job postings for:
 * 1. Application URL validity & HTTP accessibility
 * 2. Active vs Closed status
 * 3. Posting freshness & stale thresholds
 * 4. Location restrictions & strict remote classifications
 * 5. Company identity & spam/fraud signals
 */

import { jobSourceRegistry, JobSourceRegistry } from "../source/registry";
import type { CreateJobInput, JobStatus } from "../types";
import type {
  VerifyJobOptions,
  JobVerificationResult,
  BatchVerificationResult,
} from "./types";
import { checkJobFreshness } from "./freshness";
import { detectSpamSignals } from "./spam-detector";
import { auditRemoteClassification } from "./remote-auditor";

export class JobVerificationEngine {
  constructor(
    private readonly registry: JobSourceRegistry = jobSourceRegistry,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  /**
   * Performs comprehensive multi-factor verification on a job posting.
   */
  async verify(
    job: CreateJobInput,
    options?: VerifyJobOptions
  ): Promise<JobVerificationResult> {
    const reasons: string[] = [];

    // 1. Application URL validation
    let applicationUrlValid = false;
    if (job.applicationUrl) {
      try {
        const parsed = new URL(job.applicationUrl);
        applicationUrlValid = parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        applicationUrlValid = false;
      }
    }

    if (!applicationUrlValid) {
      reasons.push(`Invalid or malformed application URL: "${job.applicationUrl}"`);
    }

    // 2. Active status verification
    let status: JobStatus = "UNKNOWN";

    if (options?.checkLiveStatus !== false && applicationUrlValid) {
      const adapter = this.registry.get(job.source);

      if (adapter) {
        try {
          status = await adapter.verifyStatus({
            applicationUrl: job.applicationUrl,
            sourceJobId: job.sourceJobId,
            signal: options?.signal,
          });
        } catch {
          status = "UNKNOWN";
        }
      } else {
        // Fallback HTTP HEAD probe
        try {
          const res = await this.fetchFn(job.applicationUrl, {
            method: "HEAD",
            signal: options?.signal,
            headers: {
              "User-Agent": "JobHub-Bot/1.0 (+https://jobhub.dev)",
            },
          });

          if (res.status >= 200 && res.status < 400) {
            status = "ACTIVE";
          } else if (res.status === 404 || res.status === 410) {
            status = "CLOSED";
          } else {
            status = "UNKNOWN";
          }
        } catch {
          status = "UNKNOWN";
        }
      }
    } else {
      const fallbackStatus: JobStatus = (job.status as JobStatus) || "ACTIVE";
      status = applicationUrlValid ? fallbackStatus : "CLOSED";
    }

    // 3. Freshness check
    const freshness = checkJobFreshness(job, {
      maxStaleDays: options?.maxStaleDays,
    });

    if (freshness.isStale) {
      reasons.push(...freshness.reasons);
      status = "CLOSED";
    }

    // 4. Spam and quality detection
    const spamCheck = detectSpamSignals(job);
    if (spamCheck.isSpam) {
      reasons.push(...spamCheck.reasons);
      status = "CLOSED";
    }

    // 5. Remote policy audit
    const remoteAudit = auditRemoteClassification(job);
    if (!remoteAudit.isValid) {
      reasons.push(...remoteAudit.warnings);
    }

    const isVerified =
      status === "ACTIVE" &&
      applicationUrlValid &&
      !freshness.isStale &&
      !spamCheck.isSpam;

    return {
      status,
      isVerified,
      isStale: freshness.isStale,
      isSpam: spamCheck.isSpam,
      applicationUrlValid,
      freshnessDays: freshness.freshnessDays,
      remoteClassification: remoteAudit.auditedRemoteType,
      reasons,
      verifiedAt: new Date(),
    };
  }

  /**
   * Verifies a batch of job listings.
   */
  async verifyBatch(
    jobs: CreateJobInput[],
    options?: VerifyJobOptions
  ): Promise<BatchVerificationResult> {
    const results: {
      sourceJobId: string;
      source: string;
      verification: JobVerificationResult;
    }[] = [];

    let activeCount = 0;
    let closedCount = 0;
    let spamCount = 0;
    let staleCount = 0;

    for (const job of jobs) {
      const verification = await this.verify(job, options);

      if (verification.status === "ACTIVE") activeCount++;
      if (verification.status === "CLOSED") closedCount++;
      if (verification.isSpam) spamCount++;
      if (verification.isStale) staleCount++;

      results.push({
        sourceJobId: job.sourceJobId ?? "",
        source: job.source,
        verification,
      });
    }

    return {
      results,
      activeCount,
      closedCount,
      spamCount,
      staleCount,
      totalProcessed: jobs.length,
    };
  }
}

/**
 * Singleton instance of JobVerificationEngine using the global registry.
 */
export const jobVerificationEngine = new JobVerificationEngine();
