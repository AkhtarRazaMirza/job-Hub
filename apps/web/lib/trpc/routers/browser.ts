/**
 * Job Hub — Phase 8 / Step 8.6
 * Browser Agent tRPC Router & API Layer
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 8 ("Browser agent")
 * - 02_how_to_build.md §13 ("Browser agent flow")
 * - 04_ai_agent_skills.md §14, §15, §16
 *
 * Security & Multi-Tenant Invariants:
 * - All procedures use protectedProcedure.
 * - Authenticated user identity derived strictly from session (ctx.user.id).
 * - Candidate profile resolved server-side.
 * - Strict Zod validation rejects client-supplied ownership injection (userId, candidateProfileId).
 * - Candidate ownership strictly enforced on all executions and applications.
 */

import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import {
  z,
  startBrowserExecutionClientInputSchema,
  confirmFieldAnswerClientInputSchema,
  approveBrowserSubmissionClientInputSchema,
  cancelBrowserExecutionClientInputSchema,
  validateBrowserTargetUrl,
  BrowserExecutionNotFoundError,
  BrowserExecutionForbiddenError,
  BrowserSafetyHaltError,
  BrowserApprovalRequiredError,
  BrowserUncertainSubmissionError,
  BrowserUrlValidationError,
  ApplicationNotFoundError,
} from "@job-hub/applications";
import {
  browserExecutionRepository,
  controlledBrowserService,
  browserSubmissionController,
  applicationRepository,
  applicationPreparationService,
} from "@job-hub/applications/server";
import { candidateProfileService } from "@job-hub/candidate/server";

/**
 * Resolves candidate profile for the authenticated session,
 * blocking unauthenticated or cross-profile tampering.
 */
async function resolveCandidateProfile(userId: string) {
  const profile = await candidateProfileService.getProfile(userId);
  if (!profile) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Candidate profile not found. Please complete profile setup first.",
    });
  }
  return profile;
}

