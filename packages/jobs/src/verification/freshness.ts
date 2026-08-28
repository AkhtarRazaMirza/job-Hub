/**
 * Job Posting Freshness Validator
 * Grounded in:
 * - 01_build_the_system.md §4 Step 5
 * - 04_ai_agent_skills.md §7: "posting freshness"
 */

import type { CreateJobInput } from "../types";

export interface FreshnessCheckResult {
  isStale: boolean;
  freshnessDays: number | null;
  reasons: string[];
}

export function checkJobFreshness(
  job: CreateJobInput,
  options?: { maxStaleDays?: number; now?: Date }
): FreshnessCheckResult {
  const maxStaleDays = options?.maxStaleDays ?? 90;
  const now = options?.now ?? new Date();
  const reasons: string[] = [];

  if (!job.postedAt) {
    return {
      isStale: false,
      freshnessDays: null,
      reasons: ["Job posting date is undisclosed; freshness cannot be determined"],
    };
  }

  const postedTime = new Date(job.postedAt).getTime();
  const nowTime = now.getTime();

  // Allow up to 24 hours clock skew into the future
  if (postedTime > nowTime + 24 * 60 * 60 * 1000) {
    return {
      isStale: true,
      freshnessDays: -1,
      reasons: [`Job posting date is in the future: ${new Date(job.postedAt).toISOString()}`],
    };
  }

  const diffMs = Math.max(0, nowTime - postedTime);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > maxStaleDays) {
    reasons.push(
      `Job is stale: posted ${diffDays} days ago (exceeds threshold of ${maxStaleDays} days)`
    );
    return {
      isStale: true,
      freshnessDays: diffDays,
      reasons,
    };
  }

  return {
    isStale: false,
    freshnessDays: diffDays,
    reasons: [],
  };
}
