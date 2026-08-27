import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const candidateProfiles = pgTable(
  "candidate_profiles",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
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

export const candidateProfilesRelations = relations(candidateProfiles, ({ one }) => ({
  user: one(user, {
    fields: [candidateProfiles.userId],
    references: [user.id],
  }),
}));
