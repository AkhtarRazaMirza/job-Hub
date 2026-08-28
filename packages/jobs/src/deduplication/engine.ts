/**
 * Job Hub — Job Deduplication Engine
 * Grounded in:
 * - 01_build_the_system.md §4 Step 6
 * - 02_how_to_build.md §7
 * - 04_ai_agent_skills.md §8
 *
 * Deterministic two-tier deduplication:
 * 1. Exact checks: source + sourceJobId, canonicalUrl, applicationUrl
 * 2. Normalized compound key & deterministic text similarity
 */

import { type JobRepository, DrizzleJobRepository } from "../repository";
import type { CreateJobInput } from "../types";
import type {
  DeduplicationResult,
  DeduplicationOptions,
  DeduplicationMatch,
} from "./types";
import {
  normalizeEntityString,
  stringSimilarity,
  jaccardSimilarity,
} from "./text-similarity";

export class JobDeduplicationEngine {
  constructor(private readonly repository: JobRepository = new DrizzleJobRepository()) {}

  /**
   * Checks if a candidate job is a duplicate of any existing job in the system.
   */
  async findDuplicate(
    job: CreateJobInput,
    options?: DeduplicationOptions
  ): Promise<DeduplicationResult> {
    const titleThreshold = options?.titleSimilarityThreshold ?? 0.85;

    // 1. Exact Match: Source + SourceJobId
    if (job.sourceJobId) {
      const existingBySourceId = await this.repository.findBySourceAndSourceJobId(
        job.source,
        job.sourceJobId
      );

      if (existingBySourceId && existingBySourceId.id !== job.id) {
        return {
          isDuplicate: true,
          match: {
            canonicalJobId: existingBySourceId.id,
            matchType: "EXACT_SOURCE_ID",
            confidence: 1.0,
            reasons: [
              `Exact match on source "${job.source}" and sourceJobId "${job.sourceJobId}"`,
            ],
          },
        };
      }
    }

    // 2. Exact Match: Canonical URL
    if (job.canonicalUrl) {
      const existingByCanonicalUrl = await this.repository.findByCanonicalUrl(
        job.canonicalUrl
      );

      if (existingByCanonicalUrl && existingByCanonicalUrl.id !== job.id) {
        return {
          isDuplicate: true,
          match: {
            canonicalJobId: existingByCanonicalUrl.id,
            matchType: "EXACT_CANONICAL_URL",
            confidence: 1.0,
            reasons: [
              `Exact match on canonical URL: "${job.canonicalUrl}"`,
            ],
          },
        };
      }
    }

    // 3. Exact Match: Application URL
    if (job.applicationUrl) {
      const existingByAppUrl = await this.repository.findByApplicationUrl(
        job.applicationUrl
      );

      if (existingByAppUrl && existingByAppUrl.id !== job.id) {
        return {
          isDuplicate: true,
          match: {
            canonicalJobId: existingByAppUrl.id,
            matchType: "EXACT_APPLICATION_URL",
            confidence: 0.99,
            reasons: [
              `Exact match on application URL: "${job.applicationUrl}"`,
            ],
          },
        };
      }
    }

    // 4. Normalized Compound Key & Fuzzy Matching by Company
    if (options?.checkCompoundKey !== false && job.company) {
      const existingJobs = await this.repository.findByCompany(job.company);

      const normInputTitle = normalizeEntityString(job.title);
      const normInputLocation = normalizeEntityString(job.location);

      for (const existing of existingJobs) {
        if (existing.id === job.id) continue;

        const normExistingTitle = normalizeEntityString(existing.title);
        const normExistingLocation = normalizeEntityString(existing.location);

        // 4a. Exact compound key: company + normalized title + compatible location
        if (normInputTitle === normExistingTitle) {
          const locationsCompatible =
            !normInputLocation ||
            !normExistingLocation ||
            normInputLocation === normExistingLocation ||
            (job.remoteType === "WORLDWIDE_REMOTE" && existing.remoteType === "WORLDWIDE_REMOTE");

          if (locationsCompatible) {
            return {
              isDuplicate: true,
              match: {
                canonicalJobId: existing.id,
                matchType: "NORMALIZED_COMPOUND_KEY",
                confidence: 0.95,
                reasons: [
                  `Normalized compound key match: Company "${job.company}" and title "${job.title}" match existing job "${existing.title}"`,
                ],
              },
            };
          }
        }

        // 4b. Deterministic fuzzy similarity on title
        const jaccard = jaccardSimilarity(job.title, existing.title);
        const levenshtein = stringSimilarity(job.title, existing.title);
        const bestSimilarity = Math.max(jaccard, levenshtein);

        if (bestSimilarity >= titleThreshold) {
          return {
            isDuplicate: true,
            match: {
              canonicalJobId: existing.id,
              matchType: "TEXT_SIMILARITY",
              confidence: Math.round(bestSimilarity * 100) / 100,
              reasons: [
                `High deterministic title similarity (${(bestSimilarity * 100).toFixed(1)}%) for company "${job.company}": "${job.title}" vs "${existing.title}"`,
              ],
            },
          };
        }
      }
    }

    return {
      isDuplicate: false,
      match: null,
    };
  }
}

export const jobDeduplicationEngine = new JobDeduplicationEngine();
