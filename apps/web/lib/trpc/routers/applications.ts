/**
 * Job Hub — Phase 6 / Step 6.4
 * Application Tracking tRPC Router
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 12 & 13, §5 Phase 6 ("Application tracking")
 * - 02_how_to_build.md §10 ("Applications", "Application Details"), §14, §17
 * - 04_ai_agent_skills.md §17 & §18
 *
 * Architecture:
 * Client
 *   ↓
 * tRPC (applicationsRouter - protectedProcedure)
 *   ↓ authenticated session (ctx.user.id)
 *   ↓ candidateProfileService / jobRepository
 *   ↓ applicationRepository
 *   ↓ PostgreSQL
 *
 * Thin adapter layer: Zero raw SQL, zero domain logic in router.
 */

import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import {
  z,
  applicationStatusSchema,
  ApplicationConflictError,
  ApplicationNotFoundError,
  InvalidStateTransitionError,
  ApplicationError,
} from "@job-hub/applications";
import {
  applicationRepository,
  applicationPreparationService,
  coverLetterRepository,
  applicationAnswerRepository,
} from "@job-hub/applications/server";
import { candidateProfileService } from "@job-hub/candidate/server";
import { jobRepository } from "@job-hub/jobs/server";

// -----------------------------------------------------------------------------
// Input Schemas
// -----------------------------------------------------------------------------

