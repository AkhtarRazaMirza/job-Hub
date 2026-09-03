/**
 * Job Hub — Phase 7 / Step 7.5
 * Application Preparation Package Validation Schemas
 */

import { z } from "zod";

export const preparePackageClientInputSchema = z
  .object({
    jobId: z.string().min(1, "Job ID is required"),
    questions: z.array(z.string().min(1)).optional(),
    customCoverLetterNotes: z.string().max(1000).optional(),
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    candidateProfileId: z.never({ invalid_type_error: "candidateProfileId cannot be client-supplied" }).optional(),
  })
  .strict();

export const getPackageClientInputSchema = z
  .object({
    applicationId: z.string().min(1, "Application ID is required"),
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    candidateProfileId: z.never({ invalid_type_error: "candidateProfileId cannot be client-supplied" }).optional(),
  })
  .strict();

export const approvePackageClientInputSchema = z
  .object({
    applicationId: z.string().min(1, "Application ID is required"),
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    candidateProfileId: z.never({ invalid_type_error: "candidateProfileId cannot be client-supplied" }).optional(),
  })
  .strict();
