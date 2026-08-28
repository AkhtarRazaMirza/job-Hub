/**
 * Job Hub — Phase 4 / Step 4.6
 * Matching tRPC Router
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 7
 * - 02_how_to_build.md §4 ("match candidate → save score")
 * - 04_ai_agent_skills.md §9 & §10
 *
 * Architecture:
 * Client
 *   ↓
 * tRPC (matchingRouter)
 *   ↓ authenticated session (ctx.user.id)
 *   ↓ matching service / orchestration
 *   ↓ repository / Inngest
 *   ↓ PostgreSQL
 *
 * Thin adapter layer: Zero matching business logic in router.
 */

import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import {
  z,
  scoringWeightsSchema,
  matchDecisionSchema,
  buildCandidateMatchData,
  buildJobMatchData,
} from "@job-hub/matching";
import { jobMatchRepository, defaultMatchingEngine } from "@job-hub/matching/server";
import { jobRepository } from "@job-hub/jobs/server";
import {
  candidateProfileService,
  candidatePreferencesService,
  candidateProjectService,
} from "@job-hub/candidate/server";
import { inngest } from "@job-hub/inngest/client";

// -----------------------------------------------------------------------------
// Input Schemas
// -----------------------------------------------------------------------------

export const requestMatchInputSchema = z
  .object({
    jobId: z.string().min(1, "Job ID is required"),
    customWeights: scoringWeightsSchema.optional(),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const getMatchInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    jobId: z.string().min(1).optional(),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict()
  .refine(
    (data: { id?: string; jobId?: string; candidateProfileId?: string; userId?: string }) =>
      Boolean(data.id || data.jobId),
    {
      message: "Either match id or jobId must be provided.",
    }
  );

export const listMatchesInputSchema = z
  .object({
    decision: matchDecisionSchema.optional(),
    minScore: z.number().min(0).max(10).optional(),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const evaluateDirectInputSchema = z
  .object({
    jobId: z.string().min(1, "Job ID is required"),
    customWeights: scoringWeightsSchema.optional(),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

// -----------------------------------------------------------------------------
// Router
// -----------------------------------------------------------------------------

export const matchingRouter = router({
  /**
   * Triggers the durable Inngest matching workflow for a candidate and job.
   * Derives candidate identity strictly from session.user.id.
   * Returns an honest QUEUED response without falsely claiming completion.
   */
  request: protectedProcedure
    .input(requestMatchInputSchema)
    .mutation(async ({ input, ctx }) => {
      // 1. Authoritative Candidate Profile derivation
      const candidateProfile = await candidateProfileService.getProfile(ctx.user.id);
      if (!candidateProfile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Candidate profile not found. Please create a candidate profile first.",
        });
      }

      // 2. Ownership & Client Override Protection
      if (input.userId && input.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Client ownership override is forbidden.",
        });
      }
      if (input.candidateProfileId && input.candidateProfileId !== candidateProfile.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to trigger matching for this candidate profile.",
        });
      }

      // 3. Job existence validation
      const job = await jobRepository.findById(input.jobId);
      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Job with ID "${input.jobId}" was not found.`,
        });
      }

      // 4. Dispatch event to durable Inngest execution engine
      await inngest.send({
        name: "job.match.requested",
        data: {
          candidateProfileId: candidateProfile.id,
          jobId: job.id,
          customWeights: input.customWeights,
          requestedAt: new Date().toISOString(),
        },
      });

      // 5. Truthful response: matching is queued, not completed
      return {
        status: "QUEUED" as const,
        candidateProfileId: candidateProfile.id,
        jobId: job.id,
        message: "Matching evaluation has been queued for background processing.",
      };
    }),

  /**
   * Retrieves a single match by match ID or job ID.
   * Enforces server-side cross-user isolation.
   */
  get: protectedProcedure
    .input(getMatchInputSchema)
    .query(async ({ input, ctx }) => {
      // 1. Authoritative Candidate Profile derivation
      const candidateProfile = await candidateProfileService.getProfile(ctx.user.id);
      if (!candidateProfile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Candidate profile not found.",
        });
      }

      // 2. Ownership override checks
      if (input.userId && input.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Client ownership override is forbidden.",
        });
      }
      if (input.candidateProfileId && input.candidateProfileId !== candidateProfile.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to access another candidate's matches.",
        });
      }

      // 3. Retrieve match record
      let match = null;
      if (input.id) {
        match = await jobMatchRepository.findById(input.id);
      } else if (input.jobId) {
        match = await jobMatchRepository.findByCandidateAndJob(candidateProfile.id, input.jobId);
      }

      if (!match) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Job match not found.",
        });
      }

      // 4. Strict cross-user ownership enforcement
      if (match.candidateProfileId !== candidateProfile.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to view this match.",
        });
      }

      // 5. Sanitized client response
      return {
        id: match.id,
        candidateProfileId: match.candidateProfileId,
        jobId: match.jobId,
        overallScore: match.overallScore,
        decision: match.decision,
        hardConstraintsPassed: match.hardConstraintsPassed,
        hardConstraintFailures: match.hardConstraintFailures,
        categoryScores: match.categoryScores,
        strengths: match.strengths,
        gaps: match.gaps,
        risks: match.risks,
        explanation: match.explanation,
        confidence: match.confidence,
        weightsUsed: match.weightsUsed,
        createdAt: match.createdAt,
        updatedAt: match.updatedAt,
      };
    }),

  /**
   * Lists matches for the authenticated user's candidate profile.
   */
  list: protectedProcedure
    .input(listMatchesInputSchema)
    .query(async ({ input, ctx }) => {
      // 1. Authoritative Candidate Profile derivation
      const candidateProfile = await candidateProfileService.getProfile(ctx.user.id);
      if (!candidateProfile) {
        return { items: [], total: 0 };
      }

      // 2. Ownership check
      if (input.userId && input.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Client ownership override is forbidden.",
        });
      }
      if (input.candidateProfileId && input.candidateProfileId !== candidateProfile.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to list matches for another candidate.",
        });
      }

      // 3. Query repository strictly using authenticated candidate profile ID
      const matches = await jobMatchRepository.listByCandidate(candidateProfile.id, {
        decision: input.decision,
        minScore: input.minScore,
        limit: input.limit,
        offset: input.offset,
      });

      return {
        items: matches.map((m) => ({
          id: m.id,
          candidateProfileId: m.candidateProfileId,
          jobId: m.jobId,
          overallScore: m.overallScore,
          decision: m.decision,
          hardConstraintsPassed: m.hardConstraintsPassed,
          hardConstraintFailures: m.hardConstraintFailures,
          categoryScores: m.categoryScores,
          strengths: m.strengths,
          gaps: m.gaps,
          risks: m.risks,
          explanation: m.explanation,
          confidence: m.confidence,
          weightsUsed: m.weightsUsed,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        })),
        total: matches.length,
      };
    }),

  /**
   * Synchronous direct evaluation endpoint / preview.
   * Leverages the existing MatchingEngine without persisting.
   */
  evaluate: protectedProcedure
    .input(evaluateDirectInputSchema)
    .mutation(async ({ input, ctx }) => {
      // 1. Authoritative Candidate Profile derivation
      const candidateProfile = await candidateProfileService.getProfile(ctx.user.id);
      if (!candidateProfile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Candidate profile not found.",
        });
      }

      // 2. Ownership check
      if (input.userId && input.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Client ownership override is forbidden.",
        });
      }
      if (input.candidateProfileId && input.candidateProfileId !== candidateProfile.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to evaluate for another candidate profile.",
        });
      }

      // 3. Job existence validation
      const job = await jobRepository.findById(input.jobId);
      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Job with ID "${input.jobId}" was not found.`,
        });
      }

      // 4. Assemble candidate & job data via pure domain mappers
      const preferences = await candidatePreferencesService.getPreferences(candidateProfile.userId);
      const projects = await candidateProjectService.listProjects(candidateProfile.userId);
      const candidateData = buildCandidateMatchData(candidateProfile, preferences, projects);
      const jobData = buildJobMatchData(job);

      // 5. Evaluate through thin adapter over MatchingEngine
      const result = await defaultMatchingEngine.evaluate({
        candidate: candidateData,
        job: jobData,
        weights: input.customWeights,
      });

      return result;
    }),
});
