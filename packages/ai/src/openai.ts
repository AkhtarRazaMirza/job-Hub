import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { AiProvider, GenerateStructuredOutputOptions } from "./types";
import { AiProviderError, AiValidationError, AiTimeoutError } from "./types";

export interface OpenAiConfig {
  apiKey?: string;
  defaultModel?: string;
}

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const DEFAULT_AI_TIMEOUT_MS = 30_000;

export class OpenAiProvider implements AiProvider {
  private client: OpenAI | null = null;
  private readonly defaultModel: string;

  constructor(config?: OpenAiConfig) {
    const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
    this.defaultModel = config?.defaultModel || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  async generateStructuredOutput<T>(options: GenerateStructuredOutputOptions<T>): Promise<T> {
    if (!this.client) {
      throw new AiProviderError(
        "OpenAI API key is not configured. Please set the OPENAI_API_KEY environment variable.",
        "OPENAI_NOT_CONFIGURED"
      );
    }

    const model = options.model || this.defaultModel;
    const timeoutMs = options.timeoutMs || DEFAULT_AI_TIMEOUT_MS;

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new AiTimeoutError(`OpenAI request timed out after ${timeoutMs / 1000} seconds.`));
      }, timeoutMs);
    });

    try {
      const completionPromise = this.client.beta.chat.completions.parse({
        model,
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: options.userPrompt },
        ],
        response_format: zodResponseFormat(options.schema, options.schemaName),
        temperature: options.temperature ?? 0.1,
      });

      const response = await Promise.race([
        completionPromise.finally(() => {
          if (timer) clearTimeout(timer);
        }),
        timeoutPromise,
      ]);

      const choice = response.choices[0];
      if (!choice) {
        throw new AiProviderError("OpenAI returned an empty choices array.");
      }

      if (choice.message.refusal) {
        throw new AiProviderError(`OpenAI model refused request: ${choice.message.refusal}`);
      }

      const parsed = choice.message.parsed;
      if (!parsed) {
        throw new AiValidationError("OpenAI response did not contain parsed structured output.");
      }

      // Mandatory validation guarantee: schema parse verification
      const validated = options.schema.safeParse(parsed);
      if (!validated.success) {
        throw new AiValidationError(
          `AI output failed schema validation: ${validated.error.message}`
        );
      }

      return validated.data;
    } catch (err) {
      if (err instanceof AiProviderError) {
        throw err;
      }
      throw new AiProviderError(
        `OpenAI request failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }
}
