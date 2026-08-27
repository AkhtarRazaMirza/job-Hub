import type { z } from "zod";

export interface GenerateStructuredOutputOptions<T> {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T, z.ZodTypeDef, any>;
  schemaName: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
}

/**
 * Replaceable AI Provider abstraction decoupling domain logic
 * from concrete LLM SDKs (OpenAI, Anthropic, Local, Mock, etc.).
 */
export interface AiProvider {
  generateStructuredOutput<T>(options: GenerateStructuredOutputOptions<T>): Promise<T>;
}

export class AiProviderError extends Error {
  constructor(message: string, public readonly code = "AI_PROVIDER_ERROR") {
    super(message);
    this.name = "AiProviderError";
  }
}

export class AiValidationError extends AiProviderError {
  constructor(message: string) {
    super(message, "AI_VALIDATION_ERROR");
    this.name = "AiValidationError";
  }
}

export class AiTimeoutError extends AiProviderError {
  constructor(message = "AI request timed out.") {
    super(message, "AI_TIMEOUT");
    this.name = "AiTimeoutError";
  }
}
