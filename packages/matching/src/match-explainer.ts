/**
 * Job Hub — Phase 4 / Step 4.4
 * AI Semantic Evaluation / Match Explainer
 *
 * Architecture:
 * matching domain -> generic AiProvider (@job-hub/ai) -> OpenAiProvider (or MockAiProvider in tests)
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 7
 * - 03_tech_stack.md §6
 * - 04_ai_agent_skills.md §9, §10, §21, §23
 */

import { z } from "zod";
import type { AiProvider } from "@job-hub/ai";
import { AiProviderError } from "@job-hub/ai";
import type {
  CandidateMatchData,
  JobMatchData,
  CategoryScores,
  ScoringWeights,
  HardConstraintResult,
  MatchDecision,
  MatchExplanation,
} from "./types";
import {
  MATCH_EXPLAINER_SYSTEM_PROMPT,
  buildMatchExplainerUserPrompt,
} from "./prompts";
import { JobMatchValidationError, JobMatchError } from "./errors";

/**
 * Strict Zod schema for structured output from the AI provider.
 */
export const matchExplainerOutputSchema = z
  .object({
    strengths: z
      .array(z.string().min(1, "Strength item cannot be empty"))
      .min(1, "At least one strength must be documented"),
    gaps: z.array(z.string().min(1, "Gap item cannot be empty")),
    risks: z.array(z.string().min(1, "Risk item cannot be empty")),
    explanation: z.string().min(10, "Explanation must provide a descriptive rationale"),
    confidence: z
      .number()
      .min(0, "Confidence must be >= 0.00")
      .max(1, "Confidence must be <= 1.00"),
  })
  .strict();

export type MatchExplainerOutput = z.infer<typeof matchExplainerOutputSchema>;

export class MatchExplainer {
  constructor(private readonly aiProvider: AiProvider) {}

  async explain(params: {
    candidate: CandidateMatchData;
    job: JobMatchData;
    hardConstraints: HardConstraintResult;
    overallScore: number;
    decision: MatchDecision;
    categoryScores: CategoryScores;
    weights: ScoringWeights;
  }): Promise<MatchExplanation> {
    const userPrompt = buildMatchExplainerUserPrompt(params);

    try {
      const output = await this.aiProvider.generateStructuredOutput<MatchExplainerOutput>({
        systemPrompt: MATCH_EXPLAINER_SYSTEM_PROMPT,
        userPrompt,
        schema: matchExplainerOutputSchema,
        schemaName: "MatchExplanation",
        temperature: 0.1, // Low temperature for factual fidelity
      });

      return {
        strengths: output.strengths,
        gaps: output.gaps,
        risks: output.risks,
        explanation: output.explanation,
        confidence: output.confidence,
      };
    } catch (error: unknown) {
      if (error instanceof AiProviderError) {
        throw new JobMatchValidationError(
          `AI semantic match explanation failed: ${error.message}`
        );
      }
      if (error instanceof z.ZodError) {
        throw new JobMatchValidationError(
          `AI returned malformed match explanation schema: ${error.message}`
        );
      }
      throw new JobMatchError(
        `Unexpected error during match explanation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
