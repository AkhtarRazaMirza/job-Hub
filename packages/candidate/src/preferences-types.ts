import type { RemotePreference } from "./types";

export type ExperienceLevel =
  | "ENTRY"
  | "MID"
  | "SENIOR"
  | "LEAD"
  | "PRINCIPAL";

/**
 * Candidate Preferences domain entity.
 * Grounded in 01_build_the_system.md §4 Step 1 and 02_how_to_build.md §2.
 */
export interface CandidatePreferences {
  id: string;
  candidateProfileId: string;
  remotePreference: RemotePreference;
  preferredLocations: string[];
  salaryMin: number | null;
  salaryCurrency: string;
  targetRoles: string[];
  experienceLevel: ExperienceLevel;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateCandidatePreferencesInput {
  remotePreference?: RemotePreference;
  preferredLocations?: string[];
  salaryMin?: number | null;
  salaryCurrency?: string;
  targetRoles?: string[];
  experienceLevel?: ExperienceLevel;
}

export interface CandidatePreferencesRepository {
  findByProfileId(candidateProfileId: string): Promise<CandidatePreferences | null>;
  upsert(
    candidateProfileId: string,
    input: UpdateCandidatePreferencesInput
  ): Promise<CandidatePreferences>;
}
