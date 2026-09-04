/**
 * Job Hub — Phase 8 / Step 8.1
 * Browser Agent Domain Database Schema
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 8 ("Browser agent")
 * - 02_how_to_build.md §13 ("Browser agent")
 * - 03_tech_stack.md §7 ("Playwright: assisted application form filling, navigation, file upload, state detection")
 * - 04_ai_agent_skills.md §14 ("Browser Agent Skill"), §15 ("Browser Safety Skill"), §16 ("Human Approval Skill")
 */

import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { candidateProfiles } from "./candidate";
import { applications } from "./applications";

export interface BrowserFieldMapping {
  fieldId: string;
  selector: string;
  name?: string;
  label?: string;
  placeholder?: string;
  fieldType: "text" | "textarea" | "select" | "radio" | "checkbox" | "file" | "button" | "unknown";
  semanticType?: string;
  classification: "KNOWN" | "UNKNOWN" | "AMBIGUOUS" | "UNSAFE";
  value?: string;
  filled: boolean;
  fillError?: string;
  requiresUserInput?: boolean;
  confidence?: "VERIFIED" | "INFERRED" | "USER_REQUIRED";
  reason?: string;
}

export interface BrowserUploadedDocument {
  documentType: "RESUME" | "COVER_LETTER" | "OTHER";
  documentId: string;
  fileName: string;
  fileSize: number;
  version?: string;
  uploaded: boolean;
  uploadedAt?: string;
  error?: string;
}

export interface BrowserAuditLogEntry {
  timestamp: string;
  step: string;
  action: string;
  status: "SUCCESS" | "WARNING" | "STOPPED" | "ERROR";
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Core Browser Executions table tracking controlled browser agent sessions.
 */
export const browserExecutions = pgTable(
  "browser_executions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    applicationId: text("application_id")
      .notNull()
      .references((): AnyPgColumn => applications.id, {
        onDelete: "cascade",
      }),
    candidateProfileId: text("candidate_profile_id")
      .notNull()
      .references((): AnyPgColumn => candidateProfiles.id, {
        onDelete: "cascade",
      }),
    targetUrl: text("target_url").notNull(),
    detectedDomain: text("detected_domain"),
    status: text("status").notNull().default("INITIALIZING"), // INITIALIZING | NAVIGATING | DETECTING_FORM | MAPPING_FIELDS | FILLING | PAUSED_FOR_REVIEW | STOPPED_SAFETY | AWAITING_APPROVAL | SUBMITTING | SUBMITTED_VERIFIED | SUBMISSION_UNCERTAIN | FAILED | CANCELLED
    formDetected: boolean("form_detected").notNull().default(false),
    mappedFields: jsonb("mapped_fields").$type<BrowserFieldMapping[]>().default([]),
    uploadedDocuments: jsonb("uploaded_documents").$type<BrowserUploadedDocument[]>().default([]),
    safetyStopReason: text("safety_stop_reason"),
    safetyDetails: jsonb("safety_details").$type<Record<string, unknown>>(),
    userApproved: boolean("user_approved").notNull().default(false),
    userApprovedAt: timestamp("user_approved_at", { withTimezone: true }),
    submissionVerified: boolean("submission_verified").notNull().default(false),
    confirmationReference: text("confirmation_reference"),
    errorMessage: text("error_message"),
    auditLog: jsonb("audit_log").$type<BrowserAuditLogEntry[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("browser_executions_application_id_idx").on(table.applicationId),
    index("browser_executions_candidate_profile_id_idx").on(table.candidateProfileId),
    index("browser_executions_status_idx").on(table.status),
    index("browser_executions_created_at_idx").on(table.createdAt),
  ]
);

// -----------------------------------------------------------------------------
// Relations
// -----------------------------------------------------------------------------

export const browserExecutionsRelations = relations(browserExecutions, ({ one }) => ({
  application: one(applications, {
    fields: [browserExecutions.applicationId],
    references: [applications.id],
  }),
  candidateProfile: one(candidateProfiles, {
    fields: [browserExecutions.candidateProfileId],
    references: [candidateProfiles.id],
  }),
}));
