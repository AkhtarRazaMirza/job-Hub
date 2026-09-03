/**
 * Job Hub — Phase 7 / Step 7.1
 * AI Resume Tailoring Service
 *
 * Implements architectural pipeline:
 * Evidence collection
 *         ↓
 * Deterministic constraints
 *         ↓
 * AI structured output
 *         ↓
 * Zod validation
 *         ↓
 * Truthfulness/evidence validation
 *         ↓
 * Return validated tailored resume
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 9 ("Application preparation")
 * - 02_how_to_build.md §11 ("Resume tailoring")
 * - 04_ai_agent_skills.md §11 ("Resume Tailoring Skill") & §21 ("ResumeTailor")
 */

import type { AiProvider } from "@job-hub/ai";
import { defaultAiProvider } from "@job-hub/ai";
import type {
  TailorResumeInput,
  TailoredResumeData,
  TruthfulnessValidationResult,
} from "./types";
import { tailoredResumeDataSchema } from "./validation";
import {
  RESUME_TAILOR_SYSTEM_PROMPT,
  buildResumeTailorUserPrompt,
} from "./prompts";
import { validateResumeTruthfulness } from "./resume-truthfulness";
import { ResumeTruthfulnessViolationError } from "../errors";

export interface ResumeTailorOptions {
  aiProvider?: AiProvider;
  strictTruthfulness?: boolean; // Default true: throws if truthfulness check fails
}

export class ResumeTailor {
  private readonly aiProvider: AiProvider;
  private readonly strictTruthfulness: boolean;

  constructor(options?: ResumeTailorOptions) {
    this.aiProvider = options?.aiProvider ?? defaultAiProvider;
    this.strictTruthfulness = options?.strictTruthfulness ?? true;
  }

  /**
   * Generates a tailored resume targeting a specific job posting
   * strictly grounded in candidate evidence and master resume text.
   */
  async tailor(input: TailorResumeInput): Promise<{
    tailoredData: TailoredResumeData;
    truthfulness: TruthfulnessValidationResult;
  }> {
    const userPrompt = buildResumeTailorUserPrompt({
      candidate: input.candidate,
      masterResumeText: input.masterResumeText,
      job: input.job,
      targetTitle: input.targetTitle,
      userInstructions: input.userInstructions,
    });

    // 1. AI Structured Output via schema validation
    const tailoredData = await this.aiProvider.generateStructuredOutput<TailoredResumeData>({
      systemPrompt: RESUME_TAILOR_SYSTEM_PROMPT,
      userPrompt,
      schema: tailoredResumeDataSchema,
      schemaName: "TailoredResumeData",
      temperature: 0.2, // Controlled low temperature for high fidelity
    });

    // 2. Deterministic Truthfulness & Provenance Validation
    const truthfulness = validateResumeTruthfulness(
      tailoredData,
      input.candidate,
      input.masterResumeText
    );

    // 3. Strict Truthfulness Gate
    if (this.strictTruthfulness && !truthfulness.isValid) {
      throw new ResumeTruthfulnessViolationError(truthfulness.violations);
    }

    return {
      tailoredData,
      truthfulness,
    };
  }
}
