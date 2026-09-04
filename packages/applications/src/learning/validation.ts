/**
 * Job Hub — Phase 10 / Step 10.1
 * Learning Validation Schemas (Zod)
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 10 ("Learning")
 * - 02_how_to_build.md §16 ("Learning engine")
 * - 03_tech_stack.md §4 ("Zod for runtime validation")
 * - 04_ai_agent_skills.md §20 & §21
 *
 * Invariants Enforced:
 * 1. Read-Only Candidate Truth: Learning schemas NEVER accept mutations to candidate profile,
 *    identity, verified skills, work authorization, or master resume.
 * 2. Strict Input Validation: Rejects client-spoofed foreign identifiers.
 * 3. AI Safety Boundary: AI output schemas enforce strict structured schemas.
 */

import { z } from "zod";

/**
 * Recommendation Type enum schema.
 */
export const recommendationTypeSchema = z.enum([
  "ROLE_FOCUS",
  "SOURCE_FOCUS",
  "MATCH_SCORE_BAND",
  "RESUME_VERSION",
  "SKILL_INSIGHT",
]);

/**
 * Recommendation Lifecycle Status enum schema.
 */
export const recommendationStatusSchema = z.enum([
  "ACTIVE",
  "DISMISSED",
  "APPLIED",
]);

/**
 * Confidence Level enum schema.
 */
export const confidenceLevelSchema = z.enum([
  "HIGH",
  "MEDIUM",
  "LOW_CONFIDENCE",
]);

/**
 * Outcome dimension enum schema.
 */
export const outcomeDimensionSchema = z.enum([
  "role",
  "source",
  "match_score_band",
  "resume_version",
  "skill",
]);

/**
 * Metric numbers schema with safe nullable rates.
 */
export const evidenceMetricSchema = z.object({
  applications: z.number().int().nonnegative(),
  interviews: z.number().int().nonnegative(),
  offers: z.number().int().nonnegative(),
  rejections: z.number().int().nonnegative(),
  interviewRate: z.number().min(0).max(1).nullable(),
  offerRate: z.number().min(0).max(1).nullable(),
  responseRate: z.number().min(0).max(1).nullable(),
  averageMatchScore: z.number().min(0).max(100).nullable(),
  disclosureText: z.string().min(1),
});

/**
 * Traceable outcome evidence schema.
 */
export const outcomeEvidenceSchema = z.object({
  dimension: outcomeDimensionSchema,
  primaryValue: z.string().min(1),
  primaryMetric: evidenceMetricSchema,
  comparisonValue: z.string().nullable().optional(),
  comparisonMetric: evidenceMetricSchema.nullable().optional(),
  sampleSize: z.number().int().nonnegative(),
  minSampleSizeThreshold: z.number().int().positive(),
  isStatisticallyMeaningful: z.boolean(),
  explanation: z.string().min(1),
});

/**
 * Full domain recommendation schema.
 */
export const recommendationSchema = z.object({
  id: z.string().uuid(),
  candidateProfileId: z.string().min(1),
  type: recommendationTypeSchema,
  title: z.string().min(3).max(200),
  summary: z.string().min(5).max(500),
  explanation: z.string().min(10).max(2000),
  confidence: confidenceLevelSchema,
  evidence: outcomeEvidenceSchema,
  status: recommendationStatusSchema,
  dismissedAt: z.union([z.date(), z.string()]).nullable().optional(),
  appliedAt: z.union([z.date(), z.string()]).nullable().optional(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
});

/**
 * Input schema for fetching candidate recommendations.
 * Anti-Spoofing: Client-supplied candidateProfileId or userId is strictly forbidden.
 */
export const getRecommendationsInputSchema = z
  .object({
    status: recommendationStatusSchema.optional(),
    type: recommendationTypeSchema.optional(),
    limit: z.number().int().min(1).max(50).default(10),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

/**
 * Input schema for retrieving a single recommendation by ID.
 */
export const getRecommendationInputSchema = z
  .object({
    id: z.string().uuid("Recommendation ID must be a valid UUID"),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

/**
 * Input schema for dismissing a recommendation.
 */
export const dismissRecommendationInputSchema = z
  .object({
    id: z.string().uuid("Recommendation ID must be a valid UUID"),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

/**
 * Input schema for applying/acknowledging a recommendation.
 */
export const applyRecommendationInputSchema = z
  .object({
    id: z.string().uuid("Recommendation ID must be a valid UUID"),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

/**
 * Input schema for triggering a recommendation refresh.
 */
export const refreshRecommendationsInputSchema = z
  .object({
    force: z.boolean().default(false),
    candidateProfileId: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

/**
 * AI Structured Output Schema for generating natural-language explanations
 * around already-calculated deterministic evidence.
 * AI cannot invent numbers or alter candidate facts.
 */
export const aiRecommendationExplanationSchema = z.object({
  title: z.string().min(5).max(120),
  summary: z.string().min(10).max(300),
  explanation: z.string().min(20).max(1000),
  actionableTip: z.string().min(10).max(300),
});

export type RecommendationTypeInput = z.infer<typeof recommendationTypeSchema>;
export type RecommendationStatusInput = z.infer<typeof recommendationStatusSchema>;
export type ConfidenceLevelInput = z.infer<typeof confidenceLevelSchema>;
export type EvidenceMetricInput = z.infer<typeof evidenceMetricSchema>;
export type OutcomeEvidenceInput = z.infer<typeof outcomeEvidenceSchema>;
export type RecommendationInput = z.infer<typeof recommendationSchema>;
export type GetRecommendationsInput = z.infer<typeof getRecommendationsInputSchema>;
export type DismissRecommendationInput = z.infer<typeof dismissRecommendationInputSchema>;
export type ApplyRecommendationInput = z.infer<typeof applyRecommendationInputSchema>;
export type RefreshRecommendationsInput = z.infer<typeof refreshRecommendationsInputSchema>;
export type AiRecommendationExplanation = z.infer<typeof aiRecommendationExplanationSchema>;