export const browserRouter = router({
  /**
   * Start or resume a controlled browser assisted form-filling flow.
   */
  startExecution: protectedProcedure
    .input(startBrowserExecutionClientInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(ctx.user.id);

      // 1. Fetch application and verify candidate ownership
      const appWithDetails = await applicationRepository.findById(
        input.applicationId,
        profile.id
      );
      if (!appWithDetails) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Application '${input.applicationId}' not found for authenticated candidate.`,
        });
      }

      // 2. Resolve target URL: prefer input, fallback to application URL
      const targetUrl = input.targetUrl || appWithDetails.applicationUrl;
      if (!targetUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No application URL available to navigate.",
        });
      }

      // Early URL & SSRF validation
      const expectedJobUrl = (appWithDetails.job.canonicalUrl || appWithDetails.applicationUrl) ?? undefined;
      const urlValidation = validateBrowserTargetUrl(targetUrl, expectedJobUrl);
      if (!urlValidation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: urlValidation.error || "Invalid application target URL",
        });
      }

      // 3. Retrieve or build Phase 7 Preparation Package
      let prepPackage = null;
      try {
        prepPackage = await applicationPreparationService.getPackage(
          input.applicationId,
          profile.id
        );
      } catch {
        try {
          prepPackage = await applicationPreparationService.prepareApplicationPackage({
            candidateProfileId: profile.id,
            jobId: appWithDetails.jobId,
          });
        } catch {
          prepPackage = null;
        }
      }

      // 4. Create execution record
      const execution = await browserExecutionRepository.create({
        applicationId: input.applicationId,
        candidateProfileId: profile.id,
        targetUrl,
      });

      // 5. Execute assisted flow
      try {
        const profileData = (profile.profileData as Record<string, any> | null) ?? null;
        const candidateName = profileData?.name || ctx.user.name || undefined;
        const firstName =
          profileData?.firstName ||
          (candidateName ? candidateName.split(" ")[0] : undefined);
        const lastName =
          profileData?.lastName ||
          (candidateName && candidateName.includes(" ")
            ? candidateName.split(" ").slice(1).join(" ")
            : undefined);

        const result = await controlledBrowserService.executeAssistedFlow({
          executionId: execution.id,
          candidateProfileId: profile.id,
          targetUrl,
          expectedJobUrl,
          candidateContext: {
            profile: {
              name: candidateName,
              firstName,
              lastName,
              email: profileData?.email || ctx.user.email || undefined,
              phone: profileData?.phone || undefined,
              location: profileData?.location || undefined,
              city: profileData?.city || undefined,
              country: profileData?.country || undefined,
              headline: profile.headline || profileData?.headline || undefined,
              summary: profileData?.summary || undefined,
              linkedinUrl: profile.linkedinUrl || profileData?.linkedinUrl || undefined,
              githubUrl: profileData?.githubUrl || undefined,
              portfolioUrl: profile.portfolioUrl || profileData?.portfolioUrl || undefined,
            },
            preparationPackage: prepPackage,
          },
        });

        return result;
      } catch (err: unknown) {
        if (err instanceof BrowserSafetyHaltError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: err.message,
          });
        }
        if (err instanceof BrowserUrlValidationError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err.message,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Browser execution failed",
        });
      }
    }),

  /**
   * Get details and live state of a specific browser execution session.
   */
  getExecution: protectedProcedure
    .input(z.object({ executionId: z.string().min(1) }).strict())
    .query(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(ctx.user.id);

      try {
        return await browserExecutionRepository.findById(input.executionId, profile.id);
      } catch (err: unknown) {
        if (err instanceof BrowserExecutionNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        if (err instanceof BrowserExecutionForbiddenError) {
          throw new TRPCError({ code: "FORBIDDEN", message: err.message });
        }
        throw err;
      }
    }),

  /**
   * Get the latest browser execution session for a given application.
   */
  getLatestExecution: protectedProcedure
    .input(z.object({ applicationId: z.string().min(1) }).strict())
    .query(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(ctx.user.id);
      return await browserExecutionRepository.findLatestByApplicationId(
        input.applicationId,
        profile.id
      );
    }),

  /**
   * Confirms a candidate-supplied answer for an unmapped or sensitive field.
   */
  confirmField: protectedProcedure
    .input(confirmFieldAnswerClientInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(ctx.user.id);

      try {
        return await browserExecutionRepository.confirmField(
          input.executionId,
          profile.id,
          input.fieldId,
          input.confirmedValue
        );
      } catch (err: unknown) {
        if (err instanceof BrowserExecutionNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        if (err instanceof BrowserExecutionForbiddenError) {
          throw new TRPCError({ code: "FORBIDDEN", message: err.message });
        }
        throw err;
      }
    }),

  /**
   * Explicitly approves and triggers final submission of the application.
   */
  approveAndSubmit: protectedProcedure
    .input(approveBrowserSubmissionClientInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(ctx.user.id);

      // 1. Mark explicit approval on execution
      try {
        await browserExecutionRepository.update(input.executionId, profile.id, {
          userApproved: true,
          userApprovedAt: new Date(),
        });
      } catch (err: unknown) {
        if (err instanceof BrowserExecutionNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        if (err instanceof BrowserExecutionForbiddenError) {
          throw new TRPCError({ code: "FORBIDDEN", message: err.message });
        }
        throw err;
      }

      // 2. Execute verified submission controller
      try {
        return await browserSubmissionController.submitApplication({
          executionId: input.executionId,
          candidateProfileId: profile.id,
        });
      } catch (err: unknown) {
        if (err instanceof BrowserApprovalRequiredError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        if (err instanceof BrowserUncertainSubmissionError) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Submission state uncertain: ${err.message}. Application was NOT marked as APPLIED to prevent duplicates.`,
          });
        }
        if (err instanceof ApplicationNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Submission failed",
        });
      }
    }),

  /**
   * Cancels a browser execution session.
   */
  cancelExecution: protectedProcedure
    .input(cancelBrowserExecutionClientInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(ctx.user.id);

      return await browserExecutionRepository.update(input.executionId, profile.id, {
        status: "CANCELLED",
      });
    }),
});
