/**
 * Job Hub — Phase 6 / Step 6.2
 * Application Domain Types & Lifecycle Definitions
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 12 & 13, §5 Phase 6 ("Application tracking")
 * - 02_how_to_build.md §2, §10, §14, §17
 * - 04_ai_agent_skills.md §17 & §18
 */

export const APPLICATION_STATUS = {
  PREPARED: "PREPARED",
  APPLIED: "APPLIED",
  UNDER_REVIEW: "UNDER_REVIEW",
  INTERVIEW_SCHEDULED: "INTERVIEW_SCHEDULED",
  INTERVIEW_COMPLETED: "INTERVIEW_COMPLETED",
  OFFER: "OFFER",
  REJECTED: "REJECTED",
  WITHDRAWN: "WITHDRAWN",
} as const;

export type ApplicationStatus =
  (typeof APPLICATION_STATUS)[keyof typeof APPLICATION_STATUS];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  PREPARED: "Prepared",
  APPLIED: "Applied",
  UNDER_REVIEW: "Under Review",
  INTERVIEW_SCHEDULED: "Interview Scheduled",
  INTERVIEW_COMPLETED: "Interview Completed",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const TERMINAL_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  APPLICATION_STATUS.REJECTED,
  APPLICATION_STATUS.WITHDRAWN,
]);

/**
 * Valid lifecycle transitions mapping.
 * Each key specifies which next statuses are valid from that state.
 * Grounded in 01_build_the_system.md §4 Step 13.
 */
export const VALID_APPLICATION_TRANSITIONS: Record<
  ApplicationStatus,
  readonly ApplicationStatus[]
> = {
  PREPARED: [
    APPLICATION_STATUS.APPLIED,
    APPLICATION_STATUS.WITHDRAWN,
  ],
  APPLIED: [
    APPLICATION_STATUS.UNDER_REVIEW,
    APPLICATION_STATUS.INTERVIEW_SCHEDULED,
    APPLICATION_STATUS.REJECTED,
    APPLICATION_STATUS.WITHDRAWN,
  ],
  UNDER_REVIEW: [
    APPLICATION_STATUS.INTERVIEW_SCHEDULED,
    APPLICATION_STATUS.OFFER,
    APPLICATION_STATUS.REJECTED,
    APPLICATION_STATUS.WITHDRAWN,
  ],
  INTERVIEW_SCHEDULED: [
    APPLICATION_STATUS.INTERVIEW_COMPLETED,
    APPLICATION_STATUS.OFFER,
    APPLICATION_STATUS.REJECTED,
    APPLICATION_STATUS.WITHDRAWN,
  ],
  INTERVIEW_COMPLETED: [
    APPLICATION_STATUS.INTERVIEW_SCHEDULED, // Successive interview round
    APPLICATION_STATUS.OFFER,
    APPLICATION_STATUS.REJECTED,
    APPLICATION_STATUS.WITHDRAWN,
  ],
  OFFER: [
    APPLICATION_STATUS.WITHDRAWN, // Candidate declines offer
    APPLICATION_STATUS.REJECTED,  // Offer rescinded
  ],
  REJECTED: [],  // Terminal state
  WITHDRAWN: [], // Terminal state
};

export const APPLICATION_DOCUMENT_TYPE = {
  RESUME: "RESUME",
  COVER_LETTER: "COVER_LETTER",
  OTHER: "OTHER",
} as const;

export type ApplicationDocumentType =
  (typeof APPLICATION_DOCUMENT_TYPE)[keyof typeof APPLICATION_DOCUMENT_TYPE];

export const APPLICATION_ANSWER_CONFIDENCE = {
  VERIFIED: "VERIFIED",
  INFERRED: "INFERRED",
  USER_REQUIRED: "USER_REQUIRED",
} as const;

export type ApplicationAnswerConfidence =
  (typeof APPLICATION_ANSWER_CONFIDENCE)[keyof typeof APPLICATION_ANSWER_CONFIDENCE];

export const APPLICATION_EVENT_TYPE = {
  CREATED: "CREATED",
  STATUS_CHANGE: "STATUS_CHANGE",
  NOTE_ADDED: "NOTE_ADDED",
  FOLLOW_UP_SCHEDULED: "FOLLOW_UP_SCHEDULED",
  DOCUMENT_ATTACHED: "DOCUMENT_ATTACHED",
  WITHDRAWN: "WITHDRAWN",
} as const;

export type ApplicationEventType =
  (typeof APPLICATION_EVENT_TYPE)[keyof typeof APPLICATION_EVENT_TYPE];

export interface Application {
  id: string;
  candidateProfileId: string;
  jobId: string;
  matchId: string | null;
  company: string;
  role: string;
  source: string;
  applicationUrl: string | null;
  matchScore: string | null;
  status: ApplicationStatus;
  submittedAt: Date | null;
  nextAction: string | null;
  followUpDate: Date | null;
  notes: string | null;
  resumeVersionId: string | null;
  coverLetterVersionId: string | null;
  confirmationReference: string | null;
  answers: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationDocument {
  id: string;
  applicationId: string;
  documentType: ApplicationDocumentType;
  fileName: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  version: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationAnswer {
  id: string;
  applicationId: string;
  question: string;
  answer: string;
  confidence: ApplicationAnswerConfidence;
  isConfirmed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationEvent {
  id: string;
  applicationId: string;
  fromStatus: string | null;
  toStatus: string;
  eventType: string;
  metadata: Record<string, unknown> | null;
  notes: string | null;
  createdAt: Date;
}

export interface CreateApplicationInput {
  candidateProfileId: string;
  jobId: string;
  matchId?: string | null;
  status?: ApplicationStatus; // Defaults to PREPARED
  notes?: string | null;
  resumeVersionId?: string | null;
  coverLetterVersionId?: string | null;
  nextAction?: string | null;
  followUpDate?: Date | null;
  confirmationReference?: string | null;
  answers?: unknown;
}

export interface UpdateApplicationInput {
  id: string;
  candidateProfileId: string;
  notes?: string | null;
  nextAction?: string | null;
  followUpDate?: Date | null;
  confirmationReference?: string | null;
}

export interface TransitionStatusInput {
  id: string;
  candidateProfileId: string;
  toStatus: ApplicationStatus;
  notes?: string | null;
  nextAction?: string | null;
  followUpDate?: Date | null;
  confirmationReference?: string | null;
}

export interface ListApplicationsOptions {
  status?: ApplicationStatus;
  limit?: number;
  offset?: number;
}

export interface ApplicationStats {
  total: number;
  prepared: number;
  applied: number;
  underReview: number;
  interviewScheduled: number;
  interviewCompleted: number;
  offer: number;
  rejected: number;
  withdrawn: number;
}
