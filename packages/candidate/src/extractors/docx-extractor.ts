import mammoth from "mammoth";
import type { ResumeTextExtractor, ExtractedResumeText } from "./types";
import {
  ResumeExtractionError,
  ResumeExtractionTimeoutError,
  EmptyExtractionError,
} from "./types";
import { normalizeDocumentText } from "./normalizer";

export const DOCX_EXTRACTION_TIMEOUT_MS = 10_000;

/**
 * Deterministic DOCX Text Extractor using mammoth.extractRawText.
 * Treats input as untrusted OpenXML ZIP, decodes XML paragraph structure without HTML conversion.
 */
export class DocxTextExtractor implements ResumeTextExtractor {
  canHandle(format: string, mimeType?: string): boolean {
    return (
      format.toLowerCase() === "docx" ||
      mimeType?.toLowerCase() === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  }

  async extract(buffer: Buffer): Promise<ExtractedResumeText> {
    if (!buffer || buffer.length === 0) {
      throw new ResumeExtractionError("Cannot extract text from empty DOCX buffer.");
    }

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new ResumeExtractionTimeoutError(
            `DOCX text extraction exceeded timeout limit of ${DOCX_EXTRACTION_TIMEOUT_MS / 1000} seconds.`
          )
        );
      }, DOCX_EXTRACTION_TIMEOUT_MS);
    });

    let rawText: string;
    try {
      const extractionPromise = mammoth.extractRawText({ buffer }).then((res) => res.value);
      rawText = await Promise.race([
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
        `DOCX extraction failed: ${err instanceof Error ? err.message : "Corrupt or invalid DOCX document."}`
      );
    }

    const normalized = normalizeDocumentText(rawText);

    // Extraction succeeds only when meaningful non-whitespace text exists
    if (normalized.normalizedText.length === 0) {
      throw new EmptyExtractionError(
        "DOCX document does not contain readable text."
      );
    }

    return {
      rawText,
      normalizedText: normalized.normalizedText,
      characterCount: normalized.characterCount,
      wordCount: normalized.wordCount,
      format: "docx",
    };
  }
}
