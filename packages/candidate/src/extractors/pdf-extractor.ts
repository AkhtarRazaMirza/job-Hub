import { extractText } from "unpdf";
import type { ResumeTextExtractor, ExtractedResumeText } from "./types";
import {
  ResumeExtractionError,
  ResumeExtractionTimeoutError,
  EmptyExtractionError,
  ResourceLimitExceededError,
} from "./types";
import { normalizeDocumentText } from "./normalizer";

export const MAX_PDF_PAGES = 50;
export const PDF_EXTRACTION_TIMEOUT_MS = 10_000;

/**
 * Deterministic PDF Text Extractor using unpdf (pure JS Mozilla PDF.js core).
 * Implements security resource limits (max page count, extraction timeout, empty text check).
 */
export class PdfTextExtractor implements ResumeTextExtractor {
  canHandle(format: string, mimeType?: string): boolean {
    return (
      format.toLowerCase() === "pdf" ||
      mimeType?.toLowerCase() === "application/pdf"
    );
  }

  async extract(buffer: Buffer): Promise<ExtractedResumeText> {
    if (!buffer || buffer.length === 0) {
      throw new ResumeExtractionError("Cannot extract text from empty PDF buffer.");
    }

    let extractionPromise: Promise<{ totalPages: number; text: string[] }>;
    try {
      extractionPromise = extractText(new Uint8Array(buffer));
    } catch (err) {
      throw new ResumeExtractionError(
        `Failed to initialize PDF parsing: ${err instanceof Error ? err.message : "Malformed PDF"}`
      );
    }

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new ResumeExtractionTimeoutError(
            `PDF text extraction exceeded timeout limit of ${PDF_EXTRACTION_TIMEOUT_MS / 1000} seconds.`
          )
        );
      }, PDF_EXTRACTION_TIMEOUT_MS);
    });

    let result: { totalPages: number; text: string[] };
    try {
      result = await Promise.race([
        extractionPromise.finally(() => {
          if (timer) clearTimeout(timer);
        }),
        timeoutPromise,
      ]);
    } catch (err) {
      if (err instanceof ResumeExtractionError) {
        throw err;
      }
      throw new ResumeExtractionError(
        `PDF extraction failed: ${err instanceof Error ? err.message : "Corrupt or unreadable PDF document."}`
      );
    }

    // Enforce reasonable maximum page count
    if (result.totalPages > MAX_PDF_PAGES) {
      throw new ResourceLimitExceededError(
        `PDF page count (${result.totalPages}) exceeds maximum allowable limit of ${MAX_PDF_PAGES} pages.`
      );
    }

    const rawText = Array.isArray(result.text) ? result.text.join("\n\n") : "";
    const normalized = normalizeDocumentText(rawText);

    // Extraction succeeds only when meaningful non-whitespace text exists
    if (normalized.normalizedText.length === 0) {
      throw new EmptyExtractionError(
        "PDF document does not contain readable digital text. Scanned images and image-only PDFs are not supported."
      );
    }

    return {
      rawText,
      normalizedText: normalized.normalizedText,
      characterCount: normalized.characterCount,
      wordCount: normalized.wordCount,
      format: "pdf",
      pageCount: result.totalPages,
    };
  }
}
