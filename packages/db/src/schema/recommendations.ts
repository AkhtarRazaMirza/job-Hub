/**
 * Job Hub — Phase 10 / Step 10.5
 * Recommendations Database Schema
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 10 ("Learning")
 * - 02_how_to_build.md §16 ("Learning engine")
 * - 03_tech_stack.md §4 ("PostgreSQL via Drizzle ORM")
 * - 04_ai_agent_skills.md §20 & §21
 */

import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  index,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { candidateProfiles } from "./candidate";

export const recommendations = pgTable(
  "recommendations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    candidateProfileId: text("candidate_profile_id")
      .notNull()
      .references((): AnyPgColumn => candidateProfiles.id, {
        onDelete: "cascade",
      }),
    type: text("type").notNull(), // 'ROLE_FOCUS' | 'SOURCE_FOCUS' | 'MATCH_SCORE_BAND' | 'RESUME_VERSION' | 'SKILL_INSIGHT'
    targetKey: text("target_key").notNull(), // e.g. 'role:AI Full-Stack' or 'source:remoteok'
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    explanation: text("explanation").notNull(),
    confidence: text("confidence").notNull(), // 'HIGH' | 'MEDIUM' | 'LOW_CONFIDENCE'
    evidence: jsonb("evidence").notNull(),
    status: text("status").notNull().default("ACTIVE"), // 'ACTIVE' | 'DISMISSED' | 'APPLIED'
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("recommendations_candidate_profile_id_idx").on(table.candidateProfileId),
    index("recommendations_status_idx").on(table.status),
    index("recommendations_type_idx").on(table.type),
    index("recommendations_candidate_target_idx").on(table.candidateProfileId, table.targetKey),
    index("recommendations_created_at_idx").on(table.createdAt),
  ]
);

export const recommendationsRelations = relations(recommendations, ({ one }) => ({
  candidateProfile: one(candidateProfiles, {
    fields: [recommendations.candidateProfileId],
    references: [candidateProfiles.id],
  }),
}));
