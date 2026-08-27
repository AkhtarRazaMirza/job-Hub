import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { candidateProfiles } from "./candidate";

/**
 * Resumes table storing metadata for original candidate resumes.
 *
 * Implements architectural requirements from:
 * - 01_build_the_system.md §4: "User provides: Resume PDF/DOCX"
 * - 02_how_to_build.md §2: "Create database entities for: resumes"
 * - 03_tech_stack.md §10: "Cloudflare R2: Purpose: original resumes... Store metadata in PostgreSQL."
 */
export const resumes = pgTable(
  "resumes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    candidateProfileId: text("candidate_profile_id")
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    fileHash: text("file_hash"),
    status: text("status").notNull().default("UPLOADED"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("resumes_candidate_profile_id_idx").on(table.candidateProfileId),
    index("resumes_status_idx").on(table.status),
  ]
);

export const resumesRelations = relations(resumes, ({ one }) => ({
  candidateProfile: one(candidateProfiles, {
    fields: [resumes.candidateProfileId],
    references: [candidateProfiles.id],
  }),
}));
