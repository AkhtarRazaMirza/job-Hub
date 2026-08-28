/**
 * Job Hub — Phase 5 / Step 5.1
 * Saved Jobs Database Schema
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 8 & §5 Phase 5 ("saved jobs")
 * - 02_how_to_build.md §10 ("Saved Jobs")
 */

import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  index,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { candidateProfiles } from "./candidate";
import { jobs } from "./jobs";

export const savedJobs = pgTable(
  "saved_jobs",
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
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    unique("saved_jobs_candidate_profile_id_job_id_unique").on(
      table.candidateProfileId,
      table.jobId
    ),
    index("saved_jobs_candidate_profile_id_idx").on(table.candidateProfileId),
    index("saved_jobs_job_id_idx").on(table.jobId),
    index("saved_jobs_created_at_idx").on(table.createdAt),
  ]
);

export const savedJobsRelations = relations(savedJobs, ({ one }) => ({
  candidateProfile: one(candidateProfiles, {
    fields: [savedJobs.candidateProfileId],
    references: [candidateProfiles.id],
  }),
  job: one(jobs, {
    fields: [savedJobs.jobId],
    references: [jobs.id],
  }),
}));
