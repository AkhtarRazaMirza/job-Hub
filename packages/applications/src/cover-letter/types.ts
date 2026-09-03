/**
 * Job Hub — Phase 7 / Step 7.3
 * Custom Cover Letter Domain Types
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 9 ("Generate cover letter when useful")
 * - 02_how_to_build.md §12 ("Generate: cover letter")
 * - 04_ai_agent_skills.md §12 ("Cover Letter Skill") & §21 ("CoverLetterWriter")
 */

import type { UnifiedCandidateProfile } from "@job-hub/candidate";
import type { Job } from "@job-hub/jobs";

export const COVER_LETTER_STATUS = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
} as const;

export type CoverLetterStatus =
  (typeof COVER_LETTER_STATUS)[keyof typeof COVER_LETTER_STATUS];

export interface CoverLetterData {
  title: string;
  salutation: string;
  hook: string;
  bodyParagraphs: string[];
  callToAction: string;
  signoff: string;
  content: string; // Full assembled editable letter
  highlightedSkills: string[];
  highlightedProjects: string[];
}

export interface CoverLetterRecord {
  id: string;
  candidateProfileId: string;
  jobId: string;
  title: string;
  salutation: string;
  hook: string;
  bodyParagraphs: string[];
  callToAction: string;
  signoff: string;
  content: string;
  highlightedSkills: string[];
  highlightedProjects: string[];
  status: CoverLetterStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GenerateCoverLetterInput {
  candidate: UnifiedCandidateProfile;
  job: Job;
  customNotes?: string;
}

export interface CoverLetterTruthfulnessResult {
  isValid: boolean;
  violations: Array<{
    type: "UNGROUNDED_SKILL" | "FABRICATED_PROJECT" | "FABRICATED_METRIC" | "FABRICATED_CLAIM";
    message: string;
    claim: string;
  }>;
}

export interface CreateCoverLetterInput {
  candidateProfileId: string;
  jobId: string;
  data: CoverLetterData;
  status?: CoverLetterStatus;
}

export interface UpdateCoverLetterInput {
  id: string;
  candidateProfileId: string;
  content: string;
  status?: CoverLetterStatus;
}

export interface CoverLetterRepository {
  create(input: CreateCoverLetterInput): Promise<CoverLetterRecord>;
  findById(id: string, candidateProfileId: string): Promise<CoverLetterRecord | null>;
  findLatestByCandidateAndJob(
    candidateProfileId: string,
    jobId: string
  ): Promise<CoverLetterRecord | null>;
  update(input: UpdateCoverLetterInput): Promise<CoverLetterRecord>;
  delete(id: string, candidateProfileId: string): Promise<boolean>;
}
