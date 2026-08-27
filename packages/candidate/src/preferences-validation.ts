import { z } from "zod";
import { remotePreferenceSchema } from "./validation";

export const experienceLevelSchema = z.enum([
  "ENTRY",
  "MID",
  "SENIOR",
  "LEAD",
  "PRINCIPAL",
]);

/**
 * Domain validation schema for Candidate Preferences entity.
 */
export const candidatePreferencesSchema = z.object({
  id: z.string().min(1),
  candidateProfileId: z.string().min(1),
  remotePreference: remotePreferenceSchema,
  preferredLocations: z.array(z.string()).default([]),
  salaryMin: z.number().int().nonnegative().nullable(),
  salaryCurrency: z.string().default("USD"),
  targetRoles: z.array(z.string()).default([]),
  experienceLevel: experienceLevelSchema.default("MID"),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Client-facing input schema for updating candidate preferences.
 * Strict ownership enforcement: rejects client-supplied ownership identifiers.
 */
export const updatePreferencesInputSchema = z
  .object({
    remotePreference: remotePreferenceSchema.optional(),
    preferredLocations: z.array(z.string().min(1, "Location cannot be empty")).optional(),
    salaryMin: z
      .number()
      .int("Salary must be an integer")
      .nonnegative("Salary cannot be negative")
      .nullable()
      .optional(),
    salaryCurrency: z.string().min(1).max(10).optional(),
    targetRoles: z.array(z.string().min(1, "Target role cannot be empty")).optional(),
    experienceLevel: experienceLevelSchema.optional(),
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    candidateProfileId: z
      .never({ invalid_type_error: "candidateProfileId cannot be client-supplied" })
      .optional(),
    id: z.never({ invalid_type_error: "id cannot be client-supplied" }).optional(),
  })
  .strict();

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesInputSchema>;
