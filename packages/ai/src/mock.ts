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
  public readonly calls: Array<GenerateStructuredOutputOptions<unknown>> = [];

  constructor(handler?: MockAiResponseHandler | unknown) {
    if (typeof handler === "function") {
      this.handler = handler as MockAiResponseHandler;
    } else if (handler !== undefined) {
      this.handler = () =>
        typeof handler === "string" ? JSON.parse(handler) : handler;
    }
  }

  setHandler(handler: MockAiResponseHandler): void {
    this.handler = handler;
  }

  async generateStructuredOutput<T>(options: GenerateStructuredOutputOptions<T>): Promise<T> {
    this.calls.push(options as GenerateStructuredOutputOptions<unknown>);
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
