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
 * Zod schema for creating a candidate profile internally.
 */
export const createCandidateProfileSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  id: z.string().min(1).optional(),
});

/**
 * Client-facing input schema for creating a candidate profile.
 * Does NOT accept userId or user_id — ownership is strictly server-derived.
 * Rejects any attempt by the client to supply ownership identifiers.
 */
export const createProfileInputSchema = z
  .object({
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    user_id: z.never({ invalid_type_error: "user_id cannot be client-supplied" }).optional(),
    id: z.never({ invalid_type_error: "id cannot be client-supplied" }).optional(),
  })
  .strict();

export type CreateProfileInput = z.infer<typeof createProfileInputSchema>;

/**
 * Zod schema for updating a candidate profile.
 * Explicitly disallows changing or reassigning userId, user_id, or id.
 */
export const updateCandidateProfileSchema = z
  .record(z.unknown())
  .refine(
    (data) => !("userId" in data || "user_id" in data || "id" in data),
    { message: "userId and id cannot be reassigned through update input" }
  );

/**
 * Client-facing input schema for updating a candidate profile.
 * Does NOT accept userId, user_id, or id — ownership is immutable and server-controlled.
 */
export const updateProfileInputSchema = z
  .object({
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    user_id: z.never({ invalid_type_error: "user_id cannot be client-supplied" }).optional(),
    id: z.never({ invalid_type_error: "id cannot be client-supplied" }).optional(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

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
