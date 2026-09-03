/**
 * Job Hub — Phase 7 / Step 7.1
 * Tailored Resumes Database Schema
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 9 ("Application preparation: select relevant resume content, generate a tailored resume version, never alter master resume")
 * - 02_how_to_build.md §11 ("Resume tailoring: Master Resume + Job Description -> AI selection/rewrite -> Tailored Resume JSON -> Validation -> Version saved")
 * - 03_tech_stack.md §4 & §10 ("Cloudflare R2 / PostgreSQL metadata for tailored resumes")
 * - 04_ai_agent_skills.md §11 & §23 ("Keep master resume immutable. Store source evidence for important facts.")
 */

import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  index,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { candidateProfiles } from "./candidate";
import { jobs } from "./jobs";
import { resumes } from "./resume";

/**
 * Tailored Resumes table storing structured JSON and provenance metadata
 * for AI-tailored resume versions generated specifically for a candidate and target job.
 * The master resume (in `resumes`) remains strictly immutable.
 */
export const tailoredResumes = pgTable(
  "tailored_resumes",
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
    sourceResumeId: text("source_resume_id")
      .notNull()
      .references((): AnyPgColumn => resumes.id, {
        onDelete: "cascade",
      }),
    targetTitle: text("target_title"),
    tailoredData: jsonb("tailored_data").notNull(),
    truthfulnessScore: numeric("truthfulness_score", { precision: 5, scale: 2 }),
    status: text("status").notNull().default("DRAFT"), // 'DRAFT' | 'GENERATED' | 'APPROVED'
    version: integer("version").notNull().default(1),
    storageKey: text("storage_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("tailored_resumes_candidate_profile_id_idx").on(table.candidateProfileId),
    index("tailored_resumes_job_id_idx").on(table.jobId),
    index("tailored_resumes_source_resume_id_idx").on(table.sourceResumeId),
    index("tailored_resumes_status_idx").on(table.status),
    index("tailored_resumes_created_at_idx").on(table.createdAt),
  ]
);

export const tailoredResumesRelations = relations(tailoredResumes, ({ one }) => ({
  candidateProfile: one(candidateProfiles, {
    fields: [tailoredResumes.candidateProfileId],
    references: [candidateProfiles.id],
  }),
  job: one(jobs, {
    fields: [tailoredResumes.jobId],
    references: [jobs.id],
  }),
  sourceResume: one(resumes, {
    fields: [tailoredResumes.sourceResumeId],
    references: [resumes.id],
  }),
}));
