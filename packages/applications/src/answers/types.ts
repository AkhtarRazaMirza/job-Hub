/**
 * Job Hub — Phase 7 / Step 7.4
 * Application Answers Domain Types
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 9 ("Generate application answers with explicit confidence")
 * - 02_how_to_build.md §12 ("Generate: application answers")
 * - 04_ai_agent_skills.md §13 ("Application Question Answering Skill") & §21 ("ApplicationAnswerer")
 */

import type { UnifiedCandidateProfile } from "@job-hub/candidate";
import type { Job } from "@job-hub/jobs";

export const ANSWER_CONFIDENCE = {
  VERIFIED: "VERIFIED",
  INFERRED: "INFERRED",
  USER_REQUIRED: "USER_REQUIRED",
} as const;

export type AnswerConfidence =
  (typeof ANSWER_CONFIDENCE)[keyof typeof ANSWER_CONFIDENCE];

export interface ApplicationAnswerItem {
  question: string;
  answer: string;
  confidence: AnswerConfidence;
  reasoning: string;
  sourceEvidence?: string;
  isConfirmed: boolean;
}

export interface ApplicationAnswerRecord {
  id: string;
  applicationId: string;
  question: string;
  answer: string;
  confidence: AnswerConfidence;
  isConfirmed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GenerateAnswersInput {
  candidate: UnifiedCandidateProfile;
  job: Job;
  questions: string[];
  masterResumeText?: string;
}

export interface AnswersTruthfulnessResult {
  isValid: boolean;
  violations: Array<{
    question: string;
    violationType: "UNAUTHORIZED_CONFIDENCE" | "FABRICATED_ANSWER" | "MISSING_EVIDENCE";
    message: string;
  }>;
}

export interface UpdateAnswerInput {
  answerId: string;
  applicationId: string;
  candidateProfileId: string;
  answer: string;
  isConfirmed?: boolean;
}

export interface ApplicationAnswerRepository {
  saveAnswers(
    applicationId: string,
    candidateProfileId: string,
    answers: ApplicationAnswerItem[]
  ): Promise<ApplicationAnswerRecord[]>;
  findByApplicationId(
    applicationId: string,
    candidateProfileId: string
  ): Promise<ApplicationAnswerRecord[]>;
  updateAnswer(input: UpdateAnswerInput): Promise<ApplicationAnswerRecord>;
}
