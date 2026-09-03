/**
 * Job Hub — Phase 7 / Step 7.1
 * Resume Tailoring Domain Types & Truthfulness Contracts
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 9 & §5 Phase 7
 * - 02_how_to_build.md §11 ("Resume tailoring") & §18
 * - 04_ai_agent_skills.md §11 ("Resume Tailoring Skill") & §21 ("ResumeTailor") & §23 ("AI engineering rules")
 */

import type { UnifiedCandidateProfile } from "@job-hub/candidate";
import type { Job } from "@job-hub/jobs";

export const TAILORED_RESUME_STATUS = {
  DRAFT: "DRAFT",
  GENERATED: "GENERATED",
  APPROVED: "APPROVED",
} as const;

export type TailoredResumeStatus =
  (typeof TAILORED_RESUME_STATUS)[keyof typeof TAILORED_RESUME_STATUS];

export interface TailoredContactInfo {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
}

export interface TailoredSummary {
  headline: string;
  text: string;
  keyThemes: string[];
}

export interface TailoredBullet {
  text: string;
  sourceCompany: string;
  matchingSkills: string[];
  confidence: "VERIFIED" | "INFERRED";
}

export interface TailoredExperience {
  company: string;
  role: string;
  startDate: string;
  endDate?: string | null;
  isCurrent: boolean;
  location?: string;
  bullets: TailoredBullet[];
  technologies: string[];
}

export interface TailoredProject {
  name: string;
  description: string;
  technologies: string[];
  repositoryUrl?: string;
  liveUrl?: string;
  highlight: string;
  sourceProjectId?: string;
}

export interface TailoredSkillGroup {
  category: string;
  skills: string[];
}

export interface TailoredEducation {
  institution: string;
  degree?: string;
  fieldOfStudy?: string;
  graduationYear?: number;
}

/**
 * Canonical Structured Tailored Resume Data
 * Generated from Candidate Evidence + Target Job.
 * Master resume remains strictly immutable.
 */
export interface TailoredResumeData {
  contact: TailoredContactInfo;
  targetTitle: string;
  summary: TailoredSummary;
  skills: TailoredSkillGroup[];
  experiences: TailoredExperience[];
  projects: TailoredProject[];
  education: TailoredEducation[];
  strengths: string[];
}

export interface TailoredResumeRecord {
  id: string;
  candidateProfileId: string;
  jobId: string;
  sourceResumeId: string;
  targetTitle: string | null;
  tailoredData: TailoredResumeData;
  truthfulnessScore: number | null;
  status: TailoredResumeStatus;
  version: number;
  storageKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TailorResumeInput {
  candidate: UnifiedCandidateProfile;
  masterResumeText: string;
  sourceResumeId: string;
  job: Job;
  targetTitle?: string;
  userInstructions?: string;
}

export type TruthfulnessViolationType =
  | "HALLUCINATED_EMPLOYER"
  | "FABRICATED_DATES"
  | "FABRICATED_PROJECT"
  | "UNGROUNDED_SKILL"
  | "FABRICATED_METRIC"
  | "FABRICATED_EDUCATION";

export interface TruthfulnessViolation {
  type: TruthfulnessViolationType;
  message: string;
  claim: string;
}

export interface TruthfulnessValidationResult {
  isValid: boolean;
  truthfulnessScore: number; // 0.00 to 100.00
  violations: TruthfulnessViolation[];
  auditTrail: {
    verifiedCompanies: string[];
    verifiedSkillsCount: number;
    verifiedProjectsCount: number;
    auditedBulletsCount: number;
  };
}

export interface CreateTailoredResumeInput {
  candidateProfileId: string;
  jobId: string;
  sourceResumeId: string;
  targetTitle?: string | null;
  tailoredData: TailoredResumeData;
  truthfulnessScore?: number | null;
  status?: TailoredResumeStatus;
  storageKey?: string | null;
}

export interface TailoredResumeRepository {
  create(input: CreateTailoredResumeInput): Promise<TailoredResumeRecord>;
  findById(id: string, candidateProfileId: string): Promise<TailoredResumeRecord | null>;
  findLatestByCandidateAndJob(
    candidateProfileId: string,
    jobId: string
  ): Promise<TailoredResumeRecord | null>;
  listByCandidate(
    candidateProfileId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<TailoredResumeRecord[]>;
  updateStatus(
    id: string,
    candidateProfileId: string,
    status: TailoredResumeStatus
  ): Promise<TailoredResumeRecord>;
  delete(id: string, candidateProfileId: string): Promise<boolean>;
}
