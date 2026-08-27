import { DrizzleCandidateProfileRepository } from "./repository";
import type {
  CandidateProfile,
  CandidateProfileRepository,
} from "./types";
import {
  CandidateProfileConflictError,
  CandidateProfileNotFoundError,
  CandidateProfileValidationError,
} from "./errors";
import {
  createCandidateProfileSchema,
  createProfileInputSchema,
  updateProfileInputSchema,
  type CreateProfileInput,
  type UpdateProfileInput,
} from "./validation";

export class CandidateProfileService {
  constructor(
    private readonly repository: CandidateProfileRepository = new DrizzleCandidateProfileRepository()
  ) {}

  async getProfile(userId: string): Promise<CandidateProfile | null> {
    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      throw new CandidateProfileValidationError("User ID is required");
    }
    return this.repository.findByUserId(userId);
  }

  async createProfile(
    userId: string,
    input?: CreateProfileInput,
    id?: string
  ): Promise<CandidateProfile> {
    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      throw new CandidateProfileValidationError("User ID is required");
    }

    if (input !== undefined && input !== null) {
      const clientParseResult = createProfileInputSchema.safeParse(input);
      if (!clientParseResult.success) {
        throw new CandidateProfileValidationError(
          clientParseResult.error.issues[0]?.message || "Invalid create profile input"
        );
      }
    }

    const parseResult = createCandidateProfileSchema.safeParse({ userId, id });
    if (!parseResult.success) {
      throw new CandidateProfileValidationError(
        parseResult.error.issues[0]?.message || "Invalid candidate profile data"
      );
    }

    const existing = await this.repository.findByUserId(userId);
    if (existing) {
      throw new CandidateProfileConflictError(
        "Candidate profile already exists for this user"
      );
    }

    return this.repository.create({ userId, id });
  }

  async updateProfile(
    userId: string,
    input?: UpdateProfileInput
  ): Promise<CandidateProfile> {
    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      throw new CandidateProfileValidationError("User ID is required");
    }

    if (input !== undefined && input !== null) {
      const parseResult = updateProfileInputSchema.safeParse(input);
      if (!parseResult.success) {
        throw new CandidateProfileValidationError(
          parseResult.error.issues[0]?.message || "Invalid update input"
        );
      }
    }

    const existing = await this.repository.findByUserId(userId);
    if (!existing) {
      throw new CandidateProfileNotFoundError("Candidate profile not found");
    }

    return this.repository.update(userId, input);
  }
}

export const candidateProfileService = new CandidateProfileService();
