/**
 * Job Hub — Job Normalization Engine
 * Grounded in:
 * - 01_build_the_system.md §4 Step 4
 * - 02_how_to_build.md §6
 * - 04_ai_agent_skills.md §5 & §6
 *
 * Centralized service that converts any discovered raw job payload into the
 * canonical internal Job schema via registered source adapters with deterministic validation.
 */

import { jobSourceRegistry, JobSourceRegistry } from "../source/registry";
import type { DiscoveredRawJob } from "../source/types";
import type { CreateJobInput } from "../types";
import { createJobInputSchema } from "../validation";
import { JobValidationError } from "../errors";
import { cleanCanonicalUrl } from "./url-cleaner";
import type {
  NormalizeJobOptions,
  NormalizeBatchResult,
  NormalizedJobResult,
  NormalizeBatchItemError,
} from "./types";

export class JobNormalizationEngine {
  constructor(private readonly registry: JobSourceRegistry = jobSourceRegistry) {}

  /**
   * Normalizes a single raw job into the canonical CreateJobInput.
   * Throws JobSourceAdapterNotFoundError if the source is unregistered.
   * Throws JobValidationError if the normalized data fails schema constraints.
   */
  async normalize(
    raw: DiscoveredRawJob,
    options?: NormalizeJobOptions
  ): Promise<CreateJobInput> {
    if (!raw || typeof raw !== "object") {
      throw new JobValidationError("Discovered job payload must be a non-null object.");
    }

    if (!raw.source) {
      throw new JobValidationError("Discovered job payload is missing required 'source'.");
    }

    if (!raw.sourceJobId) {
      throw new JobValidationError("Discovered job payload is missing required 'sourceJobId'.");
    }

    // 1. Resolve source adapter from registry
    const adapter = this.registry.require(raw.source);

    // 2. Execute adapter normalization
    const initialJob = await adapter.normalize(raw);

    // 3. Post-process canonical and application URLs
    let cleanedCanonicalUrl = initialJob.canonicalUrl;
    if (options?.stripTrackingParams !== false && initialJob.canonicalUrl) {
      cleanedCanonicalUrl = cleanCanonicalUrl(initialJob.canonicalUrl) ?? initialJob.canonicalUrl;
    }

    let cleanedApplicationUrl = initialJob.applicationUrl;
    if (options?.stripTrackingParams !== false && initialJob.applicationUrl) {
      const sanitizedAppUrl = cleanCanonicalUrl(initialJob.applicationUrl);
      if (sanitizedAppUrl) {
        cleanedApplicationUrl = sanitizedAppUrl;
      }
    }

    // 4. Sanitize and deduplicate skills
    const cleanedSkills = Array.isArray(initialJob.skills)
      ? Array.from(
          new Set(
            initialJob.skills
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
          )
        )
      : [];

    // 5. Salary range sanity checks
    let salaryMin = initialJob.salaryMin ?? null;
    let salaryMax = initialJob.salaryMax ?? null;
    if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
      // Correct inverted min/max from upstream provider
      const temp = salaryMin;
      salaryMin = salaryMax;
      salaryMax = temp;
    }

    const candidateJobInput: CreateJobInput = {
      ...initialJob,
      title: initialJob.title.trim(),
      company: initialJob.company.trim(),
      location: initialJob.location ? initialJob.location.trim() : null,
      canonicalUrl: cleanedCanonicalUrl,
      applicationUrl: cleanedApplicationUrl,
      skills: cleanedSkills,
      salaryMin,
      salaryMax,
      salary: initialJob.salary ?? salaryMin ?? null,
    };

    // 6. Strict canonical Zod validation
    const parsed = createJobInputSchema.safeParse(candidateJobInput);
    if (!parsed.success) {
      const issueMsgs = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new JobValidationError(
        `Failed canonical schema validation for job ${raw.source}:${raw.sourceJobId}: ${issueMsgs}`
      );
    }

    return parsed.data;
  }

  /**
   * Normalizes a batch of discovered jobs with item-level error isolation.
   */
  async normalizeBatch(
    rawJobs: DiscoveredRawJob[],
    options?: NormalizeJobOptions
  ): Promise<NormalizeBatchResult> {
    const successful: NormalizedJobResult[] = [];
    const failed: NormalizeBatchItemError[] = [];

    for (const raw of rawJobs) {
      try {
        const job = await this.normalize(raw, options);
        successful.push({
          job,
          source: raw.source,
          sourceJobId: raw.sourceJobId,
          rawUrl: raw.url,
          normalizedAt: new Date(),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const code = err && typeof err === "object" && "code" in err ? String(err.code) : undefined;
        failed.push({
          source: raw.source || "unknown",
          sourceJobId: raw.sourceJobId || "unknown",
          error: message,
          code,
        });
      }
    }

    return {
      successful,
      failed,
      totalProcessed: rawJobs.length,
    };
  }
}

/**
 * Singleton instance of JobNormalizationEngine using the global jobSourceRegistry.
 */
export const jobNormalizationEngine = new JobNormalizationEngine();
