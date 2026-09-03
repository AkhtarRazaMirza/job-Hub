/**
 * Job Hub — Phase 7 / Step 7.3
 * Cover Letter Writer Domain Service
 *
 * Grounded in:
 * - 04_ai_agent_skills.md §12 ("Cover Letter Skill") & §21 ("CoverLetterWriter")
 * - 04_ai_agent_skills.md §23 ("Non-negotiable AI engineering rules")
 */

import type { AiProvider } from "@job-hub/ai";
import type {
  CoverLetterData,
  GenerateCoverLetterInput,
  CoverLetterTruthfulnessResult,
} from "./types";
import { coverLetterDataSchema } from "./validation";
import { validateCoverLetterTruthfulness } from "./truthfulness";
import { COVER_LETTER_SYSTEM_PROMPT, buildCoverLetterUserPrompt } from "./prompts";
import { CoverLetterTruthfulnessViolationError } from "../errors";

export interface CoverLetterWriterConfig {
  aiProvider: AiProvider;
  strictTruthfulness?: boolean; // Default true
}

export class CoverLetterWriter {
  private readonly aiProvider: AiProvider;
  private readonly strictTruthfulness: boolean;

  constructor(config: CoverLetterWriterConfig) {
    this.aiProvider = config.aiProvider;
    this.strictTruthfulness = config.strictTruthfulness ?? true;
  }

  /**
   * Generates a tailored, evidence-grounded cover letter for a candidate and target job.
   */
  async generateCoverLetter(
    input: GenerateCoverLetterInput,
    masterResumeText?: string
  ): Promise<{
    data: CoverLetterData;
    truthfulness: CoverLetterTruthfulnessResult;
  }> {
    const userPrompt = buildCoverLetterUserPrompt(
      input.candidate,
      input.job,
      input.customNotes
    );

    // 1. Generate Structured Output from AI
    const rawOutput = await this.aiProvider.generateStructuredOutput<CoverLetterData>({
      schemaName: "CoverLetterData",
      systemPrompt: COVER_LETTER_SYSTEM_PROMPT,
      userPrompt,
      schema: coverLetterDataSchema,
      temperature: 0.2, // Low temperature for deterministic, factual adherence
    });

    // 2. Strict Zod Schema Validation
    const validatedData = coverLetterDataSchema.parse(rawOutput);

    // Ensure assembled content matches parts if content is not pre-assembled
    if (!validatedData.content || validatedData.content.trim().length === 0) {
      validatedData.content = [
        validatedData.salutation,
        "",
        validatedData.hook,
        "",
        ...validatedData.bodyParagraphs,
        "",
        validatedData.callToAction,
        "",
        validatedData.signoff,
      ].join("\n");
    }

    // 3. Deterministic Truthfulness Validation against Candidate Evidence
    const truthfulness = validateCoverLetterTruthfulness(
      validatedData,
      input.candidate,
      masterResumeText
    );

    // 4. Strict Non-Negotiable Gate
    if (this.strictTruthfulness && !truthfulness.isValid) {
      throw new CoverLetterTruthfulnessViolationError(truthfulness.violations);
    }

    return {
      data: validatedData,
      truthfulness,
    };
  }
}
