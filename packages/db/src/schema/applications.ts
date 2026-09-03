/**
 * Job Hub — Phase 6 / Step 6.1
 * Application Domain Database Schema
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 12 & 13, §5 Phase 6 ("Application tracking")
 * - 02_how_to_build.md §2 ("applications", "application_documents", "application_answers", "application_events"), §10 & §14
 * - 03_tech_stack.md §4
 * - 04_ai_agent_skills.md §17 & §18
 */

import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  numeric,
  index,
  unique,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { candidateProfiles } from "./candidate";
import { jobs } from "./jobs";
import { jobMatches } from "./matching";
import { resumes } from "./resume";

/**
 * Core Application table tracking candidate job applications throughout their lifecycle.
 */
export const applications = pgTable(
  "applications",
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
    matchId: text("match_id").references((): AnyPgColumn => jobMatches.id, {
      onDelete: "set null",
    }),
    company: text("company").notNull(),
    role: text("role").notNull(),
    source: text("source").notNull(), // Provider slug e.g. "remoteok", "himalayas", "manual"
    applicationUrl: text("application_url"),
    matchScore: numeric("match_score", { precision: 4, scale: 2 }),
    status: text("status").notNull().default("PREPARED"), // PREPARED | APPLIED | UNDER_REVIEW | INTERVIEW_SCHEDULED | INTERVIEW_COMPLETED | OFFER | REJECTED | WITHDRAWN
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    nextAction: text("next_action"),
    followUpDate: timestamp("follow_up_date", { withTimezone: true }),
    notes: text("notes"),
    resumeVersionId: text("resume_version_id").references((): AnyPgColumn => resumes.id, {
      onDelete: "set null",
    }),
    coverLetterVersionId: text("cover_letter_version_id"),
    confirmationReference: text("confirmation_reference"),
    answers: jsonb("answers").$type<Record<string, unknown> | Array<{ question: string; answer: string; confidence?: string }>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    unique("applications_candidate_profile_id_job_id_unique").on(
      table.candidateProfileId,
      table.jobId
    ),
    index("applications_candidate_profile_id_idx").on(table.candidateProfileId),
    index("applications_job_id_idx").on(table.jobId),
    index("applications_match_id_idx").on(table.matchId),
    index("applications_status_idx").on(table.status),
    index("applications_follow_up_date_idx").on(table.followUpDate),
    index("applications_created_at_idx").on(table.createdAt),
  ]
);

/**
 * Application Documents table for documents attached to an application.
 * Grounded in 02_how_to_build.md §2: "application_documents".
 */
export const applicationDocuments = pgTable(
  "application_documents",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    applicationId: text("application_id")
      .notNull()
      .references((): AnyPgColumn => applications.id, {
        onDelete: "cascade",
      }),
    documentType: text("document_type").notNull(), // 'RESUME' | 'COVER_LETTER' | 'OTHER'
    fileName: text("file_name").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    version: text("version"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("application_documents_application_id_idx").on(table.applicationId),
    index("application_documents_type_idx").on(table.documentType),
  ]
);

/**
 * Application Answers table storing responses to application questions with truthfulness confidence.
 * Grounded in 02_how_to_build.md §2: "application_answers" and §12.
 */
export const applicationAnswers = pgTable(
  "application_answers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    applicationId: text("application_id")
      .notNull()
      .references((): AnyPgColumn => applications.id, {
        onDelete: "cascade",
      }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    confidence: text("confidence").notNull().default("USER_REQUIRED"), // 'VERIFIED' | 'INFERRED' | 'USER_REQUIRED'
    isConfirmed: boolean("is_confirmed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("application_answers_application_id_idx").on(table.applicationId),
  ]
);

/**
 * Application Events table recording an immutable audit trail of lifecycle state transitions and actions.
 * Grounded in 02_how_to_build.md §2: "application_events".
 */
export const applicationEvents = pgTable(
  "application_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    applicationId: text("application_id")
      .notNull()
      .references((): AnyPgColumn => applications.id, {
        onDelete: "cascade",
      }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    eventType: text("event_type").notNull().default("STATUS_CHANGE"), // 'CREATED' | 'STATUS_CHANGE' | 'NOTE_ADDED' | 'FOLLOW_UP_SCHEDULED' | 'DOCUMENT_ATTACHED' | 'WITHDRAWN'
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("application_events_application_id_idx").on(table.applicationId),
    index("application_events_to_status_idx").on(table.toStatus),
    index("application_events_created_at_idx").on(table.createdAt),
  ]
);

// -----------------------------------------------------------------------------
// Relations
// -----------------------------------------------------------------------------

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  candidateProfile: one(candidateProfiles, {
    fields: [applications.candidateProfileId],
    references: [candidateProfiles.id],
  }),
  job: one(jobs, {
    fields: [applications.jobId],
    references: [jobs.id],
  }),
  match: one(jobMatches, {
    fields: [applications.matchId],
    references: [jobMatches.id],
  }),
  resume: one(resumes, {
    fields: [applications.resumeVersionId],
    references: [resumes.id],
  }),
  documents: many(applicationDocuments),
  answers: many(applicationAnswers),
  events: many(applicationEvents),
}));

export const applicationDocumentsRelations = relations(applicationDocuments, ({ one }) => ({
  application: one(applications, {
    fields: [applicationDocuments.applicationId],
    references: [applications.id],
  }),
}));

export const applicationAnswersRelations = relations(applicationAnswers, ({ one }) => ({
  application: one(applications, {
    fields: [applicationAnswers.applicationId],
    references: [applications.id],
  }),
}));

export const applicationEventsRelations = relations(applicationEvents, ({ one }) => ({
  application: one(applications, {
    fields: [applicationEvents.applicationId],
    references: [applications.id],
  }),
}));
