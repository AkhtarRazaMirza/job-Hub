import { z } from "zod";

/**
 * Zod schema for candidate fact verification status.
 */
export const verificationStatusSchema = z.enum([
  "VERIFIED",
  "INFERRED",
  "USER_REQUIRED",
]);

/**
 * Zod schema for remote work preferences.
 */
export const remotePreferenceSchema = z.enum([
  "WORLDWIDE_REMOTE",
  "COUNTRY_REMOTE",
  "REGION_REMOTE",
  "HYBRID",
  "ONSITE",
  "UNKNOWN",
]);

/**
 * Zod schema for candidate profile domain entity.
 */
export const candidateProfileSchema = z.object({
  id: z.string().min(1, "Candidate profile ID is required"),
  userId: z.string().min(1, "User ID is required"),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Zod schema for creating a candidate profile.
 */
export const createCandidateProfileSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  id: z.string().min(1).optional(),
});

/**
 * Factory for creating a Zod schema for any verified candidate fact.
 */
export function createCandidateFactSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema,
    status: verificationStatusSchema,
    source: z.string().optional(),
  });
}
