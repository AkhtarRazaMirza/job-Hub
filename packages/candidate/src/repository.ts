import { eq } from "drizzle-orm";
import { db as defaultDb, candidateProfiles, type Database } from "@job-hub/db";
import type {
  CandidateProfile,
  CandidateProfileRepository,
  CreateCandidateProfileInput,
  UpdateCandidateProfileInput,
} from "./types";
import {
  CandidateProfileConflictError,
  CandidateProfileNotFoundError,
} from "./errors";

export class DrizzleCandidateProfileRepository implements CandidateProfileRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async findById(id: string): Promise<CandidateProfile | null> {
    const [row] = await this.db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, id))
      .limit(1);

    return row ?? null;
  }

  async findByUserId(userId: string): Promise<CandidateProfile | null> {
    const [row] = await this.db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, userId))
      .limit(1);

    return row ?? null;
  }

  async create(input: CreateCandidateProfileInput): Promise<CandidateProfile> {
    try {
      const [created] = await this.db
        .insert(candidateProfiles)
        .values({
          id: input.id,
          userId: input.userId,
        })
        .returning();

      return created!;
    } catch (error: unknown) {
      const isUniqueViolation =
        (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505") ||
        (error && typeof error === "object" && "cause" in error && (error as { cause: { code?: string } }).cause?.code === "23505") ||
        (error instanceof Error && (error.message.includes("23505") || error.message.includes("unique constraint")));

      if (isUniqueViolation) {
        throw new CandidateProfileConflictError(
          "Candidate profile already exists for this user"
        );
      }
      throw error;
    }
  }

  async update(
    userId: string,
    _input?: UpdateCandidateProfileInput
  ): Promise<CandidateProfile> {
    const [updated] = await this.db
      .update(candidateProfiles)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(candidateProfiles.userId, userId))
      .returning();

    if (!updated) {
      throw new CandidateProfileNotFoundError("Candidate profile not found");
    }

    return updated;
  }
}
