import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, integer, boolean, index, jsonb, type AnyPgColumn } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { resumes } from "./resume";

export const candidateProfiles = pgTable(
  "candidate_profiles",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    headline: text("headline"),
    portfolioUrl: text("portfolio_url"),
    linkedinUrl: text("linkedin_url"),
    profileData: jsonb("profile_data"),
    sourceResumeId: text("source_resume_id").references((): AnyPgColumn => resumes.id, { onDelete: "set null" }),
    profiledAt: timestamp("profiled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("candidate_profiles_user_id_idx").on(table.userId),
  ],
);

/**
 * Candidate Preferences table storing explicit user job preferences.
 * Mandated by 01_build_the_system.md §4 Step 1 and 02_how_to_build.md §2.
 */
export const candidatePreferences = pgTable(
  "candidate_preferences",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    candidateProfileId: text("candidate_profile_id")
      .notNull()
      .unique()
      .references((): AnyPgColumn => candidateProfiles.id, { onDelete: "cascade" }),
    remotePreference: text("remote_preference").notNull().default("UNKNOWN"),
    preferredLocations: jsonb("preferred_locations").$type<string[]>().default([]),
    salaryMin: integer("salary_min"),
    salaryCurrency: text("salary_currency").default("USD"),
    targetRoles: jsonb("target_roles").$type<string[]>().default([]),
    experienceLevel: text("experience_level").default("MID"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("candidate_preferences_profile_id_idx").on(table.candidateProfileId),
  ],
);

/**
 * Projects table storing candidate project profiles verified by code and repository evidence.
 * Mandated by 01_build_the_system.md §4 Step 1, 02_how_to_build.md §2 & §3, and 04_ai_agent_skills.md §3.
 */
export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    candidateProfileId: text("candidate_profile_id")
      .notNull()
      .references((): AnyPgColumn => candidateProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    url: text("url"),
    repositoryUrl: text("repository_url"),
    primaryLanguage: text("primary_language"),
    languages: jsonb("languages").$type<string[]>().default([]),
    technologies: jsonb("technologies").$type<string[]>().default([]),
    architectureEvidence: text("architecture_evidence"),
    qualityNotes: text("quality_notes"),
    source: text("source").notNull().default("GITHUB"),
    verificationStatus: text("verification_status").notNull().default("VERIFIED"),
    confirmedByUser: boolean("confirmed_by_user").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("projects_candidate_profile_id_idx").on(table.candidateProfileId),
    index("projects_verification_status_idx").on(table.verificationStatus),
  ],
);

export const candidateProfilesRelations = relations(candidateProfiles, ({ one, many }) => ({
  user: one(user, {
    fields: [candidateProfiles.userId],
    references: [user.id],
  }),
  sourceResume: one(resumes, {
    fields: [candidateProfiles.sourceResumeId],
    references: [resumes.id],
  }),
  preferences: one(candidatePreferences),
  projects: many(projects),
  resumes: many(resumes),
}));

export const candidatePreferencesRelations = relations(candidatePreferences, ({ one }) => ({
  candidateProfile: one(candidateProfiles, {
    fields: [candidatePreferences.candidateProfileId],
    references: [candidateProfiles.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one }) => ({
  candidateProfile: one(candidateProfiles, {
    fields: [projects.candidateProfileId],
    references: [candidateProfiles.id],
  }),
}));
