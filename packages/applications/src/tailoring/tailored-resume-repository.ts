/**
 * Job Hub — Phase 7 / Step 7.1
 * Tailored Resume Repository & Persistence
 *
 * Implements candidate-isolated persistence for AI-tailored resume versions.
 * Master resume in `resumes` table remains strictly immutable.
 */

import { eq, and, desc } from "drizzle-orm";
import {
  db as defaultDb,
  tailoredResumes,
  type Database,
} from "@job-hub/db";
import type {
  CreateTailoredResumeInput,
  TailoredResumeRecord,
  TailoredResumeRepository,
  TailoredResumeStatus,
  TailoredResumeData,
} from "./types";
import {
  TailoredResumeNotFoundError,
} from "../errors";

function toDomainRecord(raw: typeof tailoredResumes.$inferSelect): TailoredResumeRecord {
  return {
    id: raw.id,
    candidateProfileId: raw.candidateProfileId,
    jobId: raw.jobId,
    sourceResumeId: raw.sourceResumeId,
    targetTitle: raw.targetTitle,
    tailoredData: raw.tailoredData as TailoredResumeData,
    truthfulnessScore: raw.truthfulnessScore ? Number(raw.truthfulnessScore) : null,
    status: raw.status as TailoredResumeStatus,
    version: raw.version,
    storageKey: raw.storageKey,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export class DrizzleTailoredResumeRepository implements TailoredResumeRepository {
  constructor(private readonly db: Database = defaultDb) {}

  /**
   * Persists a newly generated tailored resume with monotonic version incrementing
   * for the specific candidate profile and job opportunity.
   */
  async create(input: CreateTailoredResumeInput): Promise<TailoredResumeRecord> {
    // Determine next version for this candidate + job pair
    const [latest] = await this.db
      .select({ version: tailoredResumes.version })
      .from(tailoredResumes)
      .where(
        and(
          eq(tailoredResumes.candidateProfileId, input.candidateProfileId),
          eq(tailoredResumes.jobId, input.jobId)
        )
      )
      .orderBy(desc(tailoredResumes.version))
      .limit(1);

    const nextVersion = latest ? latest.version + 1 : 1;

    const [created] = await this.db
      .insert(tailoredResumes)
      .values({
        candidateProfileId: input.candidateProfileId,
        jobId: input.jobId,
        sourceResumeId: input.sourceResumeId,
        targetTitle: input.targetTitle ?? null,
        tailoredData: input.tailoredData,
        truthfulnessScore:
          input.truthfulnessScore !== undefined && input.truthfulnessScore !== null
            ? input.truthfulnessScore.toFixed(2)
            : null,
        status: input.status ?? "DRAFT",
        version: nextVersion,
        storageKey: input.storageKey ?? null,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to persist tailored resume");
    }

    return toDomainRecord(created);
  }

  /**
   * Finds a tailored resume by ID, strictly enforcing candidate ownership.
   */
  async findById(
    id: string,
    candidateProfileId: string
  ): Promise<TailoredResumeRecord | null> {
    const [found] = await this.db
      .select()
      .from(tailoredResumes)
      .where(
        and(
          eq(tailoredResumes.id, id),
          eq(tailoredResumes.candidateProfileId, candidateProfileId)
        )
      )
      .limit(1);

    return found ? toDomainRecord(found) : null;
  }

  /**
   * Finds the latest version of a tailored resume for a specific candidate and job.
   */
  async findLatestByCandidateAndJob(
    candidateProfileId: string,
    jobId: string
  ): Promise<TailoredResumeRecord | null> {
    const [found] = await this.db
      .select()
      .from(tailoredResumes)
      .where(
        and(
          eq(tailoredResumes.candidateProfileId, candidateProfileId),
          eq(tailoredResumes.jobId, jobId)
        )
      )
      .orderBy(desc(tailoredResumes.version))
      .limit(1);

    return found ? toDomainRecord(found) : null;
  }

  /**
   * Lists all tailored resumes belonging to a candidate.
   */
  async listByCandidate(
    candidateProfileId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<TailoredResumeRecord[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const rows = await this.db
      .select()
      .from(tailoredResumes)
      .where(eq(tailoredResumes.candidateProfileId, candidateProfileId))
      .orderBy(desc(tailoredResumes.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map(toDomainRecord);
  }

  /**
   * Updates status (e.g. DRAFT -> APPROVED) with ownership verification.
   */
  async updateStatus(
    id: string,
    candidateProfileId: string,
    status: TailoredResumeStatus
  ): Promise<TailoredResumeRecord> {
    const existing = await this.findById(id, candidateProfileId);
    if (!existing) {
      throw new TailoredResumeNotFoundError(id);
    }

    const [updated] = await this.db
      .update(tailoredResumes)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tailoredResumes.id, id),
          eq(tailoredResumes.candidateProfileId, candidateProfileId)
        )
      )
      .returning();

    if (!updated) {
      throw new TailoredResumeNotFoundError(id);
    }

    return toDomainRecord(updated);
  }

  /**
   * Deletes a tailored resume with ownership verification.
   */
  async delete(id: string, candidateProfileId: string): Promise<boolean> {
    const existing = await this.findById(id, candidateProfileId);
    if (!existing) {
      throw new TailoredResumeNotFoundError(id);
    }

    const deleted = await this.db
      .delete(tailoredResumes)
      .where(
        and(
          eq(tailoredResumes.id, id),
          eq(tailoredResumes.candidateProfileId, candidateProfileId)
        )
      )
      .returning({ id: tailoredResumes.id });

    return deleted.length > 0;
  }
}

export const tailoredResumeRepository = new DrizzleTailoredResumeRepository();
