import { router, protectedProcedure } from "../init";
import {
  uploadResumeInputSchema,
  deleteResumeInputSchema,
  getResumeInputSchema,
} from "@job-hub/candidate";
import {
  resumeService,
  ResumeNotFoundError,
  ResumeForbiddenError,
} from "@job-hub/candidate/server";
import { TRPCError } from "@trpc/server";

export const resumeRouter = router({
  /**
   * Upload and register a new candidate resume.
   * Ownership is server-derived from ctx.user.id.
   */
  upload: protectedProcedure
    .input(uploadResumeInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await resumeService.uploadResume({
          userId: ctx.user.id,
          fileName: input.fileName,
          fileBase64: input.fileBase64,
          mimeType: input.mimeType,
        });
      } catch (error) {
        if (error instanceof Error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upload resume",
        });
      }
    }),

  /**
   * List all resumes belonging to the current authenticated candidate.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await resumeService.listResumes(ctx.user.id);
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list resumes",
      });
    }
  }),

  /**
   * Get metadata for a specific resume belonging to the authenticated candidate.
   */
  get: protectedProcedure
    .input(getResumeInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await resumeService.getResume(ctx.user.id, input.id);
      } catch (error) {
        if (error instanceof ResumeNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        if (error instanceof ResumeForbiddenError) {
          throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve resume",
        });
      }
    }),

  /**
   * Delete a resume belonging to the authenticated candidate.
   */
  delete: protectedProcedure
    .input(deleteResumeInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await resumeService.deleteResume(ctx.user.id, input.id);
        return { success: true, deletedId: input.id };
      } catch (error) {
        if (error instanceof ResumeNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        if (error instanceof ResumeForbiddenError) {
          throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete resume",
        });
      }
    }),
});
