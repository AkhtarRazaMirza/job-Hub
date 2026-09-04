/**
 * Job Hub — Phase 9 / Step 9.4
 * Analytics tRPC Router
 *
 * Implements candidate-isolated, protected tRPC procedures exposing truthful
 * analytics metrics for the authenticated candidate.
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 9 ("Analytics")
 * - 02_how_to_build.md §15 ("Analytics")
 * - 03_tech_stack.md §4 ("PostgreSQL via Drizzle ORM")
 * - 04_ai_agent_skills.md §19 ("Analytics Skill")
 *
 * Invariants:
 * 1. Strictly protectedProcedure: Unauthenticated requests rejected.
 * 2. Session-Derived Identity: Profile derived strictly from ctx.user.id.
 * 3. Spoofing Rejection: Foreign userId or candidateProfileId rejected with FORBIDDEN.
 * 4. Observation Layer: Zero mutations.
 * 5. Truthful Metrics: Persisted statistics only; division-by-zero handled safely.
 */

import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import {
  analyticsFilterSchema,
  analyticsTrendsFilterSchema,
  rolePerformanceFilterSchema,
} from "@job-hub/applications";
import {
  analyticsService,
  AnalyticsService,
} from "@job-hub/applications/server";
import { candidateProfileService } from "@job-hub/candidate/server";

/**
 * Enforces identity protection against injected foreign user or profile IDs.
 */
function assertCandidateIdentity(
  input: { userId?: string; candidateProfileId?: string } | undefined,
  sessionUserId: string,
  candidateProfileId: string
): void {
  if (!input) return;

  if (input.userId && input.userId !== sessionUserId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cannot access another user's analytics data.",
    });
  }

  if (
    input.candidateProfileId &&
    input.candidateProfileId !== candidateProfileId
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cannot access another candidate's analytics data.",
    });
  }
}

export const analyticsRouter = router({
  /**
   * Candidate Application Overview & Key Metrics.
   * Delivers total applications, volume breakdown, response rate, interview rate,
   * offer rate, rejection rate, and average match score.
   */
  overview: protectedProcedure
    .input(analyticsFilterSchema.optional())
    .query(async ({ ctx, input }) => {
      const profile = await candidateProfileService.getProfile(ctx.user.id);
      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Candidate profile not found. Please create a profile first.",
        });
      }

      assertCandidateIdentity(input, ctx.user.id, profile.id);

      return await analyticsService.getOverview(profile.id, input);
    }),

  /**
   * Application Funnel Stages Breakdown.
   * Delivers volume through Prepared -> Applied -> Under Review -> Interview -> Offer
   * with conversion percentages and terminal outcomes.
   */
  funnel: protectedProcedure
    .input(analyticsFilterSchema.optional())
    .query(async ({ ctx, input }) => {
      const profile = await candidateProfileService.getProfile(ctx.user.id);
      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Candidate profile not found.",
        });
      }

      assertCandidateIdentity(input, ctx.user.id, profile.id);

      return await analyticsService.getFunnel(profile.id, input);
    }),

  /**
   * Match Score vs Interview Conversion by Score Band.
   * Truthful, non-causal representation across 85-100, 75-84, 60-74, <60, and UNSCORED.
   */
  matchScores: protectedProcedure
    .input(analyticsFilterSchema.optional())
    .query(async ({ ctx, input }) => {
      const profile = await candidateProfileService.getProfile(ctx.user.id);
      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Candidate profile not found.",
        });
      }

      assertCandidateIdentity(input, ctx.user.id, profile.id);

      return await analyticsService.getScoreBandConversion(profile.id, input);
    }),

  /**
   * Job Source Quality and Outcome Breakdown.
   * Evaluates volume, response rate, interview rate, and offer rate per source.
   */
  sources: protectedProcedure
    .input(analyticsFilterSchema.optional())
    .query(async ({ ctx, input }) => {
      const profile = await candidateProfileService.getProfile(ctx.user.id);
      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Candidate profile not found.",
        });
      }

      assertCandidateIdentity(input, ctx.user.id, profile.id);

      return await analyticsService.getSourcePerformance(profile.id, input);
    }),

  /**
   * Role Performance Breakdown.
   * Aggregates application volume, interviews, and offers by target role.
   */
  roles: protectedProcedure
    .input(rolePerformanceFilterSchema.optional())
    .query(async ({ ctx, input }) => {
      const profile = await candidateProfileService.getProfile(ctx.user.id);
      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Candidate profile not found.",
        });
      }

      assertCandidateIdentity(input, ctx.user.id, profile.id);

      return await analyticsService.getRolePerformance(profile.id, input);
    }),

  /**
   * Resume Version Performance Breakdown.
   * Analyzes outcomes associated with the resume version used.
   */
  resumeVersions: protectedProcedure
    .input(analyticsFilterSchema.optional())
    .query(async ({ ctx, input }) => {
      const profile = await candidateProfileService.getProfile(ctx.user.id);
      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Candidate profile not found.",
        });
      }

      assertCandidateIdentity(input, ctx.user.id, profile.id);

      return await analyticsService.getResumeVersionPerformance(profile.id, input);
    }),

  /**
   * Application Trends Over Time.
   * Buckets applications deterministically by day, week, or month.
   */
  trends: protectedProcedure
    .input(analyticsTrendsFilterSchema.optional())
    .query(async ({ ctx, input }) => {
      const profile = await candidateProfileService.getProfile(ctx.user.id);
      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Candidate profile not found.",
        });
      }

      assertCandidateIdentity(input, ctx.user.id, profile.id);

      return await analyticsService.getTrends(profile.id, input);
    }),
});
