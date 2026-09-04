/**
 * Job Hub — Phase 8 / Step 8.2
 * Browser Agent Core Types, Safety Rules & Domain Models
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 8 ("Browser agent")
 * - 02_how_to_build.md §13 ("Browser agent")
 * - 03_tech_stack.md §7 ("Playwright browser automation")
 * - 04_ai_agent_skills.md §14 ("Browser Agent Skill"), §15 ("Browser Safety Skill"), §16 ("Human Approval Skill")
 */

import type { BrowserFieldMapping, BrowserUploadedDocument, BrowserAuditLogEntry } from "@job-hub/db";
export type { BrowserFieldMapping, BrowserUploadedDocument, BrowserAuditLogEntry };

export type BrowserExecutionStatus =
  | "INITIALIZING"
  | "NAVIGATING"
  | "DETECTING_FORM"
  | "MAPPING_FIELDS"
  | "FILLING"
  | "PAUSED_FOR_REVIEW"
  | "STOPPED_SAFETY"
  | "AWAITING_APPROVAL"
  | "SUBMITTING"
  | "SUBMITTED_VERIFIED"
  | "SUBMISSION_UNCERTAIN"
  | "FAILED"
  | "CANCELLED";

export type FieldClassification = "KNOWN" | "UNKNOWN" | "AMBIGUOUS" | "UNSAFE";

export type SafetyHaltReason =
  | "CAPTCHA_DETECTED"
  | "AUTH_REQUIRED"
  | "MFA_REQUIRED"
  | "BLOCKED_AUTOMATION"
  | "UNEXPECTED_REDIRECT"
  | "SSRF_ATTEMPT"
  | "UNKNOWN_WORK_AUTHORIZATION"
  | "UNKNOWN_VISA_SPONSORSHIP"
  | "UNKNOWN_SALARY_REQUIREMENT"
  | "UNKNOWN_RELOCATION"
  | "SENSITIVE_QUESTION_PAUSE"
  | "LEGAL_DECLARATION"
  | "UPLOAD_FAILURE"
  | "SUBMISSION_UNCERTAIN"
  | "FORM_AMBIGUITY";

export interface InspectedInputField {
  id?: string;
  name?: string;
  selector: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox" | "file" | "button" | "unknown";
  label?: string;
  placeholder?: string;
  ariaLabel?: string;
  required?: boolean;
  options?: string[];
  currentValue?: string;
}

export interface BrowserPageState {
  url: string;
  title: string;
  domain: string;
  httpStatus?: number;
  html?: string;
  hasCaptcha?: boolean;
  hasAuthWall?: boolean;
  hasMfa?: boolean;
  hasBlockedMessage?: boolean;
  formsFound?: number;
  inputs?: InspectedInputField[];
}

export interface CandidateSafetyContext {
  workAuthorization?: string | null;
  visaSponsorshipRequired?: boolean | null;
  expectedSalary?: string | number | null;
  willingToRelocate?: boolean | null;
  confirmedAnswerIds?: Set<string>;
  explicitlyConfirmedFields?: Record<string, string>;
}

export interface SafetyEvaluationResult {
  safe: boolean;
  reason?: SafetyHaltReason;
  message?: string;
  details?: Record<string, unknown>;
}

export interface FieldClassificationResult {
  classification: FieldClassification;
  semanticType?: string;
  requiresUserInput: boolean;
  confidence?: "VERIFIED" | "INFERRED" | "USER_REQUIRED";
  reason?: string;
}

export interface BrowserExecutionSummary {
  id: string;
  applicationId: string;
  candidateProfileId: string;
  targetUrl: string;
  detectedDomain: string | null;
  status: BrowserExecutionStatus;
  formDetected: boolean;
  mappedFields: BrowserFieldMapping[];
  uploadedDocuments: BrowserUploadedDocument[];
  safetyStopReason: string | null;
  safetyDetails: Record<string, unknown> | null;
  userApproved: boolean;
  userApprovedAt: Date | null;
  submissionVerified: boolean;
  confirmationReference: string | null;
  errorMessage: string | null;
  auditLog: BrowserAuditLogEntry[];
  createdAt: Date;
  updatedAt: Date;
}
