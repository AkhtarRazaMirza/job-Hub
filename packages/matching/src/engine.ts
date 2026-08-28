/**
 * Job Hub — Phase 4 / Steps 4.2 + 4.3 + 4.4
 * Matching Engine Orchestrator
 *
 * Orchestrates:
 * 1. Step 4.2: Deterministic Hard-Constraint Evaluation
 * 2. Step 4.3: Deterministic Seven-Factor Weighted Scoring
 * 3. Step 4.4: AI Semantic Evaluation & Structured Explainer
 *
 * In-memory orchestration boundary. Pure and decoupled from storage/Inngest/tRPC.
 */

import type { AiProvider } from "@job-hub/ai";
import type {
  EvaluateMatchInput,
  MatchEvaluationResult,
  MatchExplanation,
} from "./types";
import { evaluateHardConstraints } from "./hard-constraints";
import { calculateMatchScores } from "./scoring-engine";
import { MatchExplainer } from "./match-explainer";

export interface MatchingEngineOptions {
  aiProvider?: AiProvider;
  referenceDate?: Date;
}

export class MatchingEngine {
  private readonly explainer?: MatchExplainer;
  private readonly referenceDate?: Date;

  constructor(options?: MatchingEngineOptions) {
    if (options?.aiProvider) {
      this.explainer = new MatchExplainer(options.aiProvider);
    }
    this.referenceDate = options?.referenceDate;
  }

  /**
   * Evaluates a candidate-job opportunity end-to-end.
   */
  async evaluate(
    input: EvaluateMatchInput,
    overrideOptions?: { aiProvider?: AiProvider; referenceDate?: Date }
  ): Promise<MatchEvaluationResult> {
    const { candidate, job, weights } = input;
    const refDate = overrideOptions?.referenceDate ?? this.referenceDate ?? new Date();

    // 1. Step 4.2: Pure Deterministic Hard Constraint Evaluation
    const hardConstraints = evaluateHardConstraints(candidate, job, refDate);

    // 2. Step 4.3: Pure Deterministic Seven-Factor Weighted Scoring
    const scoreResult = calculateMatchScores(
      candidate,
      job,
      hardConstraints,
      weights,
      refDate
    );

    // 3. Step 4.4: AI Semantic Evaluation / Explanation
    const explainer = overrideOptions?.aiProvider
      ? new MatchExplainer(overrideOptions.aiProvider)
      : this.explainer;

    let explanation: MatchExplanation;

    if (!hardConstraints.passed) {
      // Non-negotiable AI rule: hard constraints override score and disqualify match.
      // Generates an audit explanation detailing the exact disqualifying constraint.
      explanation = {
        strengths: ["Candidate profile evaluated against job opportunity"],
        gaps: hardConstraints.failures,
        risks: hardConstraints.failures,
        explanation: `Match disqualified by hard constraint: ${hardConstraints.failures.join(" ")}`,
        confidence: 1.0,
      };
    } else if (explainer) {
      explanation = await explainer.explain({
        candidate,
        job,
        hardConstraints,
        overallScore: scoreResult.overallScore,
        decision: scoreResult.decision,
        categoryScores: scoreResult.categoryScores,
        weights: scoreResult.weightsUsed,
      });
    } else {
      // Deterministic baseline explanation when running offline without AI provider
      explanation = {
        strengths: ["Evaluated against canonical role requirements"],
        gaps: [],
        risks: [],
        explanation: `Deterministic match evaluation completed with score ${scoreResult.overallScore.toFixed(2)}/10.00 (${scoreResult.decision}).`,
        confidence: 0.85,
      };
    }

    return {
      overallScore: scoreResult.overallScore,
      decision: scoreResult.decision,
      hardConstraints,
      categoryScores: scoreResult.categoryScores,
      strengths: explanation.strengths,
      gaps: explanation.gaps,
      risks: explanation.risks,
      explanation: explanation.explanation,
      confidence: explanation.confidence,
      weightsUsed: scoreResult.weightsUsed,
    };
  }
}
