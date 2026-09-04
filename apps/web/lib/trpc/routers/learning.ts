/**
 * Job Hub — Phase 10 / Step 10.6
 * Learning tRPC Router
 *
 * Implements candidate-isolated, protected tRPC procedures exposing
 * evidence-grounded recommendations for the authenticated candidate.
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 10 ("Learning")
 * - 02_how_to_build.md §16 ("Learning engine")
 * - 04_ai_agent_skills.md §20 & §21
 *
 * Invariants:
 * 1. Strictly protectedProcedure: Unauthenticated requests rejected.
 * 2. Session-Derived Identity: Candidate profile derived strictly from ctx.user.id.
 * 3. Spoofing Rejection: Foreign userId or candidateProfileId rejected with FORBIDDEN.
 * 4. Read-Only Candidate Truth: Zero mutation to profile facts or master resumes.
 * 5. Deterministic Arithmetic: Calculations remain reproducible and auditable.
 */

import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import {
  getRecommendationsInputSchema,
  getRecommendationInputSchema,
  dismissRecommendationInputSchema,
  applyRecommendationInputSchema,
  refreshRecommendationsInputSchema,
} from "@job-hub/applications";
import {
  learningRepository,
  recommendationAgent,
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
      message: "Cannot access another user's recommendations.",
    });
  }

  if (
    input.candidateProfileId &&
    input.candidateProfileId !== candidateProfileId
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cannot access another candidate's recommendations.",
    });
  }
}

/**
 * Resolves candidate profile from authenticated session and enforces anti-spoofing.
 */
async function resolveCandidateProfile(
  ctx: { user?: { id: string } },
  input?: { userId?: string; candidateProfileId?: string }
) {
  const sessionUserId = ctx.user?.id;
  if (!sessionUserId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required to access recommendations.",
    });
  }

  const profile =
    await candidateProfileService.getProfile(sessionUserId);
  if (!profile) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Candidate profile not found. Please complete profile creation.",
    });
  }

  assertCandidateIdentity(input, sessionUserId, profile.id);
  return profile;
}

export const learningRouter = router({
  /**
   * Retrieves recommendations for the authenticated candidate.
   * Auto-generates initial recommendations if none currently exist.
   */
  getRecommendations: protectedProcedure
    .input(getRecommendationsInputSchema.optional())
    .query(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(ctx, input);

      let recs = await learningRepository.getRecommendations(profile.id, {
        status: input?.status ?? "ACTIVE",
        type: input?.type,
        limit: input?.limit ?? 20,
      });

      // If no active recommendations exist, attempt initial generation
      if (recs.length === 0 && (!input?.status || input.status === "ACTIVE")) {
        const generated = await recommendationAgent.generateRecommendations(profile.id);
        if (generated.length > 0) {
          recs = await learningRepository.saveRecommendationsIdempotent(
            profile.id,
            generated.map((g) => ({
              type: g.type,
              targetKey: `${g.evidence.dimension}:${g.evidence.primaryValue}`,
              title: g.title,
              summary: g.summary,
              explanation: g.explanation,
              confidence: g.confidence,
              evidence: g.evidence,
            }))
          );
        }
      }

      return recs;
    }),

  /**
   * Retrieves a single recommendation by ID.
   */
  getRecommendation: protectedProcedure
    .input(getRecommendationInputSchema)
    .query(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(ctx, input);
      const rec = await learningRepository.getRecommendationById(profile.id, input.id);
      if (!rec) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Recommendation not found.",
        });
      }
      return rec;
    }),

  /**
   * Dismisses a recommendation (moves to DISMISSED status).
   */
  dismiss: protectedProcedure
    .input(dismissRecommendationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(ctx, input);
      const updated = await learningRepository.dismissRecommendation(profile.id, input.id);
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Recommendation not found or cannot be dismissed.",
        });
      }
      return updated;
    }),

  /**
   * Acknowledges or applies a recommendation (moves to APPLIED status).
   */
  acknowledge: protectedProcedure
    .input(applyRecommendationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(ctx, input);
      const updated = await learningRepository.applyRecommendation(profile.id, input.id);
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Recommendation not found or cannot be applied.",
        });
      }
      return updated;
    }),

  /**
   * Refreshes / recalculates recommendations from current application outcomes.
   */
  refresh: protectedProcedure
    .input(refreshRecommendationsInputSchema.optional())
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveCandidateProfile(ctx, input);

      const generated = await recommendationAgent.generateRecommendations(profile.id);

      if (generated.length === 0) {
        return [];
      }

      const saved = await learningRepository.saveRecommendationsIdempotent(
        profile.id,
        generated.map((g) => ({
          type: g.type,
          targetKey: `${g.evidence.dimension}:${g.evidence.primaryValue}`,
          title: g.title,
          summary: g.summary,
          explanation: g.explanation,
          confidence: g.confidence,
          evidence: g.evidence,
        }))
      );

      return saved;
    }),
});
