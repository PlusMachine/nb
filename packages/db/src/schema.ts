import { relations } from "drizzle-orm";
import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "editor", "moderator", "admin"]);
export const verificationTypeEnum = pgEnum("verification_type", ["otp", "magic_link", "password_reset"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  image: text("image"),
  role: userRoleEnum("role").default("user").notNull(),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  emailIdx: uniqueIndex("users_email_uidx").on(table.email)
}));

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  tokenIdx: uniqueIndex("sessions_token_hash_uidx").on(table.tokenHash),
  userIdIdx: index("sessions_user_id_idx").on(table.userId)
}));

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 64 }).notNull(),
  providerAccountId: varchar("provider_account_id", { length: 191 }).notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  providerIdx: uniqueIndex("accounts_provider_uidx").on(table.provider, table.providerAccountId),
  userIdIdx: index("accounts_user_id_idx").on(table.userId)
}));

export const verifications = pgTable("verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  type: verificationTypeEnum("type").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  attempts: integer("attempts").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  emailIdx: index("verifications_email_idx").on(table.email, table.type),
  tokenIdx: uniqueIndex("verifications_code_hash_uidx").on(table.codeHash)
}));

export const authRateLimits = pgTable("auth_rate_limits", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 191 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  count: integer("count").default(1).notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  keyActionIdx: uniqueIndex("auth_rate_limits_key_action_uidx").on(table.key, table.action)
}));

export const systemEvents = pgTable("system_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: varchar("kind", { length: 80 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts)
}));
