import { eq } from "drizzle-orm";
import { db as defaultDb, candidatePreferences, type Database } from "@job-hub/db";
import type { RemotePreference } from "./types";
import type {
  CandidatePreferences,
  CandidatePreferencesRepository,
  ExperienceLevel,
  UpdateCandidatePreferencesInput,
} from "./preferences-types";

export class DrizzleCandidatePreferencesRepository
  implements CandidatePreferencesRepository
{
  constructor(private readonly db: Database = defaultDb) {}

  private toEntity(row: {
    id: string;
    candidateProfileId: string;
    remotePreference: string;
    preferredLocations: unknown;
    salaryMin: number | null;
    salaryCurrency: string | null;
    targetRoles: unknown;
    experienceLevel: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): CandidatePreferences {
    return {
      id: row.id,
      candidateProfileId: row.candidateProfileId,
      remotePreference: (row.remotePreference as RemotePreference) || "UNKNOWN",
      preferredLocations: Array.isArray(row.preferredLocations)
        ? (row.preferredLocations as string[])
        : [],
      salaryMin: row.salaryMin ?? null,
      salaryCurrency: row.salaryCurrency ?? "USD",
      targetRoles: Array.isArray(row.targetRoles)
        ? (row.targetRoles as string[])
        : [],
      experienceLevel: (row.experienceLevel as ExperienceLevel) || "MID",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findByProfileId(
    candidateProfileId: string
  ): Promise<CandidatePreferences | null> {
    const [row] = await this.db
      .select()
      .from(candidatePreferences)
      .where(eq(candidatePreferences.candidateProfileId, candidateProfileId))
      .limit(1);

    return row ? this.toEntity(row) : null;
  }

  async upsert(
    candidateProfileId: string,
    input: UpdateCandidatePreferencesInput
  ): Promise<CandidatePreferences> {
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.remotePreference !== undefined) {
      updateValues.remotePreference = input.remotePreference;
    }
    if (input.preferredLocations !== undefined) {
      updateValues.preferredLocations = input.preferredLocations;
    }
    if (input.salaryMin !== undefined) {
      updateValues.salaryMin = input.salaryMin;
    }
    if (input.salaryCurrency !== undefined) {
      updateValues.salaryCurrency = input.salaryCurrency;
    }
    if (input.targetRoles !== undefined) {
      updateValues.targetRoles = input.targetRoles;
    }
    if (input.experienceLevel !== undefined) {
      updateValues.experienceLevel = input.experienceLevel;
    }

    const [row] = await this.db
      .insert(candidatePreferences)
      .values({
        candidateProfileId,
        remotePreference: input.remotePreference ?? "UNKNOWN",
        preferredLocations: input.preferredLocations ?? [],
        salaryMin: input.salaryMin !== undefined ? input.salaryMin : null,
        salaryCurrency: input.salaryCurrency ?? "USD",
        targetRoles: input.targetRoles ?? [],
        experienceLevel: input.experienceLevel ?? "MID",
      })
      .onConflictDoUpdate({
        target: candidatePreferences.candidateProfileId,
        set: updateValues,
      })
      .returning();

    return this.toEntity(row!);
  }
}
