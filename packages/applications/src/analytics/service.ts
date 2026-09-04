/**
 * Job Hub — Phase 9 / Step 9.3
 * Typed Analytics Domain Service & Metric Calculators
 *
 * Implements truthful metric computation, safe mathematical division (preventing NaN / division by zero),
 * non-causal score band conversions, and candidate-isolated domain aggregations.
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 9 ("Analytics")
 * - 02_how_to_build.md §15 ("Analytics")
 * - 03_tech_stack.md §4 ("PostgreSQL via Drizzle ORM")
 * - 04_ai_agent_skills.md §19 ("Analytics Skill")
 *
 * Core Invariants:
 * 1. Observation Layer: Strictly read-only; no profile, job, application, or resume mutations.
 * 2. Truthful Denominators: 0 denominator returns null and "No data", never fake 0% or NaN.
 * 3. Non-Causal Framing: Score bands evaluate "Interview conversion by match-score band".
 * 4. No Double Counting: Distinct application instances preserved across aggregations.
 */

import {
  analyticsRepository,
  type AnalyticsRepository,
} from "./repository";
import type {
  MetricRate,
  AverageMatchScoreMetric,
  ApplicationOverviewMetrics,
  ApplicationFunnelMetrics,
  FunnelStageMetric,
  ScoreBand,
  ScoreBandConversionMetrics,
  SourcePerformanceMetrics,
  RolePerformanceMetrics,
  ResumeVersionPerformanceMetrics,
  ApplicationTrendsMetrics,
  TrendDataPoint,
} from "./types";
import { SCORE_BANDS } from "./types";
import type {
  AnalyticsFilterInput,
  AnalyticsTrendsFilterInput,
  RolePerformanceFilterInput,
} from "./validation";
import { APPLICATION_STATUS_LABELS } from "../types";

/**
 * Deterministic rate calculator.
 * Strictly avoids division-by-zero, returning null when denominator is 0.
 */
export function calculateRate(
  numerator: number,
  denominator: number
): MetricRate {
  if (denominator <= 0) {
    return {
      numerator,
      denominator,
      rate: null,
      percentage: null,
      formatted: `No data (${numerator}/${denominator})`,
    };
  }

  const rate = numerator / denominator;
  const percentage = Math.round(rate * 1000) / 10; // 1 decimal place

  return {
    numerator,
    denominator,
    rate,
    percentage,
    formatted: `${percentage.toFixed(1)}% (${numerator}/${denominator})`,
  };
}

/**
 * Deterministic average match score calculator.
 * Distinctly treats unscored applications vs 0 scores.
 */
export function calculateAverageScore(
  scoredCount: number,
  totalScoreSum: number,
  totalCount: number
): AverageMatchScoreMetric {
  if (scoredCount <= 0) {
    return {
      average: null,
      scoredCount: 0,
      unscoredCount: totalCount,
      totalCount,
      formatted: "No scored applications",
    };
  }

  const average = Math.round((totalScoreSum / scoredCount) * 10) / 10;

  return {
    average,
    scoredCount,
    unscoredCount: Math.max(0, totalCount - scoredCount),
    totalCount,
    formatted: `${average.toFixed(1)} / 100 (${scoredCount} scored)`,
  };
}

export class AnalyticsService {
  constructor(
    private readonly repository: AnalyticsRepository = analyticsRepository
  ) {}

  /**
   * Candidate Overview Metrics.
   */
  async getOverview(
    candidateProfileId: string,
    filter?: AnalyticsFilterInput
  ): Promise<ApplicationOverviewMetrics> {
    const raw = await this.repository.getOverviewRaw(candidateProfileId, filter);

    const appliedDenominator = raw.appliedCount;
    const responseRate = calculateRate(raw.milestoneResponses, appliedDenominator);
    const interviewRate = calculateRate(raw.milestoneInterviews, appliedDenominator);
    const offerRate = calculateRate(raw.milestoneOffers, appliedDenominator);
    const rejectionRate = calculateRate(raw.milestoneRejections, appliedDenominator);

    const averageMatchScore = calculateAverageScore(
      raw.scoredCount,
      raw.totalScoreSum,
      raw.totalApplications
    );

    // Active in-flight applications (Applied, Under Review, Interviewing)
    const completedOrTerminal = raw.offerCount + raw.rejectedCount + raw.withdrawnCount;
    const activeCount = Math.max(0, raw.totalApplications - (raw.preparedCount + completedOrTerminal));

    return {
      totalApplications: raw.totalApplications,
      appliedCount: raw.appliedCount,
      preparedCount: raw.preparedCount,
      underReviewCount: raw.underReviewCount,
      interviewScheduledCount: raw.interviewScheduledCount,
      interviewCompletedCount: raw.interviewCompletedCount,
      offerCount: raw.offerCount,
      rejectedCount: raw.rejectedCount,
      withdrawnCount: raw.withdrawnCount,
      activeCount,

      responseRate,
      interviewRate,
      offerRate,
      rejectionRate,
      averageMatchScore,
    };
  }

