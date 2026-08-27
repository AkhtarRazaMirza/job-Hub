import type { StorageProvider } from "@job-hub/storage";
import type { ResumeRepository } from "./resume-repository";
import type { CandidateProfileRepository } from "./types";
import type { ResumeMetadata } from "./resume-types";
import { validateResumeFile } from "./resume-validation";
import { ResumeNotFoundError, ResumeForbiddenError } from "./errors";

export class ResumeService {
  private readonly extractionService: ResumeExtractionService;

  constructor(
    private readonly resumeRepository: ResumeRepository,
    private readonly candidateProfileRepository: CandidateProfileRepository,
    private readonly storageProvider: StorageProvider,
    extractionService?: ResumeExtractionService
  ) {
    this.extractionService =
      extractionService ?? new ResumeExtractionService(resumeRepository, storageProvider);
  }

  /**
   * Securely uploads and registers a candidate resume.
   *
   * Enforces:
   * 1. Server-derived ownership from authenticated userId.
   * 2. Auto-initializes candidate profile if needed.
   * 3. Deterministic magic byte, size, and extension validation.
   * 4. Filename sanitization and server-generated storage key.
   * 5. Object storage persistence before database record creation.
   */
  async uploadResume(params: {
    userId: string;
    fileName: string;
    fileBase64: string;
    mimeType: string;
  }): Promise<ResumeMetadata> {
    // 1. Ensure candidate profile exists for authenticated user
    let profile = await this.candidateProfileRepository.findByUserId(params.userId);
    if (!profile) {
      profile = await this.candidateProfileRepository.create({ userId: params.userId });
    }

    // 2. Decode base64 payload into Buffer
    let buffer: Buffer;
    try {
      buffer = Buffer.from(params.fileBase64, "base64");
    } catch {
      throw new Error("Invalid base64 encoding for resume file");
    }

    // 3. Deterministic file validation
    const validated = validateResumeFile(buffer, params.fileName, profile.id);

    // 4. Object storage persistence
    await this.storageProvider.upload(validated.storageKey, buffer, validated.mimeType);

    // 5. Database metadata persistence
    const resume = await this.resumeRepository.create({
      candidateProfileId: profile.id,
      fileName: validated.sanitizedFileName,
      storageKey: validated.storageKey,
      mimeType: validated.mimeType,
      fileSize: validated.size,
      fileHash: validated.hash,
      status: "UPLOADED",
    });

    return this.toMetadata(resume);
  }

  /**
   * Lists all resumes belonging to the authenticated user.
   */
  async listResumes(userId: string): Promise<ResumeMetadata[]> {
    const profile = await this.candidateProfileRepository.findByUserId(userId);
    if (!profile) {
      return [];
    }

    const resumes = await this.resumeRepository.findByCandidateProfileId(profile.id);
    return resumes.map((r) => this.toMetadata(r));
  }

  /**
   * Retrieves a specific resume ensuring strict ownership verification.
   */
  async getResume(userId: string, resumeId: string): Promise<ResumeMetadata> {
    const profile = await this.candidateProfileRepository.findByUserId(userId);
    const resume = await this.resumeRepository.findById(resumeId);

    if (!resume) {
      throw new ResumeNotFoundError();
    }

    if (!profile || resume.candidateProfileId !== profile.id) {
      throw new ResumeForbiddenError();
    }

    return this.toMetadata(resume);
  }

  /**
   * Deletes a resume from object storage and database with ownership check.
   */
  async deleteResume(userId: string, resumeId: string): Promise<void> {
    const profile = await this.candidateProfileRepository.findByUserId(userId);
    const resume = await this.resumeRepository.findById(resumeId);

    if (!resume) {
      throw new ResumeNotFoundError();
    }

    if (!profile || resume.candidateProfileId !== profile.id) {
      throw new ResumeForbiddenError();
    }

    // Delete from storage
    try {
      await this.storageProvider.delete(resume.storageKey);
    } catch {
      // Storage file might already be removed, continue database cleanup
    }

    // Delete from database
    await this.resumeRepository.delete(resumeId);
  }

  /**
   * Triggers deterministic text extraction for a candidate resume with strict ownership verification.
   */
  async extractResume(userId: string, resumeId: string): Promise<ResumeMetadata> {
    const profile = await this.candidateProfileRepository.findByUserId(userId);
    const resume = await this.resumeRepository.findById(resumeId);

    if (!resume) {
      throw new ResumeNotFoundError();
    }

    if (!profile || resume.candidateProfileId !== profile.id) {
      throw new ResumeForbiddenError("You do not have permission to process this resume.");
    }

    const processed = await this.extractionService.extractResumeText(resumeId);
    return this.toMetadata(processed);
  }

  private toMetadata(resume: {
    id: string;
    candidateProfileId: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    fileHash: string | null;
    status: "UPLOADED" | "PROCESSING" | "PROCESSED" | "FAILED";
    extractedText?: string | null;
    extractedAt?: Date | null;
    processingError?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ResumeMetadata {
    return {
      id: resume.id,
      candidateProfileId: resume.candidateProfileId,
      fileName: resume.fileName,
      mimeType: resume.mimeType,
      fileSize: resume.fileSize,
      fileHash: resume.fileHash,
      status: resume.status,
      extractedAt: resume.extractedAt ?? null,
      processingError: resume.processingError ?? null,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt,
    };
  }
}

import { DrizzleResumeRepository } from "./resume-repository";
import { DrizzleCandidateProfileRepository } from "./repository";
import { storage } from "@job-hub/storage";
import { ResumeExtractionService } from "./resume-extraction-service";

const defaultRepository = new DrizzleResumeRepository();
export const resumeService = new ResumeService(
  defaultRepository,
  new DrizzleCandidateProfileRepository(),
  storage,
  new ResumeExtractionService(defaultRepository, storage)
);
