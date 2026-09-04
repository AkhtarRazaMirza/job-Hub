/**
 * Job Hub — Phase 10 / Step 10.2
 * Deterministic Outcome Analysis
 *
 * Implements authoritative, candidate-isolated outcome analysis
 * by aggregating application milestones across roles, sources,
 * match-score bands, resume versions, and required skills.
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 10 ("Learning")
 * - 02_how_to_build.md §16 ("Learning engine")
 * - 04_ai_agent_skills.md §20 & §21
 *
 * Invariants Enforced:
 * 1. Read-Only: Pure aggregations, zero mutations to source-of-truth records.
 * 2. Deterministic Arithmetic: Safe division, never NaN or Infinity, zero LLM calls.
 * 3. Candidate Isolation: Every query strictly filtered by candidateProfileId.
 * 4. No Double Counting: Reuses canonical exists-backed milestone predicates.
 * 5. Small Sample Awareness: Explicitly tracks sample sizes and disclosures.
 */

import { eq, sql, and } from "drizzle-orm";
import {
  db,
  applications,
  jobs,
  type Database,
} from "@job-hub/db";
import {
  AnalyticsRepository,
  isAppliedSql,
  reachedInterviewSql,
  reachedOfferSql,
  reachedResponseSql,
  reachedRejectedSql,
} from "../analytics/repository";
import type { ScoreBand } from "../analytics/types";
import type { EvidenceMetric } from "./types";

/**
 * Parameter interface for building deterministic evidence metrics.
 */
export interface BuildEvidenceMetricParams {
  applications: number;
  interviews: number;
  offers: number;
  rejections?: number;
  responses?: number;
  averageMatchScore?: number | null;
}

/**
 * Pure deterministic evidence metric calculator.
 * Strictly avoids division-by-zero, returning null when denominator is 0.
 */
export function buildEvidenceMetric(params: BuildEvidenceMetricParams): EvidenceMetric {
  const {
    applications: appCount,
    interviews,
    offers,
    rejections = 0,
    responses = 0,
    averageMatchScore = null,
  } = params;

  if (appCount <= 0) {
    return {
      applications: 0,
      interviews: 0,
      offers: 0,
      rejections: 0,
      interviewRate: null,
      offerRate: null,
      responseRate: null,
      averageMatchScore: null,
      disclosureText: "0 of 0 (No data)",
    };
  }

  const interviewRate = interviews / appCount;
  const offerRate = offers / appCount;
  const responseRate = responses / appCount;
  const percentage = (interviewRate * 100).toFixed(1);

  return {
    applications: appCount,
    interviews,
    offers,
    rejections,
    interviewRate: Math.round(interviewRate * 1000) / 1000,
    offerRate: Math.round(offerRate * 1000) / 1000,
    responseRate: Math.round(responseRate * 1000) / 1000,
    averageMatchScore:
      averageMatchScore !== null && averageMatchScore !== undefined
        ? Math.round(averageMatchScore * 10) / 10
        : null,
    disclosureText: `${interviews} of ${appCount} applications (${percentage}%)`,
  };
}

/**
 * Multi-dimensional aggregated outcome cohorts for a candidate.
 */
export interface OutcomeCohortAnalysis {
  candidateProfileId: string;
  totalApplications: number;
  baseline: EvidenceMetric;
  roles: Array<{ role: string; metric: EvidenceMetric }>;
  sources: Array<{ source: string; metric: EvidenceMetric }>;
  scoreBands: Array<{ band: ScoreBand; metric: EvidenceMetric }>;
  resumeVersions: Array<{ version: string; metric: EvidenceMetric }>;
  skills: Array<{ skill: string; metric: EvidenceMetric }>;
}

/**
 * Deterministic Outcome Analyzer Service.
 */
export class OutcomeAnalyzer {
  constructor(
    private readonly database: Database = db,
    private readonly analyticsRepo: AnalyticsRepository = new AnalyticsRepository(database)
  ) {}

