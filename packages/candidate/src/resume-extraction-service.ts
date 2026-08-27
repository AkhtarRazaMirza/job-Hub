import type { StorageProvider } from "@job-hub/storage";
import type { ResumeRepository } from "./resume-repository";
import type { CandidateProfileRepository, CandidateProfile } from "./types";
import type { Resume } from "./resume-types";
import type { ResumeTextExtractor } from "./extractors/types";
import { CompositeResumeTextExtractor } from "./extractors/composite-extractor";
import { ResumeNotFoundError, ResumeForbiddenError } from "./errors";

/**
 * ResumeExtractionService
 *
 * Orchestrates deterministic document text extraction:
 * 1. Verifies server-derived ownership.
 * 2. Manages lifecycle state transitions (UPLOADED -> PROCESSING -> PROCESSED | FAILED).
 * 3. Fetches document binary from StorageProvider.
 * 4. Delegates extraction to CompositeResumeTextExtractor (PdfTextExtractor / DocxTextExtractor).
 * 5. Normalizes text and persists extracted plain text to PostgreSQL.
 * 6. Never marks failed extractions as PROCESSED.
 */
export class ResumeExtractionService {
  private readonly extractor: ResumeTextExtractor;

  constructor(
    private readonly resumeRepository: ResumeRepository,
    private readonly storageProvider: StorageProvider,
    extractor?: ResumeTextExtractor
  ) {
    this.extractor = extractor ?? new CompositeResumeTextExtractor();
  }

  /**
   * Directly extracts text from a stored resume by ID.
   * Usable by background workers (e.g. Inngest) or internal services.
   */
  async extractResumeText(resumeId: string): Promise<Resume> {
    const resume = await this.resumeRepository.findById(resumeId);
    if (!resume) {
      throw new ResumeNotFoundError();
    }

    // 1. Transition state to PROCESSING
    await this.resumeRepository.updateStatus(resumeId, "PROCESSING");

    // 2. Read file binary from object storage abstraction
    let buffer: Buffer;
    try {
      const storageFile = await this.storageProvider.download(resume.storageKey);
      buffer = storageFile.data;
    } catch (err) {
      const errorMsg = `Storage retrieval error: ${err instanceof Error ? err.message : "Failed to download document from storage"}`;
      const failed = await this.resumeRepository.updateExtractionResult(resumeId, {
        status: "FAILED",
        extractedText: null,
        extractedAt: null,
        processingError: errorMsg,
      });
      return failed!;
    }

    // 3. Extract and normalize document text deterministically
    try {
      const extracted = await this.extractor.extract(buffer, undefined, resume.mimeType);

      // 4. On success: Persist extracted text and update status to PROCESSED
      const processed = await this.resumeRepository.updateExtractionResult(resumeId, {
        status: "PROCESSED",
        extractedText: extracted.normalizedText,
        extractedAt: new Date(),
        processingError: null,
      });

      return processed!;
    } catch (err) {
      // 5. On failure: Never mark as PROCESSED, record failure reason
      const errorMsg = err instanceof Error ? err.message : "Document text extraction failed";
      const failed = await this.resumeRepository.updateExtractionResult(resumeId, {
        status: "FAILED",
        extractedText: null,
        extractedAt: null,
        processingError: errorMsg,
      });

      return failed!;
    }
  }

  /**
   * Extracts text with strict candidate ownership verification.
   * Guarantees that a client can never process another candidate's resume.
   */
  async extractCandidateResume(params: {
    userId: string;
    resumeId: string;
    candidateProfileRepository: CandidateProfileRepository;
  }): Promise<Resume> {
    const profile = await params.candidateProfileRepository.findByUserId(params.userId);
    const resume = await this.resumeRepository.findById(params.resumeId);

    if (!resume) {
      throw new ResumeNotFoundError();
    }

    if (!profile || resume.candidateProfileId !== profile.id) {
      throw new ResumeForbiddenError("You do not have permission to process this resume.");
    }

    return this.extractResumeText(params.resumeId);
  }
}

import { DrizzleResumeRepository } from "./resume-repository";
import { storage } from "@job-hub/storage";

export const resumeExtractionService = new ResumeExtractionService(
  new DrizzleResumeRepository(),
  storage
);
