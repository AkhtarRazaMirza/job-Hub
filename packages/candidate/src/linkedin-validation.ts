import { z } from "zod";

/**
 * Regex enforcing valid LinkedIn personal profile URL format.
 * Matches:
 * - https://linkedin.com/in/username
 * - https://www.linkedin.com/in/username
 * - https://linkedin.com/in/username/
 * Rejects non-https, other domains, localhost, IP addresses, or internal paths.
 */
export const LINKEDIN_PROFILE_REGEX =
  /^https:\/\/(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_\-\u0080-\uffff]+\/?$/i;

export const updateLinkedInUrlInputSchema = z
  .object({
    linkedinUrl: z
      .string()
      .trim()
      .min(1, "LinkedIn URL is required")
      .refine(
        (val) => LINKEDIN_PROFILE_REGEX.test(val),
        "Must be a valid HTTPS LinkedIn profile URL (e.g. https://www.linkedin.com/in/username)"
      ),
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    candidateProfileId: z
      .never({ invalid_type_error: "candidateProfileId cannot be client-supplied" })
      .optional(),
  })
  .strict();

export type UpdateLinkedInUrlInput = z.infer<typeof updateLinkedInUrlInputSchema>;
