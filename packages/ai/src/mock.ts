import type { AiProvider, GenerateStructuredOutputOptions } from "./types";
import { AiProviderError, AiValidationError } from "./types";

export interface MockAiResponseHandler<T = unknown> {
  (options: GenerateStructuredOutputOptions<T>): Promise<unknown> | unknown;
}

/**
 * Deterministic Mock AI Provider for testing and local environments.
 * Strictly verifies schema validation on outputs.
 */
export class MockAiProvider implements AiProvider {
  private handler?: MockAiResponseHandler;

  constructor(handler?: MockAiResponseHandler) {
    this.handler = handler;
  }

  setHandler(handler: MockAiResponseHandler): void {
    this.handler = handler;
  }

  async generateStructuredOutput<T>(options: GenerateStructuredOutputOptions<T>): Promise<T> {
    if (!this.handler) {
      throw new AiProviderError("MockAiProvider handler is not configured.", "MOCK_NOT_CONFIGURED");
    }

    const raw = await this.handler(options as GenerateStructuredOutputOptions<unknown>);
    const result = options.schema.safeParse(raw);
    if (!result.success) {
      throw new AiValidationError(`Mock AI output failed schema validation: ${result.error.message}`);
    }
    return result.data;
  }
}
