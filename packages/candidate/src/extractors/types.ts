/**
 * Resume Text Extractor Types & Domain Errors
 * Job Hub — Phase 2 / Step 2.6
 */

export interface ExtractedResumeText {
  rawText: string;
  normalizedText: string;
  characterCount: number;
  wordCount: number;
  format: "pdf" | "docx";
  pageCount?: number;
}

export interface ResumeTextExtractor {
  canHandle(format: string, mimeType?: string): boolean;
  extract(
    buffer: Buffer,
    formatHint?: string,
    mimeTypeHint?: string
  ): Promise<ExtractedResumeText>;
}

export class ResumeExtractionError extends Error {
  constructor(message: string, public readonly code = "EXTRACTION_FAILED") {
    super(message);
    this.name = "ResumeExtractionError";
  }
}

export class ResumeExtractionTimeoutError extends ResumeExtractionError {
  constructor(message = "Resume text extraction timed out after exceeding the allowable processing duration.") {
    super(message, "EXTRACTION_TIMEOUT");
    this.name = "ResumeExtractionTimeoutError";
  }
}

export class EmptyExtractionError extends ResumeExtractionError {
  constructor(message = "Document does not contain readable digital text.") {
    super(message, "EMPTY_EXTRACTION");
    this.name = "EmptyExtractionError";
  }
}

export class ResourceLimitExceededError extends ResumeExtractionError {
  constructor(message: string) {
    super(message, "RESOURCE_LIMIT_EXCEEDED");
    this.name = "ResourceLimitExceededError";
  }
}
