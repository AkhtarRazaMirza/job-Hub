import type { ResumeTextExtractor, ExtractedResumeText } from "./types";
import { ResumeExtractionError } from "./types";
import { PdfTextExtractor } from "./pdf-extractor";
import { DocxTextExtractor } from "./docx-extractor";

/**
 * Composite Resume Text Extractor.
 * Inspects binary magic bytes and format hints to route to the appropriate format extractor.
 */
export class CompositeResumeTextExtractor implements ResumeTextExtractor {
  private readonly extractors: ResumeTextExtractor[];

  constructor(extractors?: ResumeTextExtractor[]) {
    this.extractors = extractors ?? [
      new PdfTextExtractor(),
      new DocxTextExtractor(),
    ];
  }

  canHandle(format: string, mimeType?: string): boolean {
    return this.extractors.some((e) => e.canHandle(format, mimeType));
  }

  async extract(
    buffer: Buffer,
    formatHint?: string,
    mimeTypeHint?: string
  ): Promise<ExtractedResumeText> {
    if (!buffer || buffer.length < 4) {
      throw new ResumeExtractionError(
        "Invalid document buffer: buffer is empty or too small to contain a valid file signature."
      );
    }

    // 1. Authoritative Binary Magic Byte Inspection
    let binaryFormat: "pdf" | "docx" | null = null;
    if (
      buffer.length >= 5 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    ) {
      binaryFormat = "pdf";
    } else if (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    ) {
      binaryFormat = "docx";
    }

    if (!binaryFormat) {
      throw new ResumeExtractionError(
        "Unsupported or unrecognizable binary format. Expected valid PDF (%PDF-) or DOCX (PK\x03\x04)."
      );
    }

    // 2. Reject mismatch if formatHint or mimeType contradicts binary reality
    if (formatHint) {
      const normalizedHint = formatHint.toLowerCase().replace(/^\./, "");
      if (
        (normalizedHint === "pdf" && binaryFormat !== "pdf") ||
        (normalizedHint === "docx" && binaryFormat !== "docx")
      ) {
        throw new ResumeExtractionError(
          `Document format mismatch: claimed format '${formatHint}' does not match binary signature '${binaryFormat}'.`
        );
      }
    }

    if (mimeTypeHint) {
      const normalizedMime = mimeTypeHint.toLowerCase();
      if (
        (normalizedMime.includes("pdf") && binaryFormat !== "pdf") ||
        (normalizedMime.includes("wordprocessingml") && binaryFormat !== "docx")
      ) {
        throw new ResumeExtractionError(
          `Document MIME mismatch: claimed MIME '${mimeTypeHint}' does not match binary signature '${binaryFormat}'.`
        );
      }
    }

    const extractor = this.extractors.find((e) => e.canHandle(binaryFormat!));
    if (!extractor) {
      throw new ResumeExtractionError(
        `No extractor registered capable of handling format: ${binaryFormat}`
      );
    }

    return extractor.extract(buffer);
  }
}
