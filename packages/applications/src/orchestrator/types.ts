/**
 * Job Hub — Phase 7 / Step 7.5
 * Application Preparation Package Orchestrator Domain Types
 */

import type { TailoredResumeRecord } from "../tailoring/types";
import type { CoverLetterRecord } from "../cover-letter/types";
import type { ApplicationAnswerRecord } from "../answers/types";

export interface PreparedJobSummary {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remoteType: string;
  skills: string[];
}

export interface ApplicationPreparationPackage {
  applicationId: string;
  candidateProfileId: string;
  jobId: string;
  job: PreparedJobSummary;
  tailoredResume: TailoredResumeRecord;
  resumeDocument: {
    storageKey: string;
    mimeType: string;
  };
  coverLetter: CoverLetterRecord;
  answers: ApplicationAnswerRecord[];
  status: string; // "PREPARED"
  hasUserRequiredFields: boolean;
  unconfirmedCount: number;
  isApproved: boolean;
}

export interface PreparePackageInput {
  candidateProfileId: string;
  jobId: string;
  questions?: string[];
  customCoverLetterNotes?: string;
}

export interface ApprovePackageInput {
  applicationId: string;
  candidateProfileId: string;
}
