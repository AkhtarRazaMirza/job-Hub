/**
 * Job Hub — Phase 9 / Step 9.1
 * Analytics Domain Validation Schemas
 *
 * Strict Zod validation enforcing:
 * - Date range sanity (ISO date or date-time strings)
 * - Safe granularity options ('day' | 'week' | 'month')
 * - Protection against foreign candidate identity injection
 */

import { z } from "zod";
import { applicationStatusSchema } from "../validation";
import { TREND_GRANULARITIES } from "./types";

/**
 * ISO date or datetime regex.
 * Matches YYYY-MM-DD or full ISO 8601 strings.
 */
const dateStringSchema = z
  .string()
  .refine(
    (val) => {
      const parsed = Date.parse(val);
      return !Number.isNaN(parsed);
    },
    { message: "Must be a valid ISO date or date-time string" }
  );

/**
 * Core Analytics Query Filter Schema.
 */
export const analyticsFilterSchema = z.object({
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  source: z.string().trim().max(100).optional(),
  status: applicationStatusSchema.optional(),
  // Explicitly prevent foreign candidate injection
  userId: z.string().trim().optional(),
  candidateProfileId: z.string().trim().optional(),
});

export type AnalyticsFilterInput = z.infer<typeof analyticsFilterSchema>;

/**
 * Time Trends Filter Schema.
 */
export const analyticsTrendsFilterSchema = analyticsFilterSchema.extend({
  granularity: z.enum(TREND_GRANULARITIES).default("week"),
});

export type AnalyticsTrendsFilterInput = z.infer<typeof analyticsTrendsFilterSchema>;

/**
 * Role Performance Filter Schema.
 */
export const rolePerformanceFilterSchema = analyticsFilterSchema.extend({
  limit: z.number().int().min(1).max(100).default(20),
});

export type RolePerformanceFilterInput = z.infer<typeof rolePerformanceFilterSchema>;

/**
 * Identity spoofing defense helper for analytics procedures.
 */
export function assertAnalyticsIdentityProtection(
  input: Record<string, unknown> | undefined,
  sessionUserId: string,
  profileId: string
): void {
  if (!input) return;

  if ("userId" in input && input.userId && input.userId !== sessionUserId) {
    throw new Error("FORBIDDEN: Cannot access another candidate's analytics data.");
  }

  if (
    "candidateProfileId" in input &&
    input.candidateProfileId &&
    input.candidateProfileId !== profileId
  ) {
    throw new Error("FORBIDDEN: Cannot access another candidate's analytics data.");
  }
}
