import { eq } from "drizzle-orm";
import { db as defaultDb, candidateProfiles, type Database } from "@job-hub/db";
import type { CandidateProfile, CandidateProfileRepository } from "../types";
import { DrizzleCandidateProfileRepository } from "../repository";
import type { CandidatePreferencesRepository } from "../preferences-types";
import { DrizzleCandidatePreferencesRepository } from "../preferences-repository";
import type { ProjectsRepository } from "../project-types";
import { DrizzleProjectsRepository } from "../project-repository";
import type { UnifiedCandidateProfile, TruthfulnessSummary } from "./types";
import {
  updateLinkedInUrlInputSchema,
  type UpdateLinkedInUrlInput,
} from "../linkedin-validation";
import {
  CandidateProfileNotFoundError,
  CandidateProfileValidationError,
} from "../errors";

export class UnifiedProfileService {
  constructor(
    private readonly profileRepository: CandidateProfileRepository = new DrizzleCandidateProfileRepository(),
    private readonly preferencesRepository: CandidatePreferencesRepository = new DrizzleCandidatePreferencesRepository(),
    private readonly projectsRepository: ProjectsRepository = new DrizzleProjectsRepository(),
    private readonly db: Database = defaultDb
  ) {}

  /**
   * Links or updates a candidate's verified LinkedIn profile URL.
   * Grounded in 01_build_the_system.md §4 Step 1 ("Optional LinkedIn").
   */
  async updateLinkedInUrl(
    userId: string,
    rawInput: unknown
  ): Promise<CandidateProfile> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      throw new CandidateProfileNotFoundError("Candidate profile not found.");
    }

    const validation = updateLinkedInUrlInputSchema.safeParse(rawInput);
    if (!validation.success) {
      throw new CandidateProfileValidationError(
        `Invalid LinkedIn URL: ${validation.error.issues.map((i) => i.message).join(", ")}`
      );
    }

    const data: UpdateLinkedInUrlInput = validation.data;

    const [updated] = await this.db
      .update(candidateProfiles)
      .set({
        linkedinUrl: data.linkedinUrl,
        updatedAt: new Date(),
      })
      .where(eq(candidateProfiles.id, profile.id))
      .returning();

    return {
      id: updated!.id,
      userId: updated!.userId,
      headline: updated!.headline,
      portfolioUrl: updated!.portfolioUrl,
      linkedinUrl: updated!.linkedinUrl,
      profileData: (updated!.profileData as any) ?? null,
      sourceResumeId: updated!.sourceResumeId,
      profiledAt: updated!.profiledAt,
      createdAt: updated!.createdAt,
      updatedAt: updated!.updatedAt,
    };
  }

  /**
   * Aggregates all candidate profile data across all ingestion channels
   * (Resume, GitHub, Portfolio, LinkedIn, Preferences) and evaluates truthfulness metrics.
   * Mandated by 01_build_the_system.md §2 & §4, and 04_ai_agent_skills.md §2 & §21 (ResumeVerifier).
   */
  async getUnifiedProfile(userId: string): Promise<UnifiedCandidateProfile> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      throw new CandidateProfileNotFoundError("Candidate profile not found.");
    }

    const preferences = await this.preferencesRepository.findByProfileId(profile.id);
    const dbProjects = await this.projectsRepository.findByProfileId(profile.id);

    const profileData = profile.profileData;
    const skills = profileData?.technicalSkills || [];
    const experiences = profileData?.experience || [];
    const education = profileData?.education || [];
    const achievements = profileData?.achievements || [];

    // Audit truthfulness breakdown across all facts
    let verifiedCount = 0;
    let inferredCount = 0;
    let userProvidedCount = 0;

    // 1. Projects audit
    for (const proj of dbProjects) {
      if (proj.verificationStatus === "VERIFIED") {
        verifiedCount++;
      } else if (proj.verificationStatus === "USER_PROVIDED") {
        userProvidedCount++;
      } else {
        inferredCount++;
      }
    }

    // 2. Structured resume facts audit
    for (const s of skills) {
      if (s.status === "VERIFIED") verifiedCount++;
      else if (s.status === "USER_PROVIDED") userProvidedCount++;
      else inferredCount++;
    }

    for (const e of experiences) {
      if (e.status === "VERIFIED") verifiedCount++;
      else if (e.status === "USER_PROVIDED") userProvidedCount++;
      else inferredCount++;
    }

    for (const ed of education) {
      if (ed.status === "VERIFIED") verifiedCount++;
      else if (ed.status === "USER_PROVIDED") userProvidedCount++;
      else inferredCount++;
    }

    for (const a of achievements) {
      if (a.status === "VERIFIED") verifiedCount++;
      else if (a.status === "USER_PROVIDED") userProvidedCount++;
      else inferredCount++;
    }

    // 3. User-provided preferences audit
    if (preferences) {
      userProvidedCount += 3; // remotePreference, experienceLevel, salary
    }

    if (profile.linkedinUrl) {
      userProvidedCount++;
    }

    if (profile.portfolioUrl) {
      userProvidedCount++;
    }

    // 4. Missing required fields check (01_build_the_system.md §2 & §4)
    const missingRequiredFields: string[] = [];
    if (!profile.headline) missingRequiredFields.push("Professional Headline");
    if (skills.length === 0) missingRequiredFields.push("Technical Skills");
    if (!preferences) {
      missingRequiredFields.push("Job Preferences (Remote & Salary)");
    } else {
      if (preferences.targetRoles.length === 0) missingRequiredFields.push("Target Roles");
      if (!preferences.salaryMin) missingRequiredFields.push("Minimum Salary Expectation");
    }
    if (dbProjects.length === 0 && (!profileData?.projects || profileData.projects.length === 0)) {
      missingRequiredFields.push("Projects (GitHub or Portfolio)");
    }

    // 5. Compute overall profile completion percentage
    let completionScore = 0;
    if (profile.headline) completionScore += 15;
    if (profile.sourceResumeId || profile.profileData) completionScore += 25;
    if (skills.length > 0) completionScore += 15;
    if (dbProjects.length > 0) completionScore += 20;
    if (preferences) completionScore += 15;
    if (profile.linkedinUrl || profile.portfolioUrl) completionScore += 10;

    const truthfulness: TruthfulnessSummary = {
      verifiedCount,
      inferredCount,
      userProvidedCount,
      userRequiredCount: missingRequiredFields.length,
      missingRequiredFields,
      profileCompletionPercentage: Math.min(100, completionScore),
    };

    return {
      profile,
      preferences,
      projects: dbProjects,
      skills,
      experiences,
      education,
      achievements,
      truthfulness,
    };
  }
}

export const unifiedProfileService = new UnifiedProfileService();
