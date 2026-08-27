import { router, protectedProcedure } from "../init";
import {
  createProfileInputSchema,
  updateProfileInputSchema,
  profileFromResumeInputSchema,
  updatePreferencesInputSchema,
  analyzeGitHubRepoInputSchema,
  confirmProjectInputSchema,
  deleteProjectInputSchema,
} from "@job-hub/candidate";
import {
  candidateProfileService,
  candidateProfilerService,
  candidatePreferencesService,
  candidateProjectService,
  CandidateProfileConflictError,
  CandidateProfileNotFoundError,
  CandidateProfileValidationError,
  ResumeNotFoundError,
  ResumeForbiddenError,
  ResumeValidationError,
  AiProviderError,
  GitHubError,
  GitHubNotFoundError,
  GitHubRateLimitError,
} from "@job-hub/candidate/server";
import { TRPCError } from "@trpc/server";

export const candidateRouter = router({
  /**
   * Get current authenticated user's candidate profile.
   * Derives user identity strictly from session.user.id.
   * Returns null if user has not yet created a profile.
   */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await candidateProfileService.getProfile(ctx.user.id);
    } catch (error) {
      if (error instanceof CandidateProfileValidationError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      });
    }
  }),

  /**
   * Create candidate profile for current authenticated user.
   * Ownership (userId) is server-derived from ctx.user.id and never accepted from client input.
   */
  createProfile: protectedProcedure
    .input(createProfileInputSchema.optional())
    .mutation(async ({ ctx, input }) => {
      try {
        return await candidateProfileService.createProfile(ctx.user.id, input);
      } catch (error) {
        if (error instanceof CandidateProfileConflictError) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        if (error instanceof CandidateProfileValidationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        });
      }
    }),

  /**
   * Update candidate profile for current authenticated user.
   * Ownership is immutable and cannot be modified or reassigned.
   */
  updateProfile: protectedProcedure
    .input(updateProfileInputSchema.optional())
    .mutation(async ({ ctx, input }) => {
      try {
        return await candidateProfileService.updateProfile(ctx.user.id, input);
      } catch (error) {
        if (error instanceof CandidateProfileNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        if (error instanceof CandidateProfileValidationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        });
      }
    }),

  /**
   * AI Structured Candidate Profiler from processed resume text.
   * Derives user identity strictly from ctx.user.id.
   * Client provides only resumeId. Ownership of both profile and resume is verified server-side.
   */
  profileFromResume: protectedProcedure
    .input(profileFromResumeInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await candidateProfilerService.profileResume({
          userId: ctx.user.id,
          resumeId: input.resumeId,
        });
      } catch (error) {
        if (error instanceof CandidateProfileNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        if (error instanceof ResumeNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        if (error instanceof ResumeForbiddenError) {
          throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        }
        if (error instanceof ResumeValidationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        if (error instanceof AiProviderError) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: `AI Profiling error: ${error.message}`,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error during candidate profiling",
        });
      }
    }),

  /**
   * Get candidate job preferences for current authenticated user.
   * Derives user identity strictly from ctx.user.id.
   */
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await candidatePreferencesService.getPreferences(ctx.user.id);
    } catch (error) {
      if (error instanceof CandidateProfileNotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: error.message });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to retrieve candidate preferences",
      });
    }
  }),

  /**
   * Update candidate job preferences for current authenticated user.
   * Derives user identity strictly from ctx.user.id.
   */
  updatePreferences: protectedProcedure
    .input(updatePreferencesInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await candidatePreferencesService.updatePreferences(ctx.user.id, input);
      } catch (error) {
        if (error instanceof CandidateProfileNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        if (error instanceof CandidateProfileValidationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update candidate preferences",
        });
      }
    }),

  /**
   * Analyze candidate's GitHub repository.
   * Grounded in 02_how_to_build.md §3 and 04_ai_agent_skills.md §3.
   * Returns project analysis draft for candidate confirmation.
   */
  analyzeGitHubRepo: protectedProcedure
    .input(analyzeGitHubRepoInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await candidateProjectService.analyzeGitHubRepository(
          ctx.user.id,
          input.repositoryUrl
        );
      } catch (error) {
        if (error instanceof CandidateProfileNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        if (error instanceof GitHubNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        if (error instanceof GitHubRateLimitError) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "GitHub API rate limit reached. Please try again later.",
          });
        }
        if (error instanceof GitHubError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to analyze GitHub repository",
        });
      }
    }),

  /**
   * Confirm and save verified project to candidate profile.
   * Grounded in 02_how_to_build.md §3 ("User confirms -> Save").
   */
  confirmProject: protectedProcedure
    .input(confirmProjectInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await candidateProjectService.confirmAndSaveProject(ctx.user.id, input);
      } catch (error) {
        if (error instanceof CandidateProfileNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        if (error instanceof CandidateProfileValidationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to confirm and save project",
        });
      }
    }),

  /**
   * List confirmed verified projects for authenticated candidate.
   */
  listProjects: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await candidateProjectService.listProjects(ctx.user.id);
    } catch (error) {
      if (error instanceof CandidateProfileNotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: error.message });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list candidate projects",
      });
    }
  }),

  /**
   * Delete a candidate project.
   */
  deleteProject: protectedProcedure
    .input(deleteProjectInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const deleted = await candidateProjectService.deleteProject(ctx.user.id, input.id);
        if (!deleted) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
        }
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        if (error instanceof CandidateProfileNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        if (error instanceof ResumeForbiddenError) {
          throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete project",
        });
      }
    }),
});
