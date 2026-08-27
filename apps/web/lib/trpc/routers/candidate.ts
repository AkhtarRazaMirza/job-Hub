import { router, protectedProcedure } from "../init";
import {
  createProfileInputSchema,
  updateProfileInputSchema,
} from "@job-hub/candidate";
import {
  candidateProfileService,
  CandidateProfileConflictError,
  CandidateProfileNotFoundError,
  CandidateProfileValidationError,
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
});
