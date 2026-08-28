/**
 * Job Hub — Phase 5 / Step 5.3
 * Candidate Dashboard Data & Feed API Router
 *
 * Implements architectural requirements from:
 * - 01_build_the_system.md §4 Step 8 ("Candidate Dashboard")
 * - 02_how_to_build.md §10 ("Candidate Dashboard")
 * - 04_ai_agent_skills.md §2 & §10 (Match decision rules & truthfulness)
 *
 * Procedures:
 * - dashboard.overview: Profile overview, preferences, verified projects, truthfulness & stats
 * - dashboard.stats: Summary statistics (totalMatches, excellentMatches, strongMatches, reviewMatches, savedJobsCount)
 * - dashboard.matchesFeed: Paginated match feed joined with canonical jobs, filterable by decision & score, with isSaved state
 * - dashboard.savedJobsFeed: Paginated saved jobs feed joined with canonical job details and latest match evaluations
 */

import { router, protectedProcedure } from "../init";
import { z } from "@job-hub/jobs";
import { TRPCError } from "@trpc/server";
import {
  db,
  candidateProfiles,
  jobMatches,
  jobs,
  savedJobs,
  eq,
  and,
  desc,
  gte,
  inArray,
  count,
  type SQL,
} from "@job-hub/db";
import {
  candidateProfileService,
  candidatePreferencesService,
  candidateProjectService,
  unifiedProfileService,
} from "@job-hub/candidate/server";

// Decision enum validation matching domain specifications
const matchDecisionEnum = z.enum(["EXCELLENT_MATCH", "STRONG_MATCH", "REVIEW", "SKIP"]);
const remoteTypeEnum = z.enum([
  "WORLDWIDE_REMOTE",
  "COUNTRY_REMOTE",
  "REGION_REMOTE",
  "HYBRID",
  "ONSITE",
  "UNKNOWN",
]);

// Helper to assert caller does not inject foreign candidate identities
function assertCandidateIdentityProtection(
  input: Record<string, unknown> | undefined,
  sessionUserId: string,
  profileId: string
) {
  if (!input) return;
  if ("userId" in input && input.userId && input.userId !== sessionUserId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cannot access another user's dashboard data.",
    });
  }
  if (
    "candidateProfileId" in input &&
    input.candidateProfileId &&
    input.candidateProfileId !== profileId
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cannot access another candidate's dashboard data.",
    });
  }
}

