/**
 * Job Matches table storing deterministic and AI-evaluated candidate-job matches.
 * Grounded in:
 * - 01_build_the_system.md §4 Step 7 & §5 Phase 4
 * - 02_how_to_build.md §2, §8 & §9
 * - 04_ai_agent_skills.md §9, §10 & §23
 */

import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  numeric,
  boolean,
  index,
  unique,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { candidateProfiles } from "./candidate";
import { jobs } from "./jobs";

export const jobMatches = pgTable(
  "job_matches",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    candidateProfileId: text("candidate_profile_id")
      .notNull()
      .references((): AnyPgColumn => candidateProfiles.id, {
        onDelete: "cascade",
      }),
    jobId: text("job_id")
      .notNull()
      .references((): AnyPgColumn => jobs.id, {
        onDelete: "cascade",
      }),
    overallScore: numeric("overall_score", { precision: 4, scale: 2 }).notNull(),
    decision: text("decision").notNull(), // 'SKIP' | 'REVIEW' | 'STRONG_MATCH' | 'EXCELLENT_MATCH'
    hardConstraintsPassed: boolean("hard_constraints_passed").notNull().default(true),
    hardConstraintFailures: jsonb("hard_constraint_failures").$type<string[]>().notNull().default([]),
    categoryScores: jsonb("category_scores").notNull(),
    strengths: jsonb("strengths").$type<string[]>().notNull().default([]),
    gaps: jsonb("gaps").$type<string[]>().notNull().default([]),
    risks: jsonb("risks").$type<string[]>().notNull().default([]),
    explanation: text("explanation").notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
    weightsUsed: jsonb("weights_used").$type<Record<string, number>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    unique("candidate_job_unique").on(table.candidateProfileId, table.jobId),
    index("job_matches_candidate_profile_id_idx").on(table.candidateProfileId),
    index("job_matches_job_id_idx").on(table.jobId),
    index("job_matches_candidate_score_idx").on(table.candidateProfileId, table.overallScore),
    index("job_matches_decision_idx").on(table.decision),
  ]
);

export const jobMatchesRelations = relations(jobMatches, ({ one }) => ({
  candidateProfile: one(candidateProfiles, {
    fields: [jobMatches.candidateProfileId],
    references: [candidateProfiles.id],
  }),
  job: one(jobs, {
    fields: [jobMatches.jobId],
    references: [jobs.id],
  }),
}));
