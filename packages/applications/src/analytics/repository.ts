/**
 * Job Hub — Phase 9 / Step 9.2
 * Candidate-Isolated SQL Analytics Repository
 *
 * Implements authoritative, candidate-isolated SQL analytics aggregations
 * directly via PostgreSQL and Drizzle ORM.
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 9 ("Analytics")
 * - 02_how_to_build.md §15 ("Analytics")
 * - 03_tech_stack.md §4 ("PostgreSQL via Drizzle ORM")
 * - 04_ai_agent_skills.md §19 ("Analytics Skill")
 *
 * Invariants Enforced:
 * 1. Read-Only: Pure aggregations, zero mutations to source-of-truth records.
 * 2. Candidate Tenant Isolation: Every query strictly filtered by candidateProfileId.
 * 3. No Double Counting: Conditional aggregation and EXISTS subqueries prevent join multiplication.
 * 4. Truthful Metrics: Persisted statuses, dates, and match scores.
 */

import {
  eq,
  and,
  gte,
  lte,
  sql,
  desc,
  asc,
} from "drizzle-orm";
import {
  db,
  applications,
  applicationEvents,
  resumes,
  type Database,
} from "@job-hub/db";
import type {
  AnalyticsFilterInput,
  AnalyticsTrendsFilterInput,
  RolePerformanceFilterInput,
} from "./validation";
import type { ScoreBand, TrendGranularity } from "./types";

/**
 * SQL predicates identifying application outcome milestones.
 * Uses EXISTS subqueries against applicationEvents to verify milestone
 * reached without row multiplication or join duplicates.
 */
export const isAppliedSql = sql<boolean>`(
  ${applications.status} IN ('APPLIED', 'UNDER_REVIEW', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'OFFER', 'REJECTED')
  OR ${applications.submittedAt} IS NOT NULL
  OR EXISTS (
    SELECT 1 FROM ${applicationEvents}
    WHERE ${applicationEvents.applicationId} = ${applications.id}
      AND ${applicationEvents.toStatus} = 'APPLIED'
  )
)`;

export const reachedResponseSql = sql<boolean>`(
  ${applications.status} IN ('UNDER_REVIEW', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'OFFER', 'REJECTED')
  OR EXISTS (
    SELECT 1 FROM ${applicationEvents}
    WHERE ${applicationEvents.applicationId} = ${applications.id}
      AND ${applicationEvents.toStatus} IN ('UNDER_REVIEW', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'OFFER', 'REJECTED')
  )
)`;

export const reachedInterviewSql = sql<boolean>`(
  ${applications.status} IN ('INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'OFFER')
  OR EXISTS (
    SELECT 1 FROM ${applicationEvents}
    WHERE ${applicationEvents.applicationId} = ${applications.id}
      AND ${applicationEvents.toStatus} IN ('INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'OFFER')
  )
)`;

export const reachedOfferSql = sql<boolean>`(
  ${applications.status} = 'OFFER'
  OR EXISTS (
    SELECT 1 FROM ${applicationEvents}
    WHERE ${applicationEvents.applicationId} = ${applications.id}
      AND ${applicationEvents.toStatus} = 'OFFER'
  )
)`;

export const reachedRejectedSql = sql<boolean>`(
  ${applications.status} = 'REJECTED'
  OR EXISTS (
    SELECT 1 FROM ${applicationEvents}
    WHERE ${applicationEvents.applicationId} = ${applications.id}
      AND ${applicationEvents.toStatus} = 'REJECTED'
  )
)`;

/**
 * Helper to build safe WHERE conditions strictly scoped to candidateProfileId.
 */
function buildAnalyticsConditions(
  candidateProfileId: string,
  filter?: AnalyticsFilterInput
) {
  const conditions = [eq(applications.candidateProfileId, candidateProfileId)];

  if (filter?.startDate) {
    conditions.push(gte(applications.createdAt, new Date(filter.startDate)));
  }
  if (filter?.endDate) {
    conditions.push(lte(applications.createdAt, new Date(filter.endDate)));
  }
  if (filter?.source) {
    conditions.push(eq(applications.source, filter.source));
  }
  if (filter?.status) {
    conditions.push(eq(applications.status, filter.status));
  }

  return and(...conditions);
}

export class AnalyticsRepository {
  constructor(private readonly database: Database = db) {}