export const createApplicationRouterInputSchema = z
  .object({
    jobId: z.string().min(1, "Job ID is required"),
    matchId: z.string().optional(),
    status: applicationStatusSchema.optional(),
    notes: z.string().max(2000, "Notes cannot exceed 2000 characters").optional(),
    resumeVersionId: z.string().optional(),
    coverLetterVersionId: z.string().optional(),
    nextAction: z.string().max(255, "Next action cannot exceed 255 characters").optional(),
    followUpDate: z.string().datetime().optional().nullable(),
    confirmationReference: z.string().max(255, "Confirmation reference cannot exceed 255 characters").optional(),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const getApplicationByIdRouterInputSchema = z
  .object({
    id: z.string().min(1, "Application ID is required"),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const listApplicationsRouterInputSchema = z
  .object({
    status: applicationStatusSchema.optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict()
  .optional();

export const transitionStatusRouterInputSchema = z
  .object({
    id: z.string().min(1, "Application ID is required"),
    toStatus: applicationStatusSchema,
    notes: z.string().max(2000, "Notes cannot exceed 2000 characters").optional().nullable(),
    nextAction: z.string().max(255, "Next action cannot exceed 255 characters").optional().nullable(),
    followUpDate: z.string().datetime().optional().nullable(),
    confirmationReference: z.string().max(255, "Confirmation reference cannot exceed 255 characters").optional().nullable(),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const updateApplicationNotesRouterInputSchema = z
  .object({
    id: z.string().min(1, "Application ID is required"),
    notes: z.string().max(2000, "Notes cannot exceed 2000 characters").nullable().optional(),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const updateApplicationFollowUpRouterInputSchema = z
  .object({
    id: z.string().min(1, "Application ID is required"),
    followUpDate: z.string().datetime().nullable().optional(),
    nextAction: z.string().max(255, "Next action cannot exceed 255 characters").nullable().optional(),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const withdrawApplicationRouterInputSchema = z
  .object({
    id: z.string().min(1, "Application ID is required"),
    reason: z.string().max(2000, "Reason cannot exceed 2000 characters").optional(),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const deleteApplicationRouterInputSchema = z
  .object({
    id: z.string().min(1, "Application ID is required"),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const applicationStatsRouterInputSchema = z
  .object({
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict()
  .optional();

export const preparePackageRouterInputSchema = z
  .object({
    jobId: z.string().min(1, "Job ID is required"),
    questions: z.array(z.string().min(1)).optional(),
    customCoverLetterNotes: z.string().max(1000).optional(),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const getPackageRouterInputSchema = z
  .object({
    applicationId: z.string().min(1, "Application ID is required"),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const approvePackageRouterInputSchema = z
  .object({
    applicationId: z.string().min(1, "Application ID is required"),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const updateCoverLetterRouterInputSchema = z
  .object({
    id: z.string().min(1, "Cover letter ID is required"),
    content: z.string().min(50, "Cover letter content cannot be empty"),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const updateAnswerRouterInputSchema = z
  .object({
    answerId: z.string().min(1, "Answer ID is required"),
    applicationId: z.string().min(1, "Application ID is required"),
    answer: z.string().min(1, "Answer cannot be empty"),
    isConfirmed: z.boolean().optional(),
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
      message: "Forbidden: cross-user userId injection detected",
    });
  }

  const profile = await candidateProfileService.getProfile(userId);
  if (!profile) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Candidate profile not found. Please complete profile setup first.",
    });
  }

  // Reject injected candidateProfileId spoofing
  if (candidateProfileIdOverride && candidateProfileIdOverride !== profile.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Forbidden: cross-user candidateProfileId spoofing detected",
    });
  }

  return profile;
}

// -----------------------------------------------------------------------------
// Router Implementation
// -----------------------------------------------------------------------------

export const applicationsRouter = router({
  /**
   * Create an application record for the authenticated candidate
   */
  create: protectedProcedure
    .input(createApplicationRouterInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      // Verify canonical job exists
      const job = await jobRepository.findById(input.jobId);
      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Job "${input.jobId}" not found.`,
        });
      }

      try {
        const app = await applicationRepository.create({
          candidateProfileId: profile.id,
          jobId: input.jobId,
          matchId: input.matchId,
          status: input.status,
          notes: input.notes,
          resumeVersionId: input.resumeVersionId,
          coverLetterVersionId: input.coverLetterVersionId,
          nextAction: input.nextAction,
          followUpDate: input.followUpDate ? new Date(input.followUpDate) : null,
          confirmationReference: input.confirmationReference,
        });

        return {
          id: app.id,
          candidateProfileId: app.candidateProfileId,
          jobId: app.jobId,
          matchId: app.matchId,
          company: app.company,
          role: app.role,
          source: app.source,
          applicationUrl: app.applicationUrl,
          matchScore: app.matchScore,
          status: app.status,
          submittedAt: app.submittedAt,
          nextAction: app.nextAction,
          followUpDate: app.followUpDate,
          notes: app.notes,
          resumeVersionId: app.resumeVersionId,
          coverLetterVersionId: app.coverLetterVersionId,
          confirmationReference: app.confirmationReference,
          createdAt: app.createdAt,
          updatedAt: app.updatedAt,
        };
      } catch (error) {
        if (error instanceof ApplicationConflictError) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An application has already been created for this job.",
            cause: error,
          });
        }
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to create application.",
        });
      }
    }),

  /**
   * Get single application details by ID with candidate isolation
   */
  getById: protectedProcedure
    .input(getApplicationByIdRouterInputSchema)
    .query(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      const app = await applicationRepository.findById(input.id, profile.id);
      if (!app) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Application "${input.id}" not found.`,
        });
      }

      return app;
    }),

  /**
   * List applications with optional status filtering and pagination
   */
  list: protectedProcedure
    .input(listApplicationsRouterInputSchema)
    .query(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input?.candidateProfileId,
        input?.userId
      );

      const result = await applicationRepository.list(profile.id, {
        status: input?.status,
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });

      return result;
    }),

  /**
   * Transition application lifecycle status using domain state machine
   */
  transitionStatus: protectedProcedure
    .input(transitionStatusRouterInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      try {
        const updated = await applicationRepository.transitionStatus({
          id: input.id,
          candidateProfileId: profile.id,
          toStatus: input.toStatus,
          notes: input.notes,
          nextAction: input.nextAction,
          followUpDate: input.followUpDate ? new Date(input.followUpDate) : null,
          confirmationReference: input.confirmationReference,
        });

        return updated;
      } catch (error) {
        if (error instanceof InvalidStateTransitionError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
            cause: error,
          });
        }
        if (error instanceof ApplicationNotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
            cause: error,
          });
        }
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to transition status.",
        });
      }
    }),

  /**
   * Update notes for an application
   */
  updateNotes: protectedProcedure
    .input(updateApplicationNotesRouterInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      try {
        const updated = await applicationRepository.updateNotes(
          input.id,
          profile.id,
          input.notes ?? null
        );
        return updated;
      } catch (error) {
        if (error instanceof ApplicationNotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Update follow-up schedule and next action
   */
  updateFollowUp: protectedProcedure
    .input(updateApplicationFollowUpRouterInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      try {
        const updated = await applicationRepository.updateFollowUp(
          input.id,
          profile.id,
          input.followUpDate ? new Date(input.followUpDate) : null,
          input.nextAction ?? null
        );
        return updated;
      } catch (error) {
        if (error instanceof ApplicationNotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Withdraw an application (transitions to terminal WITHDRAWN status)
   */
  withdraw: protectedProcedure
    .input(withdrawApplicationRouterInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      try {
        const withdrawn = await applicationRepository.withdraw(
          input.id,
          profile.id,
          input.reason
        );
        return withdrawn;
      } catch (error) {
        if (error instanceof InvalidStateTransitionError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        if (error instanceof ApplicationNotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Delete application record
   */
  delete: protectedProcedure
    .input(deleteApplicationRouterInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      const success = await applicationRepository.delete(input.id, profile.id);
      if (!success) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Application "${input.id}" not found.`,
        });
      }

      return { success: true };
    }),

  /**
   * Prepare a complete application package (tailored resume, PDF, cover letter, answers)
   */
  preparePackage: protectedProcedure
    .input(preparePackageRouterInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      try {
        return await applicationPreparationService.prepareApplicationPackage({
          candidateProfileId: profile.id,
          jobId: input.jobId,
          questions: input.questions,
          customCoverLetterNotes: input.customCoverLetterNotes,
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to prepare application package",
        });
      }
    }),

  /**
   * Get an existing application preparation package
   */
  getPackage: protectedProcedure
    .input(getPackageRouterInputSchema)
    .query(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      try {
        return await applicationPreparationService.getPackage(
          input.applicationId,
          profile.id
        );
      } catch (error) {
        if (error instanceof ApplicationNotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to retrieve package",
        });
      }
    }),

  /**
   * Explicit user approval of application package materials
   */
  approvePackage: protectedProcedure
    .input(approvePackageRouterInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      try {
        return await applicationPreparationService.approvePackage({
          applicationId: input.applicationId,
          candidateProfileId: profile.id,
        });
      } catch (error) {
        if (error instanceof ApplicationNotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to approve package",
        });
      }
    }),

  /**
   * Candidate edits cover letter content
   */
  updateCoverLetter: protectedProcedure
    .input(updateCoverLetterRouterInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      try {
        return await coverLetterRepository.update({
          id: input.id,
          candidateProfileId: profile.id,
          content: input.content,
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to update cover letter",
        });
      }
    }),

  /**
   * Candidate edits/confirms an application answer
   */
  updateAnswer: protectedProcedure
    .input(updateAnswerRouterInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input.candidateProfileId,
        input.userId
      );

      try {
        return await applicationAnswerRepository.updateAnswer({
          answerId: input.answerId,
          applicationId: input.applicationId,
          candidateProfileId: profile.id,
          answer: input.answer,
          isConfirmed: input.isConfirmed,
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to update answer",
        });
      }
    }),

  /**
   * Aggregate application statistics for dashboard overview
   */
  stats: protectedProcedure
    .input(applicationStatsRouterInputSchema)
    .query(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(
        ctx.user.id,
        input?.candidateProfileId,
        input?.userId
      );

      return await applicationRepository.getStats(profile.id);
    }),
});
