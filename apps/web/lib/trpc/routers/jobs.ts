/**
 * Job Hub — Phase 3 / Step 3.9
 * Jobs tRPC Router (Manual Job URL Ingestion & Queries)
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 3: "- user-provided job URLs"
 * - 02_how_to_build.md §5: "JobSource: USER_URL"
 * - Security & SSRF Protection
 */

import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import {
  z,
  submitJobUrlInputSchema,
  jobNormalizationEngine,
  jobVerificationEngine,
  jobDeduplicationEngine,
  type DiscoveredRawJob,
} from "@job-hub/jobs";
import { jobRepository } from "@job-hub/jobs/server";

/**
 * Validates that a submitted job URL is a safe, public HTTP/HTTPS URL and does not target internal/private network infrastructure.
 */
export function validatePublicJobUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Malformed URL provided.",
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only HTTP and HTTPS URLs are permitted.",
    });
  }

  const hostname = parsed.hostname.toLowerCase();

  // Reject local and internal domain suffixes
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".onion")
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Access to private or local network addresses is prohibited.",
    });
  }

  // Reject IPv4 private & link-local ranges: 10.x, 127.x, 169.254.x, 172.16-31.x, 192.168.x
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const o1 = parseInt(ipv4Match[1]!, 10);
    const o2 = parseInt(ipv4Match[2]!, 10);

    if (
      o1 === 10 ||
      o1 === 127 ||
      o1 === 0 ||
      (o1 === 172 && o2 >= 16 && o2 <= 31) ||
      (o1 === 192 && o2 === 168) ||
      (o1 === 169 && o2 === 254)
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Private IP addresses are prohibited.",
      });
    }
  }

  return parsed;
}

export const jobsRouter = router({
  /**
   * Submit a user-provided job URL for ingestion.
   * Runs SSRF validation, normalization, verification, deduplication, and stores canonical record in PostgreSQL.
   */
  submitUrl: protectedProcedure
    .input(submitJobUrlInputSchema)
    .mutation(async ({ input, ctx }) => {
      // 1. SSRF and protocol check
      const parsedUrl = validatePublicJobUrl(input.url);

      const sourceJobId = `usr_${Buffer.from(parsedUrl.toString()).toString("base64url").slice(0, 32)}`;

      const rawJob: DiscoveredRawJob = {
        source: "user_url",
        sourceJobId,
        url: parsedUrl.toString(),
        discoveredAt: new Date(),
        data: {
          ...input,
          url: parsedUrl.toString(),
        },
      };

      // 2. Normalization
      const normalizedJob = await jobNormalizationEngine.normalize(rawJob);

      // 3. Verification
      const verification = await jobVerificationEngine.verify(normalizedJob, {
        checkLiveStatus: false, // User provided listing, avoid synchronous blocking
      });

      if (verification.isSpam) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Job posting rejected due to quality/spam signals: ${verification.reasons.join(", ")}`,
        });
      }

      // 4. Deduplication
      const dedup = await jobDeduplicationEngine.findDuplicate(normalizedJob);

      if (dedup.isDuplicate && dedup.match) {
        const canonical = await jobRepository.findById(dedup.match.canonicalJobId);
        return {
          isDuplicate: true,
          jobId: dedup.match.canonicalJobId,
          job: canonical,
          matchType: dedup.match.matchType,
          message: "Job already exists in system.",
        };
      }

      // 5. Canonical Persistence
      const created = await jobRepository.create(normalizedJob);

      return {
        isDuplicate: false,
        jobId: created.id,
        job: created,
        matchType: null,
        message: "Job successfully ingested.",
      };
    }),

  /**
   * Query a single job by its ID.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const job = await jobRepository.findById(input.id);

      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Job with ID "${input.id}" was not found.`,
        });
      }

      return job;
    }),

  /**
   * List jobs with optional filtering.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          status: z.enum(["ACTIVE", "CLOSED", "ARCHIVED", "UNKNOWN"]).optional(),
          remoteType: z
            .enum([
              "WORLDWIDE_REMOTE",
              "COUNTRY_REMOTE",
              "REGION_REMOTE",
              "HYBRID",
              "ONSITE",
              "UNKNOWN",
            ])
            .optional(),
          limit: z.number().int().min(1).max(100).default(20),
          offset: z.number().int().nonnegative().default(0),
        })
        .optional()
    )
    .query(async ({ input }) => {
      return await jobRepository.list(input);
    }),
});