  /**
   * Raw aggregate query for Candidate Overview.
   * Single aggregated query without join multiplication.
   */
  async getOverviewRaw(
    candidateProfileId: string,
    filter?: AnalyticsFilterInput
  ) {
    const whereClause = buildAnalyticsConditions(candidateProfileId, filter);

    const [row] = await this.database
      .select({
        totalApplications: sql<number>`COUNT(${applications.id})::int`,
        preparedCount: sql<number>`COALESCE(SUM(CASE WHEN ${applications.status} = 'PREPARED' THEN 1 ELSE 0 END), 0)::int`,
        appliedCount: sql<number>`COALESCE(SUM(CASE WHEN ${isAppliedSql} THEN 1 ELSE 0 END), 0)::int`,
        underReviewCount: sql<number>`COALESCE(SUM(CASE WHEN ${applications.status} = 'UNDER_REVIEW' THEN 1 ELSE 0 END), 0)::int`,
        interviewScheduledCount: sql<number>`COALESCE(SUM(CASE WHEN ${applications.status} = 'INTERVIEW_SCHEDULED' THEN 1 ELSE 0 END), 0)::int`,
        interviewCompletedCount: sql<number>`COALESCE(SUM(CASE WHEN ${applications.status} = 'INTERVIEW_COMPLETED' THEN 1 ELSE 0 END), 0)::int`,
        offerCount: sql<number>`COALESCE(SUM(CASE WHEN ${applications.status} = 'OFFER' THEN 1 ELSE 0 END), 0)::int`,
        rejectedCount: sql<number>`COALESCE(SUM(CASE WHEN ${applications.status} = 'REJECTED' THEN 1 ELSE 0 END), 0)::int`,
        withdrawnCount: sql<number>`COALESCE(SUM(CASE WHEN ${applications.status} = 'WITHDRAWN' THEN 1 ELSE 0 END), 0)::int`,

        // Outcome Milestones (using EXISTS for distinct application accounting)
        milestoneResponses: sql<number>`COALESCE(SUM(CASE WHEN ${reachedResponseSql} THEN 1 ELSE 0 END), 0)::int`,
        milestoneInterviews: sql<number>`COALESCE(SUM(CASE WHEN ${reachedInterviewSql} THEN 1 ELSE 0 END), 0)::int`,
        milestoneOffers: sql<number>`COALESCE(SUM(CASE WHEN ${reachedOfferSql} THEN 1 ELSE 0 END), 0)::int`,
        milestoneRejections: sql<number>`COALESCE(SUM(CASE WHEN ${reachedRejectedSql} THEN 1 ELSE 0 END), 0)::int`,

        // Match Scores
        scoredCount: sql<number>`COALESCE(SUM(CASE WHEN ${applications.matchScore} IS NOT NULL THEN 1 ELSE 0 END), 0)::int`,
        totalScoreSum: sql<number>`COALESCE(SUM(CASE WHEN ${applications.matchScore} IS NOT NULL THEN CAST(${applications.matchScore} AS NUMERIC) ELSE 0 END), 0)::float`,
      })
      .from(applications)
      .where(whereClause);

    return (
      row ?? {
        totalApplications: 0,
        preparedCount: 0,
        appliedCount: 0,
        underReviewCount: 0,
        interviewScheduledCount: 0,
        interviewCompletedCount: 0,
        offerCount: 0,
        rejectedCount: 0,
        withdrawnCount: 0,
        milestoneResponses: 0,
        milestoneInterviews: 0,
        milestoneOffers: 0,
        milestoneRejections: 0,
        scoredCount: 0,
        totalScoreSum: 0,
      }
    );
  }