  /**
   * Application Funnel Metrics.
   */
  async getFunnel(
    candidateProfileId: string,
    filter?: AnalyticsFilterInput
  ): Promise<ApplicationFunnelMetrics> {
    const raw = await this.repository.getFunnelRaw(candidateProfileId, filter);
    const total = raw.totalApplications;
    const applied = raw.appliedCount;

    const calcPct = (cnt: number, denom: number) =>
      denom > 0 ? Math.round((cnt / denom) * 1000) / 10 : null;

    const stages: FunnelStageMetric[] = [
      {
        stage: "PREPARED",
        label: APPLICATION_STATUS_LABELS.PREPARED,
        count: raw.preparedCount,
        percentageOfTotal: calcPct(raw.preparedCount, total),
        percentageOfApplied: null,
      },
      {
        stage: "APPLIED",
        label: APPLICATION_STATUS_LABELS.APPLIED,
        count: raw.appliedCount,
        percentageOfTotal: calcPct(raw.appliedCount, total),
        percentageOfApplied: 100.0,
      },
      {
        stage: "UNDER_REVIEW",
        label: APPLICATION_STATUS_LABELS.UNDER_REVIEW,
        count: raw.underReviewCount,
        percentageOfTotal: calcPct(raw.underReviewCount, total),
        percentageOfApplied: calcPct(raw.underReviewCount, applied),
      },
      {
        stage: "INTERVIEW_SCHEDULED",
        label: APPLICATION_STATUS_LABELS.INTERVIEW_SCHEDULED,
        count: raw.interviewScheduledCount,
        percentageOfTotal: calcPct(raw.interviewScheduledCount, total),
        percentageOfApplied: calcPct(raw.interviewScheduledCount, applied),
      },
      {
        stage: "INTERVIEW_COMPLETED",
        label: APPLICATION_STATUS_LABELS.INTERVIEW_COMPLETED,
        count: raw.interviewCompletedCount,
        percentageOfTotal: calcPct(raw.interviewCompletedCount, total),
        percentageOfApplied: calcPct(raw.interviewCompletedCount, applied),
      },
      {
        stage: "OFFER",
        label: APPLICATION_STATUS_LABELS.OFFER,
        count: raw.offerCount,
        percentageOfTotal: calcPct(raw.offerCount, total),
        percentageOfApplied: calcPct(raw.offerCount, applied),
      },
    ];

    return {
      totalApplications: total,
      appliedCount: applied,
      stages,
      terminalOutcomes: {
        rejected: {
          count: raw.rejectedCount,
          percentageOfApplied: calcPct(raw.rejectedCount, applied),
        },
        withdrawn: {
          count: raw.withdrawnCount,
          percentageOfTotal: calcPct(raw.withdrawnCount, total),
        },
      },
    };
  }

  /**
   * Score Band Conversion Metrics.
   * Ensures all standard score bands are represented truthfully.
   */
  async getScoreBandConversion(
    candidateProfileId: string,
    filter?: AnalyticsFilterInput
  ): Promise<ScoreBandConversionMetrics[]> {
    const rawBands = await this.repository.getScoreBandsRaw(candidateProfileId, filter);
    const bandMap = new Map(rawBands.map((b) => [b.band, b]));

    const bandDefinitions: Record<
      ScoreBand,
      { label: string; minScore: number | null; maxScore: number | null }
    > = {
      "85-100": { label: "Excellent Match (85-100)", minScore: 85, maxScore: 100 },
      "75-84": { label: "Strong Match (75-84)", minScore: 75, maxScore: 84.99 },
      "60-74": { label: "Moderate Match (60-74)", minScore: 60, maxScore: 74.99 },
      "<60": { label: "Low Match (<60)", minScore: 0, maxScore: 59.99 },
      UNSCORED: { label: "Unscored Applications", minScore: null, maxScore: null },
    };

    return SCORE_BANDS.map((band) => {
      const entry = bandMap.get(band);
      const def = bandDefinitions[band];
      const totalApplications = entry?.totalApplications ?? 0;
      const appliedCount = entry?.appliedCount ?? 0;
      const interviewCount = entry?.interviewCount ?? 0;
      const offerCount = entry?.offerCount ?? 0;

      return {
        band,
        label: def.label,
        minScore: def.minScore,
        maxScore: def.maxScore,
        totalApplications,
        appliedCount,
        interviewCount,
        offerCount,
        interviewConversionRate: calculateRate(interviewCount, appliedCount),
        offerConversionRate: calculateRate(offerCount, appliedCount),
      };
    });
  }

