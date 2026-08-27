import type { CandidateProfileRepository } from "./types";
import type {
  CandidatePreferences,
  CandidatePreferencesRepository,
  UpdateCandidatePreferencesInput,
} from "./preferences-types";
import { DrizzleCandidateProfileRepository } from "./repository";
import { DrizzleCandidatePreferencesRepository } from "./preferences-repository";
import { updatePreferencesInputSchema } from "./preferences-validation";
import {
  CandidateProfileNotFoundError,
  CandidateProfileValidationError,
} from "./errors";

export class CandidatePreferencesService {
  constructor(
    private readonly profileRepository: CandidateProfileRepository = new DrizzleCandidateProfileRepository(),
    private readonly preferencesRepository: CandidatePreferencesRepository = new DrizzleCandidatePreferencesRepository()
  ) {}

  /**
   * Retrieves candidate job preferences for the authenticated user.
   * Derives candidate identity strictly from userId.
   */
  async getPreferences(userId: string): Promise<CandidatePreferences> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      throw new CandidateProfileNotFoundError("Candidate profile not found");
    }

    const preferences = await this.preferencesRepository.findByProfileId(profile.id);
    if (preferences) {
      return preferences;
    }

    // Default uninitialized preferences
    return {
      id: "",
      candidateProfileId: profile.id,
      remotePreference: "UNKNOWN",
      preferredLocations: [],
      salaryMin: null,
      salaryCurrency: "USD",
      targetRoles: [],
      experienceLevel: "MID",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Updates candidate job preferences for the authenticated user.
   * Enforces server-derived ownership and strict Zod validation.
   */
  async updatePreferences(
    userId: string,
    rawInput: unknown
  ): Promise<CandidatePreferences> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      throw new CandidateProfileNotFoundError("Candidate profile not found");
    }

    const validation = updatePreferencesInputSchema.safeParse(rawInput);
    if (!validation.success) {
      throw new CandidateProfileValidationError(
        `Invalid candidate preferences input: ${validation.error.issues.map((i) => i.message).join(", ")}`
      );
    }

    const updated = await this.preferencesRepository.upsert(
      profile.id,
      validation.data as UpdateCandidatePreferencesInput
    );

    return updated;
  }
}

export const candidatePreferencesService = new CandidatePreferencesService();
