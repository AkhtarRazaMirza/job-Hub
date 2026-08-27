import { OpenAiProvider } from "./openai";
import type { AiProvider } from "./types";

export * from "./types";
export * from "./openai";
export * from "./mock";

/**
 * Factory creating the active AI provider based on environment configuration.
 * Instantiates the official OpenAiProvider with server-side credentials.
 */
export function createAiProvider(): AiProvider {
  return new OpenAiProvider();
}

export const defaultAiProvider: AiProvider = createAiProvider();