  /**
   * Job Source Performance.
   */
  async getSourcePerformance(
    candidateProfileId: string,
    filter?: AnalyticsFilterInput
  ): Promise<SourcePerformanceMetrics[]> {
    const raw = await this.repository.getSourcePerformanceRaw(candidateProfileId, filter);

    return raw.map((item) => ({
      source: item.source,
      totalApplications: item.totalApplications,
      appliedCount: item.appliedCount,
      responseCount: item.responseCount,
      interviewCount: item.interviewCount,
      offerCount: item.offerCount,
      rejectedCount: item.rejectedCount,
      responseRate: calculateRate(item.responseCount, item.appliedCount),
      interviewRate: calculateRate(item.interviewCount, item.appliedCount),
      offerRate: calculateRate(item.offerCount, item.appliedCount),
    }));
  }

  /**
   * Role Performance.
   */
  async getRolePerformance(
    candidateProfileId: string,
    filter?: RolePerformanceFilterInput
  ): Promise<RolePerformanceMetrics[]> {
    const raw = await this.repository.getRolePerformanceRaw(candidateProfileId, filter);

    return raw.map((item) => ({
      role: item.role,
      totalApplications: item.totalApplications,
      appliedCount: item.appliedCount,
      interviewCount: item.interviewCount,
      offerCount: item.offerCount,
      interviewRate: calculateRate(item.interviewCount, item.appliedCount),
      offerRate: calculateRate(item.offerCount, item.appliedCount),
    }));
  }

  /**
   * Resume Version Performance.
   */
  async getResumeVersionPerformance(
    candidateProfileId: string,
    filter?: AnalyticsFilterInput
  ): Promise<ResumeVersionPerformanceMetrics[]> {
    const raw = await this.repository.getResumeVersionPerformanceRaw(candidateProfileId, filter);

    return raw.map((item) => {
      const versionName = item.fileName ? item.fileName : "Default Resume";

      return {
        resumeVersionId: item.resumeVersionId,
        versionName,
        targetRole: null,
        totalApplications: item.totalApplications,
        appliedCount: item.appliedCount,
        responseCount: item.responseCount,
        interviewCount: item.interviewCount,
        offerCount: item.offerCount,
        responseRate: calculateRate(item.responseCount, item.appliedCount),
        interviewRate: calculateRate(item.interviewCount, item.appliedCount),
        offerRate: calculateRate(item.offerCount, item.appliedCount),
      };
    });
  }

  /**
   * Time Trends.
   */
  async getTrends(
    candidateProfileId: string,
    filter?: AnalyticsTrendsFilterInput
  ): Promise<ApplicationTrendsMetrics> {
    const raw = await this.repository.getTrendsRaw(candidateProfileId, filter);
    const granularity = filter?.granularity ?? "week";

    let totalApplicationsInPeriod = 0;
    const dataPoints: TrendDataPoint[] = raw.map((row) => {
      totalApplicationsInPeriod += row.totalApplications;
      return {
        period: row.period,
        dateLabel: row.period,
        totalApplications: row.totalApplications,
        appliedCount: row.appliedCount,
        interviewCount: row.interviewCount,
        offerCount: row.offerCount,
        rejectedCount: row.rejectedCount,
      };
    });

    return {
      granularity,
      startDate: filter?.startDate ?? null,
      endDate: filter?.endDate ?? null,
      dataPoints,
      totalApplicationsInPeriod,
    };
  }
}

export const analyticsService = new AnalyticsService();
