/**
 * Job Hub — Phase 7 / Step 7.3
 * Cover Letter Domain Zod Validation Schemas
 */

import { z } from "zod";
import { COVER_LETTER_STATUS } from "./types";

export const coverLetterStatusSchema = z.enum([
  COVER_LETTER_STATUS.DRAFT,
  COVER_LETTER_STATUS.APPROVED,
]);

export const coverLetterDataSchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    salutation: z.string().min(1, "Salutation is required"),
    hook: z.string().min(10, "Hook must provide meaningful opening context"),
    bodyParagraphs: z
      .array(z.string().min(20, "Body paragraph must be substantial"))
      .min(1, "At least one body paragraph is required"),
    callToAction: z.string().min(10, "Call to action is required"),
    signoff: z.string().min(1, "Signoff is required"),
    content: z.string().min(50, "Full letter content must be complete"),
    highlightedSkills: z.array(z.string()).default([]),
    highlightedProjects: z.array(z.string()).default([]),
  })
  .strict();

export const generateCoverLetterClientInputSchema = z
  .object({
    jobId: z.string().min(1, "Job ID is required"),
    customNotes: z.string().max(1000).optional(),
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    candidateProfileId: z.never({ invalid_type_error: "candidateProfileId cannot be client-supplied" }).optional(),
  })
  .strict();

export const updateCoverLetterClientInputSchema = z
  .object({
    id: z.string().min(1, "Cover letter ID is required"),
    content: z.string().min(50, "Cover letter content cannot be empty"),
    status: coverLetterStatusSchema.optional(),
  })
  .strict();
