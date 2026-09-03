/**
 * Job Hub — Phase 7 / Step 7.3
 * Cover Letter Repository (Drizzle Implementation)
 *
 * Enforces candidate isolation and monotonic versioning for cover letters.
 */

import {
  db as defaultDb,
  coverLetters,
  type Database,
} from "@job-hub/db";
import { eq, and, desc } from "drizzle-orm";
import type {
  CoverLetterRecord,
  CoverLetterRepository,
  CreateCoverLetterInput,
  UpdateCoverLetterInput,
  CoverLetterStatus,
} from "./types";
import { CoverLetterNotFoundError } from "../errors";

export class DrizzleCoverLetterRepository implements CoverLetterRepository {
  constructor(private readonly db: Database = defaultDb) {}

  /**
   * Saves a new cover letter record. Automatically computes monotonic version.
   */
  async create(input: CreateCoverLetterInput): Promise<CoverLetterRecord> {
    const existing = await this.db
      .select({ version: coverLetters.version })
      .from(coverLetters)
      .where(
        and(
          eq(coverLetters.candidateProfileId, input.candidateProfileId),
          eq(coverLetters.jobId, input.jobId)
        )
      )
      .orderBy(desc(coverLetters.version))
      .limit(1);

    const nextVersion = existing.length > 0 ? existing[0]!.version + 1 : 1;

    const [record] = await this.db
      .insert(coverLetters)
      .values({
        candidateProfileId: input.candidateProfileId,
        jobId: input.jobId,
        title: input.data.title,
        salutation: input.data.salutation,
        hook: input.data.hook,
        bodyParagraphs: input.data.bodyParagraphs,
        callToAction: input.data.callToAction,
        signoff: input.data.signoff,
        content: input.data.content,
        highlightedSkills: input.data.highlightedSkills,
        highlightedProjects: input.data.highlightedProjects,
        status: input.status ?? "DRAFT",
        version: nextVersion,
      })
      .returning();

    return this.mapRecord(record);
  }

  /**
   * Retrieves a cover letter by ID with strict candidate ownership isolation.
   */
  async findById(
    id: string,
    candidateProfileId: string
  ): Promise<CoverLetterRecord | null> {
    const rows = await this.db
      .select()
      .from(coverLetters)
      .where(
        and(
          eq(coverLetters.id, id),
          eq(coverLetters.candidateProfileId, candidateProfileId)
        )
      )
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRecord(rows[0]!);
  }

  /**
   * Retrieves the latest cover letter for a candidate and job.
   */
  async findLatestByCandidateAndJob(
    candidateProfileId: string,
    jobId: string
  ): Promise<CoverLetterRecord | null> {
    const rows = await this.db
      .select()
      .from(coverLetters)
      .where(
        and(
          eq(coverLetters.candidateProfileId, candidateProfileId),
          eq(coverLetters.jobId, jobId)
        )
      )
      .orderBy(desc(coverLetters.version))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRecord(rows[0]!);
  }

  /**
   * Updates cover letter content and status with candidate ownership isolation.
   */
  async update(input: UpdateCoverLetterInput): Promise<CoverLetterRecord> {
    const [updated] = await this.db
      .update(coverLetters)
      .set({
        content: input.content,
        ...(input.status ? { status: input.status } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(coverLetters.id, input.id),
          eq(coverLetters.candidateProfileId, input.candidateProfileId)
        )
      )
      .returning();

    if (!updated) {
      throw new CoverLetterNotFoundError(input.id);
    }

    return this.mapRecord(updated);
  }

  /**
   * Deletes a cover letter by ID with candidate ownership isolation.
   */
  async delete(id: string, candidateProfileId: string): Promise<boolean> {
    const result = await this.db
      .delete(coverLetters)
      .where(
        and(
          eq(coverLetters.id, id),
          eq(coverLetters.candidateProfileId, candidateProfileId)
        )
      )
      .returning({ id: coverLetters.id });

    return result.length > 0;
  }

  private mapRecord(row: any): CoverLetterRecord {
    return {
      id: row.id,
      candidateProfileId: row.candidateProfileId,
      jobId: row.jobId,
      title: row.title,
      salutation: row.salutation,
      hook: row.hook,
      bodyParagraphs: row.bodyParagraphs,
      callToAction: row.callToAction,
      signoff: row.signoff,
      content: row.content,
      highlightedSkills: row.highlightedSkills ?? [],
      highlightedProjects: row.highlightedProjects ?? [],
      status: row.status as CoverLetterStatus,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export const coverLetterRepository = new DrizzleCoverLetterRepository();
