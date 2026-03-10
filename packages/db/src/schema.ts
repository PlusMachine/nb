import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const systemEvents = pgTable("system_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: varchar("kind", { length: 80 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
