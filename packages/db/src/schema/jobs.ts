import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  index,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/**
 * Job Sources table storing canonical definitions for external job providers.
 * Grounded in 01_build_the_system.md §4 Step 3 and 02_how_to_build.md §2 & §5.
 */
export const jobSources = pgTable(
  "job_sources",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull().unique(),
    type: text("type").notNull(), // 'API' | 'FEED' | 'ATS' | 'BOARD' | 'USER_URL'
    url: text("url"), // Base URL, API endpoint, or feed URL
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("job_sources_is_active_idx").on(table.isActive),
    index("job_sources_type_idx").on(table.type),
  ]
);

/**
 * Canonical Jobs table storing internal structured job opportunities.
 * Grounded in 01_build_the_system.md §4 Step 4 & 5, 02_how_to_build.md §6, and 04_ai_agent_skills.md §5 & §6.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    source: text("source").notNull(), // Provider slug (e.g. "remoteok", "himalayas", "manual")
    sourceJobId: text("source_job_id"), // Provider-specific ID
    jobSourceId: text("job_source_id").references((): AnyPgColumn => jobSources.id, {
      onDelete: "set null",
    }),
    canonicalUrl: text("canonical_url"), // Normalized canonical application URL for deduplication
    title: text("title").notNull(),
    company: text("company").notNull(),
    location: text("location"), // e.g. "Worldwide", "US", "EMEA"
    remoteType: text("remote_type").notNull().default("UNKNOWN"), // WORLDWIDE_REMOTE, COUNTRY_REMOTE, REGION_REMOTE, HYBRID, ONSITE, UNKNOWN
    allowedCountries: jsonb("allowed_countries").$type<string[]>().default([]),
    salary: integer("salary"), // Primary compensation / minimum salary
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    currency: text("currency").default("USD"),
    experience: text("experience"), // e.g. "ENTRY", "MID", "SENIOR", "3+ years"
    skills: jsonb("skills").$type<string[]>().default([]),
    requirements: jsonb("requirements").$type<string[]>().default([]),
    description: text("description"), // Normalized job description plain text
    applicationUrl: text("application_url").notNull(),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE, CLOSED, UNKNOWN, ARCHIVED
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("jobs_source_source_job_id_idx").on(table.source, table.sourceJobId),
    index("jobs_canonical_url_idx").on(table.canonicalUrl),
    index("jobs_remote_type_idx").on(table.remoteType),
    index("jobs_status_idx").on(table.status),
    index("jobs_company_idx").on(table.company),
    index("jobs_job_source_id_idx").on(table.jobSourceId),
    index("jobs_posted_at_idx").on(table.postedAt),
  ]
);

export const jobSourcesRelations = relations(jobSources, ({ many }) => ({
  jobs: many(jobs),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  sourceDefinition: one(jobSources, {
    fields: [jobs.jobSourceId],
    references: [jobSources.id],
  }),
}));
