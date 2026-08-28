/**
 * Job Hub — Phase 4 / Step 4.1
 * Matching Domain Zod Validation Schemas
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 7
 * - 02_how_to_build.md §8 & §9
 * - 04_ai_agent_skills.md §9, §10 & §23
 */

import { z } from "zod";
import { DEFAULT_SCORING_WEIGHTS } from "./types";

/**
 * Strict schema for MatchDecision enum.
 * Grounded in 04_ai_agent_skills.md §10.
 */
export const matchDecisionSchema = z.enum([
  "SKIP",
  "REVIEW",
  "STRONG_MATCH",
  "EXCELLENT_MATCH",
]);

/**
 * Strict schema for individual category scores (normalized 0.00 to 1.00).
 */
export const categoryScoresSchema = z
  .object({
    skillsScore: z.number().min(0, "Skills score cannot be negative").max(1, "Skills score cannot exceed 1.0"),
    experienceScore: z.number().min(0, "Experience score cannot be negative").max(1, "Experience score cannot exceed 1.0"),
    remoteLocationScore: z.number().min(0, "Remote/Location score cannot be negative").max(1, "Remote/Location score cannot exceed 1.0"),
    projectsScore: z.number().min(0, "Projects score cannot be negative").max(1, "Projects score cannot exceed 1.0"),
    educationScore: z.number().min(0, "Education score cannot be negative").max(1, "Education score cannot exceed 1.0"),
    salaryScore: z.number().min(0, "Salary score cannot be negative").max(1, "Salary score cannot exceed 1.0"),
    freshnessScore: z.number().min(0, "Freshness score cannot be negative").max(1, "Freshness score cannot exceed 1.0"),
  })
  .strict();

/**
 * Strict schema for scoring weights.
 * Grounded in 02_how_to_build.md §9.
 * Must sum to 1.0 (100%).
 */
export const scoringWeightsSchema = z
  .object({
    skills: z.number().min(0).max(1),
    experience: z.number().min(0).max(1),
    remoteLocation: z.number().min(0).max(1),
    projects: z.number().min(0).max(1),
    education: z.number().min(0).max(1),
    salary: z.number().min(0).max(1),
    freshness: z.number().min(0).max(1),
  })
  .strict()
  .refine(
    (w) => {
      const sum =
        w.skills +
        w.experience +
        w.remoteLocation +
        w.projects +
        w.education +
        w.salary +
        w.freshness;
      return Math.abs(sum - 1.0) < 0.01;
    },
    { message: "Scoring weights must sum to 1.0 (100%)" }
  );

/**
 * Strict schema for evaluating a candidate-job match.
 */
export const evaluateMatchInputSchema = z
  .object({
    candidateProfileId: z.string().min(1, "Candidate profile ID is required"),
    jobId: z.string().min(1, "Job ID is required"),
    weights: scoringWeightsSchema.optional(),
  })
  .strict();

/**
 * Strict schema for creating / persisting a JobMatch.
 */
export const createJobMatchInputSchema = z
  .object({
    id: z.string().optional(),
    candidateProfileId: z.string().min(1, "Candidate profile ID is required"),
    jobId: z.string().min(1, "Job ID is required"),
    overallScore: z
      .number()
      .min(0, "Overall score must be >= 0.00")
      .max(10, "Overall score must be <= 10.00"),
    decision: matchDecisionSchema,
    hardConstraintsPassed: z.boolean(),
    hardConstraintFailures: z.array(z.string()).optional().default([]),
    categoryScores: categoryScoresSchema,
    strengths: z.array(z.string()).optional().default([]),
    gaps: z.array(z.string()).optional().default([]),
    risks: z.array(z.string()).optional().default([]),
    explanation: z.string().min(1, "Explanation must not be empty"),
    confidence: z
      .number()
      .min(0, "Confidence must be >= 0.00")
      .max(1, "Confidence must be <= 1.00"),
    weightsUsed: scoringWeightsSchema.optional().default(DEFAULT_SCORING_WEIGHTS),
  })
  .strict();

/**
 * Strict schema for validating a complete persisted JobMatch entity.
 */
export const jobMatchSchema = z
  .object({
    id: z.string().min(1),
    candidateProfileId: z.string().min(1),
    jobId: z.string().min(1),
    overallScore: z.number().min(0).max(10),
    decision: matchDecisionSchema,
    hardConstraintsPassed: z.boolean(),
    hardConstraintFailures: z.array(z.string()),
    categoryScores: categoryScoresSchema,
    strengths: z.array(z.string()),
    gaps: z.array(z.string()),
    risks: z.array(z.string()),
    explanation: z.string().min(1),
    confidence: z.number().min(0).max(1),
    weightsUsed: scoringWeightsSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

export { z };
