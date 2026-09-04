/**
 * Job Hub — Phase 10 / Step 10.1
 * Learning Types & Validation Test Suite
 *
 * Verifies domain models, Zod validation schemas, and invariants:
 * 1. Schema Validation for recommendation types, statuses, confidence levels.
 * 2. Evidence metric structures with safe nullable rates and disclosures.
 * 3. Recommendation entity validation.
 * 4. Input schemas and anti-spoofing rejection rules.
 * 5. Candidate Truth Protection: Zero schemas allow mutation to profile facts.
 * 6. AI explanation structured output validation.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  recommendationTypeSchema,
  recommendationStatusSchema,
  confidenceLevelSchema,
  outcomeDimensionSchema,
  evidenceMetricSchema,
  outcomeEvidenceSchema,
  recommendationSchema,
  getRecommendationsInputSchema,
  dismissRecommendationInputSchema,
  applyRecommendationInputSchema,
  refreshRecommendationsInputSchema,
  aiRecommendationExplanationSchema,
} from "../packages/applications/src/learning/validation";

test("Phase 10 / Step 10.1 — Learning Domain Types & Validation Suite", async (t) => {
  await t.test("1. Enums: Validates allowed recommendation types, statuses, and confidence levels", () => {
    // Recommendation types
    const validTypes = [
      "ROLE_FOCUS",
      "SOURCE_FOCUS",
      "MATCH_SCORE_BAND",
      "RESUME_VERSION",
      "SKILL_INSIGHT",
    ];
    for (const type of validTypes) {
      assert.equal(recommendationTypeSchema.parse(type), type);
    }
    assert.throws(() => recommendationTypeSchema.parse("INVALID_TYPE"));

    // Statuses
    const validStatuses = ["ACTIVE", "DISMISSED", "APPLIED"];
    for (const status of validStatuses) {
      assert.equal(recommendationStatusSchema.parse(status), status);
    }
    assert.throws(() => recommendationStatusSchema.parse("DELETED"));

    // Confidence levels
    const validConfidence = ["HIGH", "MEDIUM", "LOW_CONFIDENCE"];
    for (const conf of validConfidence) {
      assert.equal(confidenceLevelSchema.parse(conf), conf);
    }
    assert.throws(() => confidenceLevelSchema.parse("CERTAIN"));

    // Dimensions
    const validDimensions = ["role", "source", "match_score_band", "resume_version", "skill"];
    for (const dim of validDimensions) {
      assert.equal(outcomeDimensionSchema.parse(dim), dim);
    }
    assert.throws(() => outcomeDimensionSchema.parse("unknown_dimension"));
  });

  await t.test("2. Evidence Metrics: Validates non-negative counts and nullable rates", () => {
    // Valid metric with rates
    const validMetric = {
      applications: 20,
      interviews: 6,
      offers: 1,
      rejections: 10,
      interviewRate: 0.3,
      offerRate: 0.05,
      responseRate: 0.85,
      averageMatchScore: 84.5,
      disclosureText: "6 of 20 applications (30.0%)",
    };
    const parsed = evidenceMetricSchema.parse(validMetric);
    assert.equal(parsed.applications, 20);
    assert.equal(parsed.interviewRate, 0.3);

    // Valid metric with null rates (0 denominator safe handling)
    const zeroDenominatorMetric = {
      applications: 0,
      interviews: 0,
      offers: 0,
      rejections: 0,
      interviewRate: null,
      offerRate: null,
      responseRate: null,
      averageMatchScore: null,
      disclosureText: "0 of 0 (No data)",
    };
    const parsedZero = evidenceMetricSchema.parse(zeroDenominatorMetric);
    assert.equal(parsedZero.interviewRate, null);
    assert.equal(parsedZero.averageMatchScore, null);

    // Negative counts rejected
    assert.throws(() =>
      evidenceMetricSchema.parse({
        ...validMetric,
        applications: -1,
      })
    );

    // Rate > 1.0 rejected
    assert.throws(() =>
      evidenceMetricSchema.parse({
        ...validMetric,
        interviewRate: 1.5,
      })
    );
  });

  await t.test("3. Outcome Evidence: Validates primary and comparison cohorts", () => {
    const validEvidence = {
      dimension: "role" as const,
      primaryValue: "AI Full-Stack",
      primaryMetric: {
        applications: 20,
        interviews: 6,
        offers: 1,
        rejections: 8,
        interviewRate: 0.3,
        offerRate: 0.05,
        responseRate: 0.75,
        averageMatchScore: 88.0,
        disclosureText: "6 of 20 applications (30.0%)",
      },
      comparisonValue: "Frontend-only",
      comparisonMetric: {
        applications: 20,
        interviews: 1,
        offers: 0,
        rejections: 15,
        interviewRate: 0.05,
        offerRate: 0,
        responseRate: 0.8,
        averageMatchScore: 74.0,
        disclosureText: "1 of 20 applications (5.0%)",
      },
      sampleSize: 40,
      minSampleSizeThreshold: 5,
      isStatisticallyMeaningful: true,
      explanation: "AI Full-Stack roles observed 30.0% interview rate vs 5.0% for Frontend-only roles.",
    };

    const parsed = outcomeEvidenceSchema.parse(validEvidence);
    assert.equal(parsed.dimension, "role");
    assert.equal(parsed.sampleSize, 40);
    assert.equal(parsed.isStatisticallyMeaningful, true);

    // Missing primary value rejected
    assert.throws(() =>
      outcomeEvidenceSchema.parse({
        ...validEvidence,
        primaryValue: "",
      })
    );
  });

  await t.test("4. Full Recommendation Entity: Validates complete recommendation object", () => {
    const validRec = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      candidateProfileId: "cand_prof_123",
      type: "ROLE_FOCUS" as const,
      title: "Focus on AI Full-Stack Roles",
      summary: "AI Full-Stack roles are currently producing higher interview conversion than frontend roles.",
      explanation: "Based on 20 applications to AI Full-Stack roles, 6 interviews resulted (30.0%), compared to 1 of 20 (5.0%) for frontend roles.",
      confidence: "HIGH" as const,
      evidence: {
        dimension: "role" as const,
        primaryValue: "AI Full-Stack",
        primaryMetric: {
          applications: 20,
          interviews: 6,
          offers: 1,
          rejections: 8,
          interviewRate: 0.3,
          offerRate: 0.05,
          responseRate: 0.75,
          averageMatchScore: 88.0,
          disclosureText: "6 of 20 applications (30.0%)",
        },
        sampleSize: 20,
        minSampleSizeThreshold: 5,
        isStatisticallyMeaningful: true,
        explanation: "AI Full-Stack roles have produced stronger interview rates in your observed applications.",
      },
      status: "ACTIVE" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = recommendationSchema.parse(validRec);
    assert.equal(parsed.id, "123e4567-e89b-12d3-a456-426614174000");
    assert.equal(parsed.confidence, "HIGH");
    assert.equal(parsed.status, "ACTIVE");

    // Invalid UUID rejected
    assert.throws(() =>
      recommendationSchema.parse({
        ...validRec,
        id: "invalid-uuid-string",
      })
    );
  });

  await t.test("5. Action & Query Input Schemas: Validates limits and action inputs", () => {
    // getRecommendationsInputSchema
    const parsedQuery = getRecommendationsInputSchema.parse({
      status: "ACTIVE",
      type: "ROLE_FOCUS",
      limit: 15,
    });
    assert.equal(parsedQuery.limit, 15);
    assert.equal(parsedQuery.status, "ACTIVE");

    // Limit out of bounds rejected
    assert.throws(() =>
      getRecommendationsInputSchema.parse({
        limit: 100, // max is 50
      })
    );

    // dismissRecommendationInputSchema
    const parsedDismiss = dismissRecommendationInputSchema.parse({
      id: "123e4567-e89b-12d3-a456-426614174000",
    });
    assert.equal(parsedDismiss.id, "123e4567-e89b-12d3-a456-426614174000");

    // applyRecommendationInputSchema
    const parsedApply = applyRecommendationInputSchema.parse({
      id: "123e4567-e89b-12d3-a456-426614174000",
    });
    assert.equal(parsedApply.id, "123e4567-e89b-12d3-a456-426614174000");

    // refreshRecommendationsInputSchema
    const parsedRefresh = refreshRecommendationsInputSchema.parse({
      force: true,
    });
    assert.equal(parsedRefresh.force, true);
  });

  await t.test("6. Invariant: Candidate Truth Protection (Zero Profile Mutation Allowed)", () => {
    // Verify that none of the learning input schemas allow passing or mutating profile fields
    const forbiddenFields = [
      "skills",
      "headline",
      "bio",
      "experience",
      "education",
      "workAuthorization",
      "masterResume",
    ];

    for (const field of forbiddenFields) {
      assert.throws(
        () =>
          getRecommendationsInputSchema.parse({
            [field]: "hacked",
          }),
        /unrecognized_keys/,
        `Schema must reject unauthorized profile field: ${field}`
      );
      assert.throws(
        () =>
          dismissRecommendationInputSchema.parse({
            id: "123e4567-e89b-12d3-a456-426614174000",
            [field]: "hacked",
          }),
        /unrecognized_keys/,
        `Schema must reject unauthorized profile field: ${field}`
      );
      assert.throws(
        () =>
          applyRecommendationInputSchema.parse({
            id: "123e4567-e89b-12d3-a456-426614174000",
            [field]: "hacked",
          }),
        /unrecognized_keys/,
        `Schema must reject unauthorized profile field: ${field}`
      );
    }
  });

  await t.test("7. AI Explanation Structured Output Schema: Enforces valid copy boundaries", () => {
    const validAiOutput = {
      title: "Target AI Full-Stack Roles",
      summary: "AI Full-Stack roles are converting to interviews at 30.0% compared to 5.0% for frontend roles.",
      explanation: "Observational analysis indicates a strong response rate for AI-integrated positions. Consider continuing to prioritize these listings while tailoring project highlights to AI workflows.",
      actionableTip: "Prioritize matches with AI Full-Stack titles when saving or preparing applications.",
    };

    const parsed = aiRecommendationExplanationSchema.parse(validAiOutput);
    assert.equal(parsed.title, "Target AI Full-Stack Roles");

    // Excessively short title rejected
    assert.throws(() =>
      aiRecommendationExplanationSchema.parse({
        ...validAiOutput,
        title: "AI",
      })
    );
  });
});
