/**
 * Job Hub — Phase 6 / Step 6.2
 * Application Domain Zod Validation Schemas
 *
 * Strict validation enforcing input hygiene, preventing spoofing,
 * and ensuring truthful provenance.
 */

import { z } from "zod";
export { z };
import {
  APPLICATION_STATUS,
  APPLICATION_DOCUMENT_TYPE,
  APPLICATION_ANSWER_CONFIDENCE,
  APPLICATION_EVENT_TYPE,
} from "./types";

export const applicationStatusSchema = z.enum([
  APPLICATION_STATUS.PREPARED,
  APPLICATION_STATUS.APPLIED,
  APPLICATION_STATUS.UNDER_REVIEW,
  APPLICATION_STATUS.INTERVIEW_SCHEDULED,
  APPLICATION_STATUS.INTERVIEW_COMPLETED,
  APPLICATION_STATUS.OFFER,
  APPLICATION_STATUS.REJECTED,
  APPLICATION_STATUS.WITHDRAWN,
]);

export const applicationDocumentTypeSchema = z.enum([
  APPLICATION_DOCUMENT_TYPE.RESUME,
  APPLICATION_DOCUMENT_TYPE.COVER_LETTER,
  APPLICATION_DOCUMENT_TYPE.OTHER,
]);

export const applicationAnswerConfidenceSchema = z.enum([
  APPLICATION_ANSWER_CONFIDENCE.VERIFIED,
  APPLICATION_ANSWER_CONFIDENCE.INFERRED,
  APPLICATION_ANSWER_CONFIDENCE.USER_REQUIRED,
]);

export const applicationEventTypeSchema = z.enum([
  APPLICATION_EVENT_TYPE.CREATED,
  APPLICATION_EVENT_TYPE.STATUS_CHANGE,
  APPLICATION_EVENT_TYPE.NOTE_ADDED,
  APPLICATION_EVENT_TYPE.FOLLOW_UP_SCHEDULED,
  APPLICATION_EVENT_TYPE.DOCUMENT_ATTACHED,
  APPLICATION_EVENT_TYPE.WITHDRAWN,
]);

/**
 * Validates domain Application entity.
 */
export const applicationSchema = z
  .object({
    id: z.string().min(1, "ID is required"),
    candidateProfileId: z.string().min(1, "Candidate profile ID is required"),
    jobId: z.string().min(1, "Job ID is required"),
    matchId: z.string().nullable().optional(),
    company: z.string().min(1, "Company is required"),
    role: z.string().min(1, "Role is required"),
    source: z.string().min(1, "Source is required"),
    applicationUrl: z.string().nullable().optional(),
    matchScore: z.string().nullable().optional(),
    status: applicationStatusSchema,
    submittedAt: z.date().nullable().optional(),
    nextAction: z.string().max(255).nullable().optional(),
    followUpDate: z.date().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    resumeVersionId: z.string().nullable().optional(),
    coverLetterVersionId: z.string().nullable().optional(),
    confirmationReference: z.string().max(255).nullable().optional(),
    answers: z.unknown().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

/**
 * Validates client creation requests.
 * Explicitly rejects userId and candidateProfileId injection from client.
 */
export const createApplicationClientInputSchema = z
  .object({
    jobId: z.string().min(1, "Job ID is required"),
    matchId: z.string().optional(),
    status: applicationStatusSchema.optional(),
    notes: z.string().max(2000, "Notes cannot exceed 2000 characters").optional(),
    resumeVersionId: z.string().optional(),
    coverLetterVersionId: z.string().optional(),
    nextAction: z.string().max(255, "Next action cannot exceed 255 characters").optional(),
    followUpDate: z.string().datetime().optional().nullable(),
    confirmationReference: z.string().max(255, "Confirmation reference cannot exceed 255 characters").optional(),
  })
  .strict();

/**
 * Validates internal/service creation input where candidateProfileId is resolved server-side.
 */
export const createApplicationInputSchema = z
  .object({
    candidateProfileId: z.string().min(1, "Candidate profile ID is required"),
    jobId: z.string().min(1, "Job ID is required"),
    matchId: z.string().nullable().optional(),
    status: applicationStatusSchema.optional(),
    notes: z.string().max(2000, "Notes cannot exceed 2000 characters").nullable().optional(),
    resumeVersionId: z.string().nullable().optional(),
    coverLetterVersionId: z.string().nullable().optional(),
    nextAction: z.string().max(255, "Next action cannot exceed 255 characters").nullable().optional(),
    followUpDate: z.date().nullable().optional(),
    confirmationReference: z.string().max(255, "Confirmation reference cannot exceed 255 characters").nullable().optional(),
    answers: z.unknown().optional(),
  })
  .strict();

/**
 * Validates status transition input.
 */
export const transitionStatusInputSchema = z
  .object({
    id: z.string().min(1, "Application ID is required"),
    toStatus: applicationStatusSchema,
    notes: z.string().max(2000, "Notes cannot exceed 2000 characters").optional().nullable(),
    nextAction: z.string().max(255, "Next action cannot exceed 255 characters").optional().nullable(),
    followUpDate: z.string().datetime().optional().nullable(),
    confirmationReference: z.string().max(255, "Confirmation reference cannot exceed 255 characters").optional().nullable(),
  })
  .strict();

/**
 * Validates note update input.
 */
export const updateNotesInputSchema = z
  .object({
    id: z.string().min(1, "Application ID is required"),
    notes: z.string().max(2000, "Notes cannot exceed 2000 characters").nullable().optional(),
  })
  .strict();

/**
 * Validates follow-up update input.
 */
export const updateFollowUpInputSchema = z
  .object({
    id: z.string().min(1, "Application ID is required"),
    followUpDate: z.string().datetime().nullable().optional(),
    nextAction: z.string().max(255, "Next action cannot exceed 255 characters").nullable().optional(),
  })
  .strict();

/**
 * Validates application listing options.
 */
export const listApplicationsInputSchema = z
  .object({
    status: applicationStatusSchema.optional(),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
  })
  .strict();
