/**
 * Job Hub — Phase 7 / Step 7.2
 * Tailored Resume Document Service
 *
 * Manages rendering, safe storage persistence, and document retrieval
 * for candidate-tailored resumes using the StorageProvider abstraction.
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 9 ("Collect required documents, never alter master resume")
 * - 02_how_to_build.md §11 ("PDF/DOCX generation -> Version saved")
 * - 03_tech_stack.md §10 ("Cloudflare R2 / S3 client abstraction")
 */

import { storage as defaultStorage, type StorageProvider } from "@job-hub/storage";
import {
  db as defaultDb,
  tailoredResumes,
  type Database,
} from "@job-hub/db";
import { eq, and } from "drizzle-orm";
import type { TailoredResumeRecord } from "./types";
import { renderResumePdf } from "./document-renderer";
import {
  tailoredResumeRepository,
  type DrizzleTailoredResumeRepository,
} from "./tailored-resume-repository";
import {
  TailoredResumeNotFoundError,
} from "../errors";

export interface GenerateResumePdfResult {
  tailoredResumeId: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  buffer: Buffer;
  version: number;
}

export class TailoredResumeDocumentService {
  constructor(
    private readonly repository: DrizzleTailoredResumeRepository = tailoredResumeRepository,
    private readonly storageProvider: StorageProvider = defaultStorage,
    private readonly db: Database = defaultDb
  ) {}

  /**
   * Generates a candidate-ready PDF from a validated tailored resume record
   * and stores it deterministically in the storage provider.
   */
  async generateAndStorePdf(params: {
    tailoredResumeId: string;
    candidateProfileId: string;
  }): Promise<GenerateResumePdfResult> {
    const { tailoredResumeId, candidateProfileId } = params;

    // 1. Strict Candidate Ownership Check
    const tailoredResume: TailoredResumeRecord | null = await this.repository.findById(
      tailoredResumeId,
      candidateProfileId
    );

    if (!tailoredResume) {
      throw new TailoredResumeNotFoundError(tailoredResumeId);
    }

    // 2. Deterministic PDF Rendering (zero LLM calls)
    const pdfBuffer = await renderResumePdf(tailoredResume.tailoredData);
    const fileSize = pdfBuffer.length;

    // 3. Construct Safe Storage Key
    const safeStorageKey = `tailored-resumes/${candidateProfileId}/${tailoredResumeId}_v${tailoredResume.version}.pdf`;
    const mimeType = "application/pdf";

    // 4. Persist to Storage Provider
    await this.storageProvider.upload(safeStorageKey, pdfBuffer, mimeType);

    // 5. Update tailored resume record with storageKey and status GENERATED
    await this.db
      .update(tailoredResumes)
      .set({
        storageKey: safeStorageKey,
        status: "GENERATED",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tailoredResumes.id, tailoredResumeId),
          eq(tailoredResumes.candidateProfileId, candidateProfileId)
        )
      );

    return {
      tailoredResumeId,
      storageKey: safeStorageKey,
      mimeType,
      fileSize,
      buffer: pdfBuffer,
      version: tailoredResume.version,
    };
  }

  /**
   * Retrieves the generated PDF stream/buffer with ownership validation.
   */
  async getPdfBuffer(params: {
    tailoredResumeId: string;
    candidateProfileId: string;
  }): Promise<{ buffer: Buffer; storageKey: string; mimeType: string }> {
    const { tailoredResumeId, candidateProfileId } = params;

    const tailoredResume = await this.repository.findById(
      tailoredResumeId,
      candidateProfileId
    );

    if (!tailoredResume || !tailoredResume.storageKey) {
      throw new TailoredResumeNotFoundError(tailoredResumeId);
    }

    const file = await this.storageProvider.download(tailoredResume.storageKey);

    return {
      buffer: file.data,
      storageKey: tailoredResume.storageKey,
      mimeType: file.contentType || "application/pdf",
    };
  }
}

export const tailoredResumeDocumentService = new TailoredResumeDocumentService();
