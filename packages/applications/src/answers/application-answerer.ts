/**
 * Job Hub — Phase 7 / Step 7.4
 * Application Answerer Service
 *
 * Grounded in:
 * - 04_ai_agent_skills.md §13 ("Application Question Answering Skill") & §21 ("ApplicationAnswerer")
 * - 04_ai_agent_skills.md §23 ("Negative constraints: never guess or hallucinate on cautionary questions")
 */

import type { AiProvider } from "@job-hub/ai";
import type {
  ApplicationAnswerItem,
  GenerateAnswersInput,
  AnswersTruthfulnessResult,
} from "./types";
import { generateAnswersOutputSchema } from "./validation";
import { validateApplicationAnswersTruthfulness } from "./truthfulness";
import { APPLICATION_ANSWERER_SYSTEM_PROMPT, buildAnswersUserPrompt } from "./prompts";
import { ApplicationAnswerTruthfulnessViolationError } from "../errors";

export interface ApplicationAnswererConfig {
  aiProvider: AiProvider;
  strictTruthfulness?: boolean; // Default true
}

export class ApplicationAnswerer {
  private readonly aiProvider: AiProvider;
  private readonly strictTruthfulness: boolean;

  constructor(config: ApplicationAnswererConfig) {
    this.aiProvider = config.aiProvider;
    this.strictTruthfulness = config.strictTruthfulness ?? true;
  }

  /**
   * Generates grounded application answers with explicit confidence tagging.
   */
  async generateAnswers(
    input: GenerateAnswersInput
  ): Promise<{
    answers: ApplicationAnswerItem[];
    truthfulness: AnswersTruthfulnessResult;
  }> {
    const userPrompt = buildAnswersUserPrompt(
      input.candidate,
      input.job,
      input.questions
    );

    // 1. Generate Structured Output from AI
    const rawOutput = await this.aiProvider.generateStructuredOutput<{
      answers: ApplicationAnswerItem[];
    }>({
      schemaName: "ApplicationAnswersOutput",
      systemPrompt: APPLICATION_ANSWERER_SYSTEM_PROMPT,
      userPrompt,
      schema: generateAnswersOutputSchema,
      temperature: 0.1, // Near deterministic for factual grounding
    });

    // 2. Strict Zod Validation
    const validated = generateAnswersOutputSchema.parse(rawOutput);

    // 3. Deterministic Cautionary Rules & Evidence Grounding Check
    const truthfulness = validateApplicationAnswersTruthfulness(
      validated.answers,
      input.candidate
    );

    // 4. Strict Non-Negotiable Gate
    if (this.strictTruthfulness && !truthfulness.isValid) {
      throw new ApplicationAnswerTruthfulnessViolationError(truthfulness.violations);
    }

    return {
      answers: validated.answers,
      truthfulness,
    };
  }
}
