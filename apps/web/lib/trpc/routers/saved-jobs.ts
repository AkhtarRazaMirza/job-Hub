/**
 * Job Hub — Phase 5 / Step 5.2
 * Saved Jobs tRPC Router
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 8 & §5 Phase 5 ("saved jobs")
 * - 02_how_to_build.md §10 ("Saved Jobs")
 *
 * Architecture:
 * Client
 *   ↓
 * tRPC (savedJobsRouter)
 *   ↓ authenticated session (ctx.user.id)
 *   ↓ candidateProfileService / jobRepository
 *   ↓ savedJobRepository
 *   ↓ PostgreSQL
 *
 * Thin adapter layer: Zero raw SQL in router, zero domain logic in router.
 */

import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import {
  z,
  SavedJobConflictError,
  SavedJobNotFoundError,
} from "@job-hub/jobs";
import {
  savedJobRepository,
  jobRepository,
} from "@job-hub/jobs/server";
import { candidateProfileService } from "@job-hub/candidate/server";

// -----------------------------------------------------------------------------
// Input Schemas
// -----------------------------------------------------------------------------

export const saveJobInputSchema = z
  .object({
    jobId: z.string().min(1, "Job ID is required"),
    notes: z
      .string()
      .max(2000, "Notes cannot exceed 2000 characters")
      .nullable()
      .optional(),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const unsaveJobInputSchema = z
  .object({
    jobId: z.string().min(1, "Job ID is required"),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const isSavedJobInputSchema = z
  .object({
    jobId: z.string().min(1, "Job ID is required"),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const listSavedJobsInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const updateSavedJobNotesRouterInputSchema = z
  .object({
    jobId: z.string().min(1, "Job ID is required"),
    notes: z
      .string()
      .max(2000, "Notes cannot exceed 2000 characters")
      .nullable()
      .optional(),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

// -----------------------------------------------------------------------------
// Helper: Resolve & Authorize Candidate Profile
// -----------------------------------------------------------------------------

async function resolveCandidateProfile(
  userId: string,
  candidateProfileIdOverride?: string,
  userIdOverride?: string
) {
  // Reject injected userId spoofing
  if (userIdOverride && userIdOverride !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cannot access another user's candidate profile.",
    });
  }

  const profile = await candidateProfileService.getProfile(userId);
  if (!profile) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Candidate profile not found for authenticated user.",
    });
  }

  // Reject injected candidateProfileId spoofing
  if (candidateProfileIdOverride && candidateProfileIdOverride !== profile.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cannot access another candidate's saved jobs.",
    });
  }

  return profile;
}

// -----------------------------------------------------------------------------
// Router Implementation
// -----------------------------------------------------------------------------

export const savedJobsRouter = router({
  /**
   * Save / bookmark a job for the authenticated candidate
   */
  save: protectedProcedure
    .input(saveJobInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      // Validate job existence server-side
      const job = await jobRepository.findById(input.jobId);
      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Job "${input.jobId}" not found.`,
        });
      }

      try {
        const savedJob = await savedJobRepository.create({
          candidateProfileId: profile.id,
          jobId: input.jobId,
          notes: input.notes,
        });

        return {
          id: savedJob.id,
          candidateProfileId: savedJob.candidateProfileId,
          jobId: savedJob.jobId,
          notes: savedJob.notes,
          createdAt: savedJob.createdAt,
          updatedAt: savedJob.updatedAt,
        };
      } catch (err: unknown) {
        if (err instanceof SavedJobConflictError) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Job "${input.jobId}" is already saved.`,
          });
        }
        throw err;
      }
    }),

  /**
   * Unsave / remove a bookmarked job
   */
  unsave: protectedProcedure
    .input(unsaveJobInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      const removed = await savedJobRepository.deleteByCandidateAndJob(
        profile.id,
        input.jobId
      );

      return {
        jobId: input.jobId,
        removed,
      };
    }),

  /**
   * Retrieve saved status for a specific job
   */
  isSaved: protectedProcedure
    .input(isSavedJobInputSchema)
    .query(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      const saved = await savedJobRepository.findByCandidateAndJob(
        profile.id,
        input.jobId
      );

      return {
        jobId: input.jobId,
        isSaved: saved !== null,
        savedJobId: saved?.id ?? null,
        notes: saved?.notes ?? null,
        savedAt: saved?.createdAt ?? null,
      };
    }),

  /**
   * List saved jobs for the authenticated candidate
   */
  list: protectedProcedure
    .input(listSavedJobsInputSchema)
    .query(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      const items = await savedJobRepository.listByCandidate(profile.id, {
        limit: input.limit,
        offset: input.offset,
      });

      const total = await savedJobRepository.countByCandidate(profile.id);

      return {
        items: items.map((sj) => ({
          id: sj.id,
          candidateProfileId: sj.candidateProfileId,
          jobId: sj.jobId,
          notes: sj.notes,
          createdAt: sj.createdAt,
          updatedAt: sj.updatedAt,
        })),
        total,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  /**
   * Update notes on an existing saved job
   */
  updateNotes: protectedProcedure
    .input(updateSavedJobNotesRouterInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      try {
        const updated = await savedJobRepository.updateNotes({
          candidateProfileId: profile.id,
          jobId: input.jobId,
          notes: input.notes,
        });

        return {
          id: updated.id,
          candidateProfileId: updated.candidateProfileId,
          jobId: updated.jobId,
          notes: updated.notes,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        };
      } catch (err: unknown) {
        if (err instanceof SavedJobNotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Saved job for job "${input.jobId}" not found.`,
          });
        }
        throw err;
      }
    }),

  /**
   * Total count of saved jobs for authenticated candidate
   */
  count: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveCandidateProfile(ctx.user.id);
    const count = await savedJobRepository.countByCandidate(profile.id);
    return { count };
  }),
});
