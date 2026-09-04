/**
 * Job Hub — Phase 10 / Step 10.7
 * Durable Learning Workflow Function (Inngest)
 *
 * Implements resilient background recalculation of candidate recommendations
 * based on observed application outcomes.
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 10 ("Learning")
 * - 02_how_to_build.md §16 ("Learning engine")
 * - 03_tech_stack.md §4 ("Inngest for background workflows")
 *
 * Invariants Enforced:
 * 1. Idempotency: Duplicate triggers do not produce duplicate active recommendations.
 * 2. Candidate Isolation: Workflow runs strictly scoped to candidateProfileId.
 * 3. Failure Safety: Any error terminates cleanly without corrupting candidate profile.
 * 4. Deterministic First: Outcome analysis and pattern detection precede recommendations.
 */

import { inngest } from "../client";
import {
  outcomeAnalyzer,
  patternDetector,
  learningRepository,
} from "@job-hub/applications/server";
import { db, candidateProfiles, eq } from "@job-hub/db";

export const learningRefreshFunction = inngest.createFunction(
  {
    id: "learning-refresh-workflow",
    name: "Learning: Refresh Candidate Recommendations",
    retries: 2,
    triggers: [{ event: "learning/refresh.requested" }],
    concurrency: {
      limit: 1,
      key: "event.data.candidateProfileId",
    },
  },
  async ({ event, step }) => {
    const { candidateProfileId } = event.data;

    // Step 1: Verify Candidate Profile
    const profile = await step.run("verify-candidate-profile", async () => {
      const [p] = await db
        .select()
        .from(candidateProfiles)
        .where(eq(candidateProfiles.id, candidateProfileId));
      if (!p) {
        throw new Error(`Candidate profile not found: ${candidateProfileId}`);
      }
      return { id: p.id, headline: p.headline };
    });

    // Step 2: Compute Outcome Cohorts
    const cohorts = await step.run("aggregate-outcomes", async () => {
      return await outcomeAnalyzer.analyzeCandidateOutcomes(profile.id);
    });

    // Step 3: Detect Statistically Grounded Patterns
    const patterns = await step.run("detect-patterns", async () => {
      return patternDetector.detectPatterns(cohorts);
    });

    // Step 4: Persist Recommendations Idempotently
    const saved = await step.run("persist-recommendations", async () => {
      if (patterns.length === 0) {
        return { count: 0, recommendations: [] };
      }

      const inputs = patterns.map((p) => ({
        type: p.type,
        targetKey: p.targetKey,
        title: p.title,
        summary: p.summary,
        explanation: p.explanation,
        confidence: p.confidence,
        evidence: p.evidence,
      }));

      const results = await learningRepository.saveRecommendationsIdempotent(
        profile.id,
        inputs
      );

      return {
        count: results.length,
        recommendations: results.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          confidence: r.confidence,
        })),
      };
    });

    return {
      status: "COMPLETED",
      candidateProfileId: profile.id,
      totalApplications: cohorts.totalApplications,
      patternsDetected: patterns.length,
      recommendationsSaved: saved.count,
    };
  }
);
