/**
 * Job Hub — Phase 10 / Step 10.4
 * Recommendation Agent Service
 *
 * Implements RecommendationAgent as a deterministic service around structured data.
 * Transforms detected outcome patterns into evidence-grounded recommendations
 * with optional AI natural-language explanation enhancement.
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 10 ("Learning")
 * - 02_how_to_build.md §16 ("Learning engine")
 * - 04_ai_agent_skills.md §20 ("Learning Skill") & §21 ("RecommendationAgent")
 *
 * Invariants Enforced:
 * 1. Deterministic Foundation: Numerical metrics and confidence originate strictly from calculations.
 * 2. AI Safety Boundary: AI output is strictly Zod-validated text explanations only.
 * 3. Candidate Truth Protection: Zero ability to mutate candidate profile, skills, or master resume.
 * 4. Auditable & Reproducible: Evidence snapshots remain attached to each recommendation.
 * 5. Non-Causal Phrasing: Language reflects observed correlation, never causation.
 */

import crypto from "node:crypto";
import type { Database } from "@job-hub/db";
import { db } from "@job-hub/db";
import type { AiProvider } from "@job-hub/ai";
import { OutcomeAnalyzer } from "./analyzer";
import { PatternDetector } from "./pattern-detector";
import type {
  Recommendation,
  DetectedPattern,
} from "./types";
import {
  recommendationSchema,
  aiRecommendationExplanationSchema,
} from "./validation";

export interface RecommendationAgentOptions {
  database?: Database;
  outcomeAnalyzer?: OutcomeAnalyzer;
  patternDetector?: PatternDetector;
  aiProvider?: AiProvider;
}

export class RecommendationAgent {
  private readonly database: Database;
  private readonly outcomeAnalyzer: OutcomeAnalyzer;
  private readonly patternDetector: PatternDetector;
  private readonly aiProvider?: AiProvider;

  constructor(options: RecommendationAgentOptions = {}) {
    this.database = options.database ?? db;
    this.outcomeAnalyzer =
      options.outcomeAnalyzer ?? new OutcomeAnalyzer(this.database);
    this.patternDetector = options.patternDetector ?? new PatternDetector();
    this.aiProvider = options.aiProvider;
  }

  /**
   * Generates evidence-backed recommendations for a candidate based on actual application outcomes.
   * Deterministic first: metrics are computed, patterns detected, and recommendations constructed.
   */
  async generateRecommendations(
    candidateProfileId: string,
    options: { enhanceWithAi?: boolean } = {}
  ): Promise<Recommendation[]> {
    // 1. Compute multi-dimensional outcome cohorts
    const cohorts = await this.outcomeAnalyzer.analyzeCandidateOutcomes(candidateProfileId);

    // 2. Detect statistically grounded patterns
    const patterns = this.patternDetector.detectPatterns(cohorts);

    // 3. Map patterns into formal Recommendation entities
    const recommendations: Recommendation[] = [];

    for (const pattern of patterns) {
      let rec: Recommendation = {
        id: crypto.randomUUID(),
        candidateProfileId,
        type: pattern.type,
        title: pattern.title,
        summary: pattern.summary,
        explanation: pattern.explanation,
        confidence: pattern.confidence,
        evidence: pattern.evidence,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 4. Optional AI natural-language explanation refinement
      if (options.enhanceWithAi && this.aiProvider) {
        rec = await this.enhanceExplanation(rec);
      }

      // 5. Validate final structure against domain schema
      const validated = recommendationSchema.parse(rec);
      recommendations.push(validated as Recommendation);
    }

    return recommendations;
  }

  /**
   * Refines the natural-language presentation of a recommendation using AI structured outputs.
   * Note: The underlying evidence, metrics, and confidence CANNOT be altered by AI.
   */
  private async enhanceExplanation(recommendation: Recommendation): Promise<Recommendation> {
    if (!this.aiProvider) return recommendation;

    const evidence = recommendation.evidence;
    const systemPrompt = `You are the RecommendationAgent for Job Hub.
Your role is to explain evidence-backed application outcome patterns to a job candidate clearly, honestly, and objectively.
CRITICAL RULES:
1. Ground your explanation STRICTLY in the provided evidence numbers.
2. NEVER use causal language (do not say a role or source "causes" interviews or offers). Use phrases like "has observed higher interview rates" or "has produced stronger results in your applications".
3. NEVER invent candidate skills, experiences, or credentials.
4. Keep explanations concise, professional, and actionable.`;

    const userPrompt = `Recommendation Type: ${recommendation.type}
Primary Dimension: ${evidence.dimension} (${evidence.primaryValue})
Primary Metric: ${evidence.primaryMetric.disclosureText}
Comparison Cohort: ${evidence.comparisonValue ?? "General Baseline"} (${evidence.comparisonMetric?.disclosureText ?? "N/A"})
Total Sample Size: ${evidence.sampleSize} applications
Confidence: ${recommendation.confidence}

Generate an objective, evidence-grounded title, summary, explanation, and actionable tip.`;

    try {
      const structured = await this.aiProvider.generateStructuredOutput({
        systemPrompt,
        userPrompt,
        schema: aiRecommendationExplanationSchema,
        schemaName: "AiRecommendationExplanation",
        temperature: 0.2, // Low temperature for factual consistency
        timeoutMs: 8000,
      });

      return {
        ...recommendation,
        title: structured.title,
        summary: structured.summary,
        explanation: `${structured.explanation} Actionable suggestion: ${structured.actionableTip}`,
      };
    } catch {
      // Fallback cleanly to deterministic text on any AI failure or timeout
      return recommendation;
    }
  }
}
