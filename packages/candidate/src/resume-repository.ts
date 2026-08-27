import { db, resumes } from "@job-hub/db";
import { eq, desc } from "drizzle-orm";
import type { Resume, CreateResumeRecordInput, ResumeProcessingStatus } from "./resume-types";

export interface ResumeRepository {
  findById(id: string): Promise<Resume | null>;
  findByCandidateProfileId(candidateProfileId: string): Promise<Resume[]>;
  create(input: CreateResumeRecordInput): Promise<Resume>;
  delete(id: string): Promise<void>;
  updateStatus(id: string, status: ResumeProcessingStatus): Promise<Resume | null>;
  updateExtractionResult(id: string, input: {
    status: ResumeProcessingStatus;
    extractedText?: string | null;
    extractedAt?: Date | null;
    processingError?: string | null;
  }): Promise<Resume | null>;
}

export class DrizzleResumeRepository implements ResumeRepository {
  async findById(id: string): Promise<Resume | null> {
    const [row] = await db
      .select()
      .from(resumes)
      .where(eq(resumes.id, id))
      .limit(1);

    if (!row) return null;
    return this.mapToDomain(row);
  }

  async findByCandidateProfileId(candidateProfileId: string): Promise<Resume[]> {
    const rows = await db
      .select()
      .from(resumes)
      .where(eq(resumes.candidateProfileId, candidateProfileId))
      .orderBy(desc(resumes.createdAt));

    return rows.map((row) => this.mapToDomain(row));
  }

  async create(input: CreateResumeRecordInput): Promise<Resume> {
    const [row] = await db
      .insert(resumes)
      .values({
        id: input.id,
        candidateProfileId: input.candidateProfileId,
        fileName: input.fileName,
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        fileHash: input.fileHash ?? null,
        status: input.status ?? "UPLOADED",
        extractedText: input.extractedText ?? null,
        extractedAt: input.extractedAt ?? null,
        processingError: input.processingError ?? null,
      })
      .returning();

    if (!row) {
      throw new Error("Failed to insert resume record into database");
    }

    return this.mapToDomain(row);
  }

  async delete(id: string): Promise<void> {
    await db.delete(resumes).where(eq(resumes.id, id));
  }

  async updateStatus(id: string, status: ResumeProcessingStatus): Promise<Resume | null> {
    const [row] = await db
      .update(resumes)
      .set({ status, updatedAt: new Date() })
      .where(eq(resumes.id, id))
      .returning();

    if (!row) return null;
    return this.mapToDomain(row);
  }

  async updateExtractionResult(id: string, input: {
    status: ResumeProcessingStatus;
    extractedText?: string | null;
    extractedAt?: Date | null;
    processingError?: string | null;
  }): Promise<Resume | null> {
    const [row] = await db
      .update(resumes)
      .set({
        status: input.status,
        extractedText: input.extractedText !== undefined ? input.extractedText : null,
        extractedAt: input.extractedAt !== undefined ? input.extractedAt : null,
        processingError: input.processingError !== undefined ? input.processingError : null,
        updatedAt: new Date(),
      })
      .where(eq(resumes.id, id))
      .returning();

    if (!row) return null;
    return this.mapToDomain(row);
  }

  private mapToDomain(row: typeof resumes.$inferSelect): Resume {
    return {
      id: row.id,
      candidateProfileId: row.candidateProfileId,
      fileName: row.fileName,
      storageKey: row.storageKey,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      fileHash: row.fileHash,
      status: row.status as ResumeProcessingStatus,
      extractedText: row.extractedText ?? null,
      extractedAt: row.extractedAt ?? null,
      processingError: row.processingError ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
