/**
 * Job Hub — Phase 7 / Step 7.4
 * Application Answers Validation Schemas
 */

import { z } from "zod";
import { ANSWER_CONFIDENCE } from "./types";

export const answerConfidenceSchema = z.enum([
  ANSWER_CONFIDENCE.VERIFIED,
  ANSWER_CONFIDENCE.INFERRED,
  ANSWER_CONFIDENCE.USER_REQUIRED,
]);

export const applicationAnswerItemSchema = z
  .object({
    question: z.string().min(1, "Question cannot be empty"),
    answer: z.string().min(1, "Answer cannot be empty"),
    confidence: answerConfidenceSchema,
    reasoning: z.string().min(1, "Reasoning is required for provenance"),
    sourceEvidence: z.string().optional(),
    isConfirmed: z.boolean().default(false),
  })
  .strict();

export const generateAnswersOutputSchema = z
  .object({
    answers: z.array(applicationAnswerItemSchema),
  })
  .strict();

export const generateAnswersClientInputSchema = z
  .object({
    jobId: z.string().min(1, "Job ID is required"),
    questions: z.array(z.string().min(1)).min(1, "At least one question required"),
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    candidateProfileId: z.never({ invalid_type_error: "candidateProfileId cannot be client-supplied" }).optional(),
  })
  .strict();

export const updateAnswerClientInputSchema = z
  .object({
    answerId: z.string().min(1, "Answer ID is required"),
    applicationId: z.string().min(1, "Application ID is required"),
    answer: z.string().min(1, "Answer cannot be empty"),
    isConfirmed: z.boolean().optional(),
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    candidateProfileId: z.never({ invalid_type_error: "candidateProfileId cannot be client-supplied" }).optional(),
  })
  .strict();
