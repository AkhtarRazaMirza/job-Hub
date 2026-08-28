/**
 * Job Hub — Phase 5 / Step 5.1
 * Saved Jobs Domain Types, Zod Schemas & Drizzle Repository
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 8 & §5 Phase 5 ("saved jobs")
 * - 02_how_to_build.md §10 ("Saved Jobs")
 */

import { z } from "zod";
import { eq, and, desc, count } from "drizzle-orm";
import { db, savedJobs } from "@job-hub/db";
import {
  SavedJobConflictError,
  SavedJobNotFoundError,
} from "./errors";

// -----------------------------------------------------------------------------
// Domain Types
// -----------------------------------------------------------------------------

export interface SavedJob {
  id: string;
  candidateProfileId: string;
  jobId: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSavedJobInput {
  candidateProfileId: string;
  jobId: string;
  notes?: string | null;
}

export interface UpdateSavedJobNotesInput {
  id?: string;
  candidateProfileId: string;
  jobId: string;
  notes?: string | null;
}

export interface ListSavedJobsOptions {
  limit?: number;
  offset?: number;
}

// -----------------------------------------------------------------------------
// Zod Schemas
// -----------------------------------------------------------------------------

export const savedJobSchema = z
  .object({
    id: z.string().min(1, "ID is required"),
    candidateProfileId: z.string().min(1, "Candidate profile ID is required"),
    jobId: z.string().min(1, "Job ID is required"),
    notes: z
      .string()
      .max(2000, "Notes cannot exceed 2000 characters")
      .nullable()
      .optional(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

export const createSavedJobInputSchema = z
  .object({
    candidateProfileId: z.string().min(1, "Candidate profile ID is required"),
    jobId: z.string().min(1, "Job ID is required"),
    notes: z
      .string()
      .max(2000, "Notes cannot exceed 2000 characters")
      .nullable()
      .optional(),
  })
  .strict();

export const updateSavedJobNotesInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    candidateProfileId: z.string().min(1, "Candidate profile ID is required"),
    jobId: z.string().min(1, "Job ID is required"),
    notes: z
      .string()
      .max(2000, "Notes cannot exceed 2000 characters")
      .nullable()
      .optional(),
  })
  .strict();

// -----------------------------------------------------------------------------
// Repository Interface
// -----------------------------------------------------------------------------

export interface SavedJobRepository {
  create(input: CreateSavedJobInput): Promise<SavedJob>;
  findById(id: string): Promise<SavedJob | null>;
  findByCandidateAndJob(
    candidateProfileId: string,
    jobId: string
  ): Promise<SavedJob | null>;
  listByCandidate(
    candidateProfileId: string,
    options?: ListSavedJobsOptions
  ): Promise<SavedJob[]>;
  updateNotes(input: UpdateSavedJobNotesInput): Promise<SavedJob>;
  delete(id: string): Promise<boolean>;
  deleteByCandidateAndJob(
    candidateProfileId: string,
    jobId: string
  ): Promise<boolean>;
  countByCandidate(candidateProfileId: string): Promise<number>;
}

// -----------------------------------------------------------------------------
// Drizzle Repository Implementation
// -----------------------------------------------------------------------------

export class DrizzleSavedJobRepository implements SavedJobRepository {
  constructor(private readonly database = db) {}

  private toEntity(row: typeof savedJobs.$inferSelect): SavedJob {
    return {
      id: row.id,
      candidateProfileId: row.candidateProfileId,
      jobId: row.jobId,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async create(input: CreateSavedJobInput): Promise<SavedJob> {
    const validated = createSavedJobInputSchema.parse(input);

    // Explicit unique check to provide clean domain error
    const existing = await this.findByCandidateAndJob(
      validated.candidateProfileId,
      validated.jobId
    );
    if (existing) {
      throw new SavedJobConflictError(
        `Job "${validated.jobId}" is already saved by candidate "${validated.candidateProfileId}".`
      );
    }

    try {
      const [inserted] = await this.database
        .insert(savedJobs)
        .values({
          candidateProfileId: validated.candidateProfileId,
          jobId: validated.jobId,
          notes: validated.notes ?? null,
        })
        .returning();

      if (!inserted) {
        throw new Error("Failed to insert saved job record.");
      }

      return this.toEntity(inserted);
    } catch (err: unknown) {
      // Handle race-condition DB unique constraint violation (PostgreSQL code 23505)
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "23505"
      ) {
        throw new SavedJobConflictError(
          `Job "${validated.jobId}" is already saved by candidate "${validated.candidateProfileId}".`
        );
      }
      throw err;
    }
  }

  async findById(id: string): Promise<SavedJob | null> {
    const [row] = await this.database
      .select()
      .from(savedJobs)
      .where(eq(savedJobs.id, id))
      .limit(1);

    return row ? this.toEntity(row) : null;
  }

  async findByCandidateAndJob(
    candidateProfileId: string,
    jobId: string
  ): Promise<SavedJob | null> {
    const [row] = await this.database
      .select()
      .from(savedJobs)
      .where(
        and(
          eq(savedJobs.candidateProfileId, candidateProfileId),
          eq(savedJobs.jobId, jobId)
        )
      )
      .limit(1);

    return row ? this.toEntity(row) : null;
  }

  async listByCandidate(
    candidateProfileId: string,
    options?: ListSavedJobsOptions
  ): Promise<SavedJob[]> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    const offset = Math.max(options?.offset ?? 0, 0);

    const rows = await this.database
      .select()
      .from(savedJobs)
      .where(eq(savedJobs.candidateProfileId, candidateProfileId))
      .orderBy(desc(savedJobs.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((r) => this.toEntity(r));
  }

  async updateNotes(input: UpdateSavedJobNotesInput): Promise<SavedJob> {
    const validated = updateSavedJobNotesInputSchema.parse(input);

    const condition = validated.id
      ? eq(savedJobs.id, validated.id)
      : and(
          eq(savedJobs.candidateProfileId, validated.candidateProfileId),
          eq(savedJobs.jobId, validated.jobId)
        );

    const [updated] = await this.database
      .update(savedJobs)
      .set({
        notes: validated.notes ?? null,
        updatedAt: new Date(),
      })
      .where(condition)
      .returning();

    if (!updated) {
      throw new SavedJobNotFoundError(
        `Saved job not found for candidate "${validated.candidateProfileId}" and job "${validated.jobId}".`
      );
    }

    return this.toEntity(updated);
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.database
      .delete(savedJobs)
      .where(eq(savedJobs.id, id))
      .returning({ id: savedJobs.id });

    return deleted.length > 0;
  }

  async deleteByCandidateAndJob(
    candidateProfileId: string,
    jobId: string
  ): Promise<boolean> {
    const deleted = await this.database
      .delete(savedJobs)
      .where(
        and(
          eq(savedJobs.candidateProfileId, candidateProfileId),
          eq(savedJobs.jobId, jobId)
        )
      )
      .returning({ id: savedJobs.id });

    return deleted.length > 0;
  }

  async countByCandidate(candidateProfileId: string): Promise<number> {
    const [result] = await this.database
      .select({ total: count() })
      .from(savedJobs)
      .where(eq(savedJobs.candidateProfileId, candidateProfileId));

    return Number(result?.total ?? 0);
  }
}
