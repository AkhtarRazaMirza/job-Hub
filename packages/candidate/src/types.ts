/**
 * Candidate Domain Foundation Types
 * Job Hub — Phase 2 / Step 2.1
 */

/**
 * Verification status indicating the confidence and origin of candidate facts.
 *
 * Grounded in Job Hub Core Product Rule:
 * "The AI must work from verified candidate information...
 * distinguish verified facts from inference. If information is missing: USER_REQUIRED"
 * (01_build_the_system.md §2, 02_how_to_build.md §12, 04_ai_agent_skills.md §2)
 */
export type VerificationStatus = "VERIFIED" | "INFERRED" | "USER_REQUIRED";

/**
 * Remote preference classifications explicitly defined in Job Hub specifications.
 * "Remote alone must not be interpreted as worldwide."
 * (01_build_the_system.md §4, 04_ai_agent_skills.md §6)
 */
export type RemotePreference =
  | "WORLDWIDE_REMOTE"
  | "COUNTRY_REMOTE"
  | "REGION_REMOTE"
  | "HYBRID"
  | "ONSITE"
  | "UNKNOWN";

/**
 * Encapsulates a candidate domain fact with its truthfulness/verification status
 * and optional audit source/evidence string.
 *
 * Implements rule: "Store source evidence for important candidate facts."
 * (04_ai_agent_skills.md §23)
 */
export interface CandidateFact<T> {
  value: T;
  status: VerificationStatus;
  source?: string;
}

/**
 * Core candidate profile domain identity.
 * Represents the candidate entity referencing an authenticated user (1:1).
 */
export interface CandidateProfile {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a candidate profile domain identity.
 */
export interface CreateCandidateProfileInput {
  userId: string;
  id?: string;
}

/**
 * Input for updating a candidate profile.
 * Note: userId can NEVER be updated.
 */
export type UpdateCandidateProfileInput = Record<string, unknown>;

/**
 * Repository interface defining candidate profile storage contracts.
 * Decouples candidate domain logic from database infrastructure.
 */
export interface CandidateProfileRepository {
  findById(id: string): Promise<CandidateProfile | null>;
  findByUserId(userId: string): Promise<CandidateProfile | null>;
  create(input: CreateCandidateProfileInput): Promise<CandidateProfile>;
  update(userId: string, input?: UpdateCandidateProfileInput): Promise<CandidateProfile>;
}