export const dashboardRouter = router({
  /**
   * Candidate Dashboard Summary Statistics.
   * Scoped strictly to authenticated candidate profile.
   */
  stats: protectedProcedure
    .input(
      z
        .object({
          userId: z.string().optional(),
          candidateProfileId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const profile = await candidateProfileService.getProfile(ctx.user.id);
      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Candidate profile not found.",
        });
      }

      assertCandidateIdentityProtection(input as Record<string, unknown> | undefined, ctx.user.id, profile.id);

      // Aggregated match counts by decision in a single grouped query
      const matchCounts = await db
        .select({
          decision: jobMatches.decision,
          count: count(),
        })
        .from(jobMatches)
        .where(eq(jobMatches.candidateProfileId, profile.id))
        .groupBy(jobMatches.decision);

      // Saved jobs total count
      const [savedCountRow] = await db
        .select({ count: count() })
        .from(savedJobs)
        .where(eq(savedJobs.candidateProfileId, profile.id));

      let totalMatches = 0;
      let excellentMatches = 0;
      let strongMatches = 0;
      let reviewMatches = 0;
      let skipMatches = 0;

      for (const row of matchCounts) {
        const c = Number(row.count);
        totalMatches += c;
        if (row.decision === "EXCELLENT_MATCH") excellentMatches += c;
        else if (row.decision === "STRONG_MATCH") strongMatches += c;
        else if (row.decision === "REVIEW") reviewMatches += c;
        else if (row.decision === "SKIP") skipMatches += c;
      }

      return {
        totalMatches,
        excellentMatches,
        strongMatches,
        reviewMatches,
        skipMatches,
        savedJobsCount: Number(savedCountRow?.count ?? 0),
      };
    }),

  /**
   * Candidate Dashboard Profile Overview.
   * Delivers skills, experience, target roles, preferred locations, verified projects,
   * truthfulness breakdown, and high-level statistics.
   */
  overview: protectedProcedure
    .input(
      z
        .object({
          userId: z.string().optional(),
          candidateProfileId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const profile = await candidateProfileService.getProfile(ctx.user.id);
      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Candidate profile not found. Please create a profile first.",
        });
      }

      assertCandidateIdentityProtection(input as Record<string, unknown> | undefined, ctx.user.id, profile.id);

      const [preferences, projects, unified] = await Promise.all([
        candidatePreferencesService.getPreferences(ctx.user.id),
        candidateProjectService.listProjects(ctx.user.id),
        unifiedProfileService.getUnifiedProfile(ctx.user.id),
      ]);

      // Summary statistics
      const matchCounts = await db
        .select({
          decision: jobMatches.decision,
          count: count(),
        })
        .from(jobMatches)
        .where(eq(jobMatches.candidateProfileId, profile.id))
        .groupBy(jobMatches.decision);

      const [savedCountRow] = await db
        .select({ count: count() })
        .from(savedJobs)
        .where(eq(savedJobs.candidateProfileId, profile.id));

      let totalMatches = 0;
      let excellentMatches = 0;
      let strongMatches = 0;
      let reviewMatches = 0;

      for (const row of matchCounts) {
        const c = Number(row.count);
        totalMatches += c;
        if (row.decision === "EXCELLENT_MATCH") excellentMatches += c;
        else if (row.decision === "STRONG_MATCH") strongMatches += c;
        else if (row.decision === "REVIEW") reviewMatches += c;
      }

      return {
        profile: {
          id: profile.id,
          userId: profile.userId,
          headline: profile.headline,
          portfolioUrl: profile.portfolioUrl,
          linkedinUrl: profile.linkedinUrl,
          profiledAt: profile.profiledAt,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        },
        profileData: profile.profileData,
        preferences,
        projects,
        truthfulness: unified.truthfulness,
        stats: {
          totalMatches,
          excellentMatches,
          strongMatches,
          reviewMatches,
          savedJobsCount: Number(savedCountRow?.count ?? 0),
        },
      };
    }),

  /**
   * Candidate Dashboard Matches Feed.
   * Paginated, filterable feed joined with canonical job details.
   * Avoids N+1 queries by prefetching saved job states in batch.
   */
  matchesFeed: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        decision: matchDecisionEnum.optional(),
        minScore: z.number().min(0).max(10).optional(),
        remoteType: remoteTypeEnum.optional(),
        userId: z.string().optional(),
        candidateProfileId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const profile = await candidateProfileService.getProfile(ctx.user.id);
      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Candidate profile not found.",
        });
      }

      assertCandidateIdentityProtection(input as Record<string, unknown>, ctx.user.id, profile.id);

      // Build WHERE conditions
      const conditions: SQL[] = [eq(jobMatches.candidateProfileId, profile.id)];

      if (input.decision) {
        conditions.push(eq(jobMatches.decision, input.decision));
      }

      if (input.minScore !== undefined) {
        conditions.push(gte(jobMatches.overallScore, input.minScore.toFixed(2)));
      }

      if (input.remoteType) {
        conditions.push(eq(jobs.remoteType, input.remoteType));
      }

      const whereClause = and(...conditions);

      // 1. Query total count for pagination metadata
      const [totalCountRow] = await db
        .select({ count: count() })
        .from(jobMatches)
        .innerJoin(jobs, eq(jobMatches.jobId, jobs.id))
        .where(whereClause);

      const total = Number(totalCountRow?.count ?? 0);

      // 2. Query paginated matches joined with canonical jobs
      const rows = await db
        .select({
          match: jobMatches,
          job: jobs,
        })
        .from(jobMatches)
        .innerJoin(jobs, eq(jobMatches.jobId, jobs.id))
        .where(whereClause)
        .orderBy(desc(jobMatches.overallScore), desc(jobMatches.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      // 3. Batch resolve saved status for all jobs in page (prevents N+1)
      const jobIds = rows.map((r) => r.job.id);
      const savedJobMap = new Map<string, string>(); // jobId -> savedJobId

      if (jobIds.length > 0) {
        const savedRows = await db
          .select({
            id: savedJobs.id,
            jobId: savedJobs.jobId,
          })
          .from(savedJobs)
          .where(
            and(
              eq(savedJobs.candidateProfileId, profile.id),
              inArray(savedJobs.jobId, jobIds)
            )
          );

        for (const s of savedRows) {
          savedJobMap.set(s.jobId, s.id);
        }
      }

      // 4. Assemble response items
      const items = rows.map(({ match, job }) => {
        const savedJobId = savedJobMap.get(job.id) ?? null;
        return {
          match: {
            id: match.id,
            overallScore: Number(match.overallScore),
            decision: match.decision,
            confidence: Number(match.confidence),
            hardConstraintsPassed: match.hardConstraintsPassed,
            hardConstraintFailures: match.hardConstraintFailures,
            categoryScores: match.categoryScores as Record<string, number>,
            strengths: match.strengths,
            gaps: match.gaps,
            risks: match.risks,
            explanation: match.explanation,
            createdAt: match.createdAt,
          },
          job: {
            id: job.id,
            title: job.title,
            company: job.company,
            location: job.location,
            remoteType: job.remoteType,
            allowedCountries: job.allowedCountries,
            salary: job.salary,
            salaryMin: job.salaryMin,
            salaryMax: job.salaryMax,
            currency: job.currency,
            experience: job.experience,
            skills: job.skills,
            applicationUrl: job.applicationUrl,
            status: job.status,
            postedAt: job.postedAt,
          },
          isSaved: Boolean(savedJobId),
          savedJobId,
        };
      });

      return {
        items,
        total,
        limit: input.limit,
        offset: input.offset,
        hasMore: input.offset + items.length < total,
      };
    }),

  /**
   * Candidate Dashboard Saved Jobs Feed.
   * Returns paginated saved jobs joined with canonical job details and latest match evaluations.
   */
  savedJobsFeed: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        userId: z.string().optional(),
        candidateProfileId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const profile = await candidateProfileService.getProfile(ctx.user.id);
      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Candidate profile not found.",
        });
      }

      assertCandidateIdentityProtection(input as Record<string, unknown>, ctx.user.id, profile.id);

      const whereClause = eq(savedJobs.candidateProfileId, profile.id);

      // 1. Total count
      const [totalCountRow] = await db
        .select({ count: count() })
        .from(savedJobs)
        .where(whereClause);

      const total = Number(totalCountRow?.count ?? 0);

      // 2. Query paginated saved jobs joined with canonical jobs
      const rows = await db
        .select({
          savedJob: savedJobs,
          job: jobs,
        })
        .from(savedJobs)
        .innerJoin(jobs, eq(savedJobs.jobId, jobs.id))
        .where(whereClause)
        .orderBy(desc(savedJobs.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      // 3. Batch fetch candidate match evaluations for these saved jobs
      const jobIds = rows.map((r) => r.job.id);
      const matchMap = new Map<string, typeof jobMatches.$inferSelect>();

      if (jobIds.length > 0) {
        const matches = await db
          .select()
          .from(jobMatches)
          .where(
            and(
              eq(jobMatches.candidateProfileId, profile.id),
              inArray(jobMatches.jobId, jobIds)
            )
          );

        for (const m of matches) {
          matchMap.set(m.jobId, m);
        }
      }

      // 4. Assemble response items
      const items = rows.map(({ savedJob, job }) => {
        const match = matchMap.get(job.id);
        return {
          id: savedJob.id,
          jobId: savedJob.jobId,
          notes: savedJob.notes,
          savedAt: savedJob.createdAt,
          job: {
            id: job.id,
            title: job.title,
            company: job.company,
            location: job.location,
            remoteType: job.remoteType,
            allowedCountries: job.allowedCountries,
            salary: job.salary,
            salaryMin: job.salaryMin,
            salaryMax: job.salaryMax,
            currency: job.currency,
            experience: job.experience,
            skills: job.skills,
            applicationUrl: job.applicationUrl,
            status: job.status,
            postedAt: job.postedAt,
          },
          match: match
            ? {
                id: match.id,
                overallScore: Number(match.overallScore),
                decision: match.decision,
                confidence: Number(match.confidence),
                strengths: match.strengths,
                gaps: match.gaps,
                risks: match.risks,
              }
            : null,
        };
      });

      return {
        items,
        total,
        limit: input.limit,
        offset: input.offset,
        hasMore: input.offset + items.length < total,
      };
    }),
});
