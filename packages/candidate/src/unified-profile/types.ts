import type { CandidateProfile } from "../types";
import type { CandidatePreferences } from "../preferences-types";
import type { Project } from "../project-types";
import type {
  CandidateSkill,
  CandidateExperience,
  CandidateEducation,
  CandidateAchievement,
} from "../profiler-schema";

/**
 * Truthfulness audit summary across all candidate profile facts.
 * Mandated by 01_build_the_system.md §2, 02_how_to_build.md §12, and 04_ai_agent_skills.md §2.
 */
export interface TruthfulnessSummary {
  verifiedCount: number; // Facts verified by repository code proof
  inferredCount: number; // Unverified claims from resume or portfolio
  userProvidedCount: number; // Facts explicitly confirmed or provided by user
  userRequiredCount: number; // Essential missing fields requiring user input
  missingRequiredFields: string[];
  profileCompletionPercentage: number; // 0 to 100
}

/**
 * Unified Candidate Profile aggregating all candidate inputs into one canonical truthful entity.
 * Mandated by 01_build_the_system.md §4 Step 1 & 2, and 04_ai_agent_skills.md §21 (ResumeVerifier).
 */
export interface UnifiedCandidateProfile {
  profile: CandidateProfile;
  preferences: CandidatePreferences | null;
  projects: Project[];
  skills: CandidateSkill[];
  experiences: CandidateExperience[];
  education: CandidateEducation[];
  achievements: CandidateAchievement[];
  truthfulness: TruthfulnessSummary;
}
