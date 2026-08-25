import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const healthCheck = pgTable("health_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  service: text("service").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