  /**
   * Application Funnel Status breakdown.
   */
  async getFunnelRaw(
    candidateProfileId: string,
    filter?: AnalyticsFilterInput
  ) {
    const whereClause = buildAnalyticsConditions(candidateProfileId, filter);

    const [row] = await this.database
      .select({
        totalApplications: sql<number>`COUNT(${applications.id})::int`,
        preparedCount: sql<number>`COALESCE(SUM(CASE WHEN ${applications.status} = 'PREPARED' THEN 1 ELSE 0 END), 0)::int`,
        appliedCount: sql<number>`COALESCE(SUM(CASE WHEN ${isAppliedSql} THEN 1 ELSE 0 END), 0)::int`,
        underReviewCount: sql<number>`COALESCE(SUM(CASE WHEN ${applications.status} = 'UNDER_REVIEW' THEN 1 ELSE 0 END), 0)::int`,
        interviewScheduledCount: sql<number>`COALESCE(SUM(CASE WHEN ${applications.status} = 'INTERVIEW_SCHEDULED' THEN 1 ELSE 0 END), 0)::int`,
        interviewCompletedCount: sql<number>`COALESCE(SUM(CASE WHEN ${applications.status} = 'INTERVIEW_COMPLETED' THEN 1 ELSE 0 END), 0)::int`,
        offerCount: sql<number>`COALESCE(SUM(CASE WHEN ${applications.status} = 'OFFER' THEN 1 ELSE 0 END), 0)::int`,
        rejectedCount: sql<number>`COALESCE(SUM(CASE WHEN ${applications.status} = 'REJECTED' THEN 1 ELSE 0 END), 0)::int`,
        withdrawnCount: sql<number>`COALESCE(SUM(CASE WHEN ${applications.status} = 'WITHDRAWN' THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(applications)
      .where(whereClause);

    return (
      row ?? {
        totalApplications: 0,
        preparedCount: 0,
        appliedCount: 0,
        underReviewCount: 0,
        interviewScheduledCount: 0,
        interviewCompletedCount: 0,
        offerCount: 0,
        rejectedCount: 0,
        withdrawnCount: 0,
      }
    );
  }

  /**
   * Score Bands Conversion Breakdown.
   * Groups applications strictly into defined score bands.
   */
  async getScoreBandsRaw(
    candidateProfileId: string,
    filter?: AnalyticsFilterInput
  ): Promise<
    Array<{
      band: ScoreBand;
      totalApplications: number;
      appliedCount: number;
      interviewCount: number;
      offerCount: number;
    }>
  > {
    const whereClause = buildAnalyticsConditions(candidateProfileId, filter);

    const scoreBandSql = sql<ScoreBand>`
      CASE
        WHEN ${applications.matchScore} IS NULL THEN 'UNSCORED'
        WHEN CAST(${applications.matchScore} AS NUMERIC) >= 85 THEN '85-100'
        WHEN CAST(${applications.matchScore} AS NUMERIC) >= 75 THEN '75-84'
        WHEN CAST(${applications.matchScore} AS NUMERIC) >= 60 THEN '60-74'
        ELSE '<60'
      END
    `;

    const rows = await this.database
      .select({
        band: scoreBandSql,
        totalApplications: sql<number>`COUNT(${applications.id})::int`,
        appliedCount: sql<number>`COALESCE(SUM(CASE WHEN ${isAppliedSql} THEN 1 ELSE 0 END), 0)::int`,
        interviewCount: sql<number>`COALESCE(SUM(CASE WHEN ${reachedInterviewSql} THEN 1 ELSE 0 END), 0)::int`,
        offerCount: sql<number>`COALESCE(SUM(CASE WHEN ${reachedOfferSql} THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(applications)
      .where(whereClause)
      .groupBy(scoreBandSql);

    return rows;
  }

  /**
   * Job Source Performance Breakdown.
   * Aggregated strictly by applications.source.
   */
  async getSourcePerformanceRaw(
    candidateProfileId: string,
    filter?: AnalyticsFilterInput
  ) {
    const whereClause = buildAnalyticsConditions(candidateProfileId, filter);

    const rows = await this.database
      .select({
        source: applications.source,
        totalApplications: sql<number>`COUNT(${applications.id})::int`,
        appliedCount: sql<number>`COALESCE(SUM(CASE WHEN ${isAppliedSql} THEN 1 ELSE 0 END), 0)::int`,
        responseCount: sql<number>`COALESCE(SUM(CASE WHEN ${reachedResponseSql} THEN 1 ELSE 0 END), 0)::int`,
        interviewCount: sql<number>`COALESCE(SUM(CASE WHEN ${reachedInterviewSql} THEN 1 ELSE 0 END), 0)::int`,
        offerCount: sql<number>`COALESCE(SUM(CASE WHEN ${reachedOfferSql} THEN 1 ELSE 0 END), 0)::int`,
        rejectedCount: sql<number>`COALESCE(SUM(CASE WHEN ${reachedRejectedSql} THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(applications)
      .where(whereClause)
      .groupBy(applications.source)
      .orderBy(desc(sql`COUNT(${applications.id})`));

    return rows;
  }

  /**
   * Role Performance Breakdown.
   * Aggregated strictly by applications.role.
   */
  async getRolePerformanceRaw(
    candidateProfileId: string,
    filter?: RolePerformanceFilterInput
  ) {
    const limit = filter?.limit ?? 20;
    const whereClause = buildAnalyticsConditions(candidateProfileId, filter);

    const rows = await this.database
      .select({
        role: applications.role,
        totalApplications: sql<number>`COUNT(${applications.id})::int`,
        appliedCount: sql<number>`COALESCE(SUM(CASE WHEN ${isAppliedSql} THEN 1 ELSE 0 END), 0)::int`,
        interviewCount: sql<number>`COALESCE(SUM(CASE WHEN ${reachedInterviewSql} THEN 1 ELSE 0 END), 0)::int`,
        offerCount: sql<number>`COALESCE(SUM(CASE WHEN ${reachedOfferSql} THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(applications)
      .where(whereClause)
      .groupBy(applications.role)
      .orderBy(desc(sql`COUNT(${applications.id})`))
      .limit(limit);

    return rows;
  }

  /**
   * Resume Version Performance Breakdown.
   * Left joined with resumes table to provide human-readable version details.
   */
  async getResumeVersionPerformanceRaw(
    candidateProfileId: string,
    filter?: AnalyticsFilterInput
  ) {
    const whereClause = buildAnalyticsConditions(candidateProfileId, filter);

    const rows = await this.database
      .select({
        resumeVersionId: applications.resumeVersionId,
        fileName: resumes.fileName,
        totalApplications: sql<number>`COUNT(${applications.id})::int`,
        appliedCount: sql<number>`COALESCE(SUM(CASE WHEN ${isAppliedSql} THEN 1 ELSE 0 END), 0)::int`,
        responseCount: sql<number>`COALESCE(SUM(CASE WHEN ${reachedResponseSql} THEN 1 ELSE 0 END), 0)::int`,
        interviewCount: sql<number>`COALESCE(SUM(CASE WHEN ${reachedInterviewSql} THEN 1 ELSE 0 END), 0)::int`,
        offerCount: sql<number>`COALESCE(SUM(CASE WHEN ${reachedOfferSql} THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(applications)
      .leftJoin(resumes, eq(applications.resumeVersionId, resumes.id))
      .where(whereClause)
      .groupBy(
        applications.resumeVersionId,
        resumes.fileName
      )
      .orderBy(desc(sql`COUNT(${applications.id})`));

    return rows;
  }

  /**
   * Time Trends Breakdown.
   * Buckets applications by day, week, or month using PostgreSQL date_trunc.
   */
  async getTrendsRaw(
    candidateProfileId: string,
    filter?: AnalyticsTrendsFilterInput
  ) {
    const granularity: TrendGranularity = filter?.granularity ?? "week";
    const whereClause = buildAnalyticsConditions(candidateProfileId, filter);

    // Deterministic PostgreSQL date_trunc formatting
    const periodSql =
      granularity === "month"
        ? sql<string>`TO_CHAR(date_trunc('month', ${applications.createdAt}), 'YYYY-MM')`
        : granularity === "week"
        ? sql<string>`TO_CHAR(date_trunc('week', ${applications.createdAt}), 'YYYY-MM-DD')`
        : sql<string>`TO_CHAR(date_trunc('day', ${applications.createdAt}), 'YYYY-MM-DD')`;

    const rows = await this.database
      .select({
        period: periodSql,
        totalApplications: sql<number>`COUNT(${applications.id})::int`,
        appliedCount: sql<number>`COALESCE(SUM(CASE WHEN ${isAppliedSql} THEN 1 ELSE 0 END), 0)::int`,
        interviewCount: sql<number>`COALESCE(SUM(CASE WHEN ${reachedInterviewSql} THEN 1 ELSE 0 END), 0)::int`,
        offerCount: sql<number>`COALESCE(SUM(CASE WHEN ${reachedOfferSql} THEN 1 ELSE 0 END), 0)::int`,
        rejectedCount: sql<number>`COALESCE(SUM(CASE WHEN ${reachedRejectedSql} THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(applications)
      .where(whereClause)
      .groupBy(periodSql)
      .orderBy(asc(periodSql));

    return rows;
  }
}

export const analyticsRepository = new AnalyticsRepository();
