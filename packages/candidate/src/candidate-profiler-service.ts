import type { AiProvider } from "@job-hub/ai";
import { defaultAiProvider } from "@job-hub/ai";
import type { CandidateProfile, CandidateProfileRepository } from "./types";
import type { ResumeRepository } from "./resume-repository";
import { DrizzleCandidateProfileRepository } from "./repository";
import { DrizzleResumeRepository } from "./resume-repository";
import {
  structuredCandidateProfileSchema,
  type StructuredCandidateProfile,
} from "./profiler-schema";
import {
  CANDIDATE_PROFILER_SYSTEM_PROMPT,
  buildCandidateProfilerUserPrompt,
} from "./profiler-prompt";
import {
  CandidateProfileNotFoundError,
  ResumeForbiddenError,
  ResumeNotFoundError,
  ResumeValidationError,
} from "./errors";

export interface ProfileResumeInput {
  userId: string;
  resumeId: string;
}

export class CandidateProfilerService {
  constructor(
    private readonly candidateProfileRepository: CandidateProfileRepository = new DrizzleCandidateProfileRepository(),
    private readonly resumeRepository: ResumeRepository = new DrizzleResumeRepository(),
    private readonly aiProvider: AiProvider = defaultAiProvider
  ) {}

  /**
   * Profiles an extracted resume text into a structured candidate profile.
   *
   * Enforces:
   * 1. Session-derived ownership (candidate owns resume)
   * 2. Non-empty extracted text boundary
   * 3. LLM structured generation with Zod validation
   * 4. Idempotent persistence on candidate_profiles table
   */
  async profileResume(input: ProfileResumeInput): Promise<CandidateProfile> {
    // 1. Verify candidate profile exists
    const profile = await this.candidateProfileRepository.findByUserId(input.userId);
    if (!profile) {
      throw new CandidateProfileNotFoundError("Candidate profile not found");
    }

    // 2. Verify resume exists and ownership is valid
    const resume = await this.resumeRepository.findById(input.resumeId);
    if (!resume) {
      throw new ResumeNotFoundError();
    }

    if (resume.candidateProfileId !== profile.id) {
      throw new ResumeForbiddenError("You do not have permission to profile this resume.");
    }

    // 3. Verify extracted text is present and meaningful
    if (!resume.extractedText || resume.extractedText.trim().length === 0) {
      throw new ResumeValidationError(
        "Resume does not contain extracted text. Please perform text extraction first."
      );
    }

    // 4. Invoke AI provider with strict Zod structured output validation
    const userPrompt = buildCandidateProfilerUserPrompt(resume.extractedText);

    const structuredData = await this.aiProvider.generateStructuredOutput<StructuredCandidateProfile>({
      systemPrompt: CANDIDATE_PROFILER_SYSTEM_PROMPT,
      userPrompt,
      schema: structuredCandidateProfileSchema,
      schemaName: "candidate_profile",
    });

    // 5. Atomic persistence into PostgreSQL candidate_profiles
    const updatedProfile = await this.candidateProfileRepository.updateStructuredProfile(
      profile.id,
      {
        headline: structuredData.headline ?? null,
        profileData: structuredData,
        sourceResumeId: resume.id,
        profiledAt: new Date(),
      }
    );

    return updatedProfile;
  }
}

export const candidateProfilerService = new CandidateProfilerService();