  /**
   * Aggregates all application outcomes for a single candidate profile.
   * Deterministic, reproducible, and read-only.
   */
  async analyzeCandidateOutcomes(candidateProfileId: string): Promise<OutcomeCohortAnalysis> {
    // 1. Raw Overview (Baseline)
    const rawOverview = await this.analyticsRepo.getOverviewRaw(candidateProfileId);

    const baseline = buildEvidenceMetric({
      applications: rawOverview.totalApplications,
      interviews: rawOverview.milestoneInterviews,
      offers: rawOverview.milestoneOffers,
      rejections: rawOverview.milestoneRejections,
      responses: rawOverview.milestoneResponses,
      averageMatchScore:
        rawOverview.scoredCount > 0
          ? rawOverview.totalScoreSum / rawOverview.scoredCount
          : null,
    });

    // 2. Roles
    const rawRoles = await this.analyticsRepo.getRolePerformanceRaw(candidateProfileId, {
      limit: 50,
    });
    const roles = rawRoles.map((r) => ({
      role: r.role,
      metric: buildEvidenceMetric({
        applications: r.totalApplications,
        interviews: r.interviewCount,
        offers: r.offerCount,
      }),
    }));

    // 3. Sources
    const rawSources = await this.analyticsRepo.getSourcePerformanceRaw(candidateProfileId);
    const sources = rawSources.map((s) => ({
      source: s.source,
      metric: buildEvidenceMetric({
        applications: s.totalApplications,
        interviews: s.interviewCount,
        offers: s.offerCount,
        rejections: s.rejectedCount,
        responses: s.responseCount,
      }),
    }));

    // 4. Score Bands
    const rawBands = await this.analyticsRepo.getScoreBandsRaw(candidateProfileId);
    const scoreBands = rawBands.map((b) => ({
      band: b.band,
      metric: buildEvidenceMetric({
        applications: b.totalApplications,
        interviews: b.interviewCount,
        offers: b.offerCount,
      }),
    }));

    // 5. Resume Versions
    const rawResumes = await this.analyticsRepo.getResumeVersionPerformanceRaw(candidateProfileId);
    const resumeVersions = rawResumes.map((rv) => ({
      version: rv.fileName || rv.resumeVersionId || "Default Resume",
      metric: buildEvidenceMetric({
        applications: rv.totalApplications,
        interviews: rv.interviewCount,
        offers: rv.offerCount,
        responses: rv.responseCount,
      }),
    }));

    // 6. Skills / Technologies frequency
    const skillRows = await this.database
      .select({
        skills: jobs.skills,
        isApplied: isAppliedSql,
        isInterview: reachedInterviewSql,
        isOffer: reachedOfferSql,
      })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(eq(applications.candidateProfileId, candidateProfileId));

    const skillMap = new Map<string, { applications: number; interviews: number; offers: number }>();

    for (const row of skillRows) {
      if (!row.skills || !Array.isArray(row.skills)) continue;
      for (const skill of row.skills) {
        const normalizedSkill = skill.trim();
        if (!normalizedSkill) continue;
        const current = skillMap.get(normalizedSkill) ?? {
          applications: 0,
          interviews: 0,
          offers: 0,
        };
        current.applications += 1;
        if (row.isInterview) current.interviews += 1;
        if (row.isOffer) current.offers += 1;
        skillMap.set(normalizedSkill, current);
      }
    }

    const skills = Array.from(skillMap.entries())
      .map(([skill, counts]) => ({
        skill,
        metric: buildEvidenceMetric(counts),
      }))
      .sort((a, b) => b.metric.applications - a.metric.applications);

    return {
      candidateProfileId,
      totalApplications: rawOverview.totalApplications,
      baseline,
      roles,
      sources,
      scoreBands,
      resumeVersions,
      skills,
    };
  }
}
