/**
 * Job Hub — Phase 7 / Step 7.3
 * Cover Letters Database Schema
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 9 ("Generate cover letter when useful")
 * - 02_how_to_build.md §12 ("Generate: cover letter")
 * - 04_ai_agent_skills.md §12 ("Cover Letter Skill") & §21 ("CoverLetterWriter")
 */

import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { candidateProfiles } from "./candidate";
import { jobs } from "./jobs";

/**
 * Cover Letters table storing structured, editable cover letters
 * generated specifically for a candidate and target job.
 */
export const coverLetters = pgTable(
  "cover_letters",
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
    title: text("title").notNull(),
    salutation: text("salutation").notNull(),
    hook: text("hook").notNull(),
    bodyParagraphs: jsonb("body_paragraphs").$type<string[]>().notNull(),
    callToAction: text("call_to_action").notNull(),
    signoff: text("signoff").notNull(),
    content: text("content").notNull(), // Full assembled editable letter
    highlightedSkills: jsonb("highlighted_skills").$type<string[]>().default([]),
    highlightedProjects: jsonb("highlighted_projects").$type<string[]>().default([]),
    status: text("status").notNull().default("DRAFT"), // 'DRAFT' | 'APPROVED'
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("cover_letters_candidate_profile_id_idx").on(table.candidateProfileId),
    index("cover_letters_job_id_idx").on(table.jobId),
    index("cover_letters_status_idx").on(table.status),
    index("cover_letters_created_at_idx").on(table.createdAt),
  ]
);

export const coverLettersRelations = relations(coverLetters, ({ one }) => ({
  candidateProfile: one(candidateProfiles, {
    fields: [coverLetters.candidateProfileId],
    references: [candidateProfiles.id],
  }),
  job: one(jobs, {
    fields: [coverLetters.jobId],
    references: [jobs.id],
  }),
}));
