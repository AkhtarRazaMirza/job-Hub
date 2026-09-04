/**
 * Job Hub — Phase 9 / Step 9.1
 * Analytics Domain Types & Metric Definitions
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 9 ("Analytics")
 * - 02_how_to_build.md §15 ("Analytics") & §18 ("Build order #16")
 * - 03_tech_stack.md §4 ("PostgreSQL via Drizzle ORM")
 * - 04_ai_agent_skills.md §19 ("Analytics Skill")
 *
 * Core Invariants:
 * 1. Observation Layer: Read-only derived metrics; zero mutations to source-of-truth records.
 * 2. Truthful Metrics: Explicit numerators and denominators; no fabricated statistics.
 *    0 denominator returns null/unavailable, never NaN or misleading 0%.
 * 3. Non-Causal Framing: "Interview conversion by match-score band", not causal claims.
 * 4. No Double Counting: Distinct application records across joined events/documents.
 * 5. Candidate Tenant Isolation: All computations strictly scoped to candidateProfileId.
 */

import type { ApplicationStatus } from "../types";

/**
 * Deterministic Rate Structure.
 * Encapsulates numerator, denominator, floating rate, and human-readable formatting.
 */
export interface MetricRate {
  readonly numerator: number;
  readonly denominator: number;
  readonly rate: number | null; // null when denominator is 0
  readonly percentage: number | null; // null when denominator is 0, e.g. 25.0
  readonly formatted: string; // e.g. "25.0%" or "No data (0/0)"
}

/**
 * Average Match Score Metric Structure.
 * Explicitly distinguishes unscored applications from 0 score.
 */
export interface AverageMatchScoreMetric {
  readonly average: number | null; // null if 0 scored applications
  readonly scoredCount: number;
  readonly unscoredCount: number;
  readonly totalCount: number;
  readonly formatted: string; // e.g. "82.5 / 100" or "No scored applications"
}

/**
 * Comprehensive Application Overview Metrics.
 */
export interface ApplicationOverviewMetrics {
  // Volume Breakdown
  readonly totalApplications: number;
  readonly appliedCount: number;
  readonly preparedCount: number;
  readonly underReviewCount: number;
  readonly interviewScheduledCount: number;
  readonly interviewCompletedCount: number;
  readonly offerCount: number;
  readonly rejectedCount: number;
  readonly withdrawnCount: number;
  readonly activeCount: number; // In-flight (Applied, Under Review, Interview Scheduled/Completed)

  // Truthful Rates
  readonly responseRate: MetricRate;
  readonly interviewRate: MetricRate;
  readonly offerRate: MetricRate;
  readonly rejectionRate: MetricRate;

  // Match Score Summary
  readonly averageMatchScore: AverageMatchScoreMetric;
}

/**
 * Application Funnel Stage Metric.
 */
export interface FunnelStageMetric {
  readonly stage: ApplicationStatus;
  readonly label: string;
  readonly count: number;
  readonly percentageOfTotal: number | null;
  readonly percentageOfApplied: number | null;
}

/**
 * Full Application Funnel.
 */
export interface ApplicationFunnelMetrics {
  readonly totalApplications: number;
  readonly appliedCount: number;
  readonly stages: readonly FunnelStageMetric[];
  readonly terminalOutcomes: {
    readonly rejected: {
      readonly count: number;
      readonly percentageOfApplied: number | null;
    };
    readonly withdrawn: {
      readonly count: number;
      readonly percentageOfTotal: number | null;
    };
  };
}

export const SCORE_BANDS = [
  "85-100",
  "75-84",
  "60-74",
  "<60",
  "UNSCORED",
] as const;

export type ScoreBand = (typeof SCORE_BANDS)[number];

/**
 * Score Band Conversion Metric.
 * Truthful, non-causal presentation of conversion by match-score band.
 */
export interface ScoreBandConversionMetrics {
  readonly band: ScoreBand;
  readonly label: string;
  readonly minScore: number | null;
  readonly maxScore: number | null;
  readonly totalApplications: number;
  readonly appliedCount: number;
  readonly interviewCount: number;
  readonly offerCount: number;
  readonly interviewConversionRate: MetricRate;
  readonly offerConversionRate: MetricRate;
}

/**
 * Job Source Performance Metric.
 */
export interface SourcePerformanceMetrics {
  readonly source: string;
  readonly totalApplications: number;
  readonly appliedCount: number;
  readonly responseCount: number;
  readonly interviewCount: number;
  readonly offerCount: number;
  readonly rejectedCount: number;
  readonly responseRate: MetricRate;
  readonly interviewRate: MetricRate;
  readonly offerRate: MetricRate;
}

/**
 * Role Performance Metric.
 */
export interface RolePerformanceMetrics {
  readonly role: string;
  readonly totalApplications: number;
  readonly appliedCount: number;
  readonly interviewCount: number;
  readonly offerCount: number;
  readonly interviewRate: MetricRate;
  readonly offerRate: MetricRate;
}

/**
 * Resume Version Performance Metric.
 */
export interface ResumeVersionPerformanceMetrics {
  readonly resumeVersionId: string | null;
  readonly versionName: string;
  readonly targetRole: string | null;
  readonly totalApplications: number;
  readonly appliedCount: number;
  readonly responseCount: number;
  readonly interviewCount: number;
  readonly offerCount: number;
  readonly responseRate: MetricRate;
  readonly interviewRate: MetricRate;
  readonly offerRate: MetricRate;
}

export const TREND_GRANULARITIES = ["day", "week", "month"] as const;
export type TrendGranularity = (typeof TREND_GRANULARITIES)[number];

/**
 * Time Series Trend Data Point.
 */
export interface TrendDataPoint {
  readonly period: string; // ISO date string: YYYY-MM-DD for day/week, YYYY-MM for month
  readonly dateLabel: string;
  readonly totalApplications: number;
  readonly appliedCount: number;
  readonly interviewCount: number;
  readonly offerCount: number;
  readonly rejectedCount: number;
}

/**
 * Application Trends Output.
 */
export interface ApplicationTrendsMetrics {
  readonly granularity: TrendGranularity;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly dataPoints: readonly TrendDataPoint[];
  readonly totalApplicationsInPeriod: number;
}
