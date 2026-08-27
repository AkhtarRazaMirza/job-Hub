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

  private toEntity(row: {
    id: string;
    userId: string;
    headline?: string | null;
    portfolioUrl?: string | null;
    linkedinUrl?: string | null;
    profileData?: unknown;
    sourceResumeId?: string | null;
    profiledAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): CandidateProfile {
    return {
      id: row.id,
      userId: row.userId,
      headline: row.headline ?? null,
      portfolioUrl: row.portfolioUrl ?? null,
      linkedinUrl: row.linkedinUrl ?? null,
      profileData: (row.profileData as any) ?? null,
      sourceResumeId: row.sourceResumeId ?? null,
      profiledAt: row.profiledAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findById(id: string): Promise<CandidateProfile | null> {
    const [row] = await this.db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, id))
      .limit(1);

    return row ? this.toEntity(row) : null;
  }

  async findByUserId(userId: string): Promise<CandidateProfile | null> {
    const [row] = await this.db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, userId))
      .limit(1);

    return row ? this.toEntity(row) : null;
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

      return this.toEntity(created!);
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

    return this.toEntity(updated);
  }

  async updateStructuredProfile(
    id: string,
    input: {
      headline?: string | null;
      profileData: any;
      sourceResumeId: string;
      profiledAt: Date;
    }
  ): Promise<CandidateProfile> {
    const [updated] = await this.db
      .update(candidateProfiles)
      .set({
        headline: input.headline ?? null,
        profileData: input.profileData,
        sourceResumeId: input.sourceResumeId,
        profiledAt: input.profiledAt,
        updatedAt: new Date(),
      })
      .where(eq(candidateProfiles.id, id))
      .returning();

    if (!updated) {
      throw new CandidateProfileNotFoundError("Candidate profile not found");
    }

    return this.toEntity(updated);
  }
}
