import { relations } from "drizzle-orm";
import { type AnyPgColumn, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "editor", "moderator", "admin"]);
export const verificationTypeEnum = pgEnum("verification_type", ["otp", "magic_link", "password_reset"]);
export const ingredientTypeEnum = pgEnum("ingredient_type", ["fermentable", "hop", "yeast", "sugar", "adjunct", "fining", "misc"]);
export const ingredientStatusEnum = pgEnum("ingredient_status", ["draft", "active", "archived", "merged"]);
export const ingredientVisibilityEnum = pgEnum("ingredient_visibility", ["public", "internal"]);
export const proposedIngredientStatusEnum = pgEnum("proposed_ingredient_status", ["pending", "approved", "rejected", "merged"]);
export const userCustomIngredientVisibilityEnum = pgEnum("user_custom_ingredient_visibility", ["private", "shared"]);

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

export const ingredientCatalogItems = pgTable("ingredient_catalog_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: ingredientTypeEnum("type").notNull(),
  subtype: varchar("subtype", { length: 80 }),
  displayName: varchar("display_name", { length: 180 }).notNull(),
  normalizedName: varchar("normalized_name", { length: 220 }).notNull(),
  aliases: jsonb("aliases").$type<string[]>().default([]).notNull(),
  manufacturer: varchar("manufacturer", { length: 140 }),
  country: varchar("country", { length: 80 }),
  description: text("description"),
  defaultUnit: varchar("default_unit", { length: 32 }).notNull(),
  properties: jsonb("properties").$type<Record<string, unknown>>().default({}).notNull(),
  status: ingredientStatusEnum("status").default("active").notNull(),
  visibility: ingredientVisibilityEnum("visibility").default("public").notNull(),
  mergedIntoId: uuid("merged_into_id").references((): AnyPgColumn => ingredientCatalogItems.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  normalizedNameIdx: index("ingredient_catalog_items_normalized_name_idx").on(table.normalizedName),
  typeStatusIdx: index("ingredient_catalog_items_type_status_idx").on(table.type, table.status),
  statusIdx: index("ingredient_catalog_items_status_idx").on(table.status),
  mergedIntoIdx: index("ingredient_catalog_items_merged_into_idx").on(table.mergedIntoId),
  uniqueNamePerTypeIdx: uniqueIndex("ingredient_catalog_items_type_name_uidx").on(table.type, table.normalizedName)
}));

export const proposedIngredients = pgTable("proposed_ingredients", {
  id: uuid("id").defaultRandom().primaryKey(),
  submittedByUserId: uuid("submitted_by_user_id").references(() => users.id, { onDelete: "set null" }),
  sourcePayload: jsonb("source_payload").$type<Record<string, unknown>>().default({}).notNull(),
  sourceType: varchar("source_type", { length: 48 }).notNull(),
  sourceDisplayName: varchar("source_display_name", { length: 180 }).notNull(),
  normalizedName: varchar("normalized_name", { length: 220 }).notNull(),
  status: proposedIngredientStatusEnum("status").default("pending").notNull(),
  targetIngredientId: uuid("target_ingredient_id").references(() => ingredientCatalogItems.id, { onDelete: "set null" }),
  moderatorId: uuid("moderator_id").references(() => users.id, { onDelete: "set null" }),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  statusCreatedIdx: index("proposed_ingredients_status_created_idx").on(table.status, table.createdAt),
  normalizedNameIdx: index("proposed_ingredients_normalized_name_idx").on(table.normalizedName)
}));

export const userCustomIngredients = pgTable("user_custom_ingredients", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: ingredientTypeEnum("type").notNull(),
  displayName: varchar("display_name", { length: 180 }).notNull(),
  normalizedName: varchar("normalized_name", { length: 220 }).notNull(),
  properties: jsonb("properties").$type<Record<string, unknown>>().default({}).notNull(),
  visibility: userCustomIngredientVisibilityEnum("visibility").default("private").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userIdIdx: index("user_custom_ingredients_user_id_idx").on(table.userId),
  userTypeNameIdx: uniqueIndex("user_custom_ingredients_user_type_name_uidx").on(table.userId, table.type, table.normalizedName)
}));

export const userIngredients = pgTable("user_ingredients", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ingredientCatalogItemId: uuid("ingredient_catalog_item_id").references(() => ingredientCatalogItems.id, { onDelete: "set null" }),
  userCustomIngredientId: uuid("user_custom_ingredient_id").references(() => userCustomIngredients.id, { onDelete: "set null" }),
  quantity: integer("quantity").notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }),
  freshnessDate: timestamp("freshness_date", { withTimezone: true }),
  notes: text("notes"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userIdIdx: index("user_ingredients_user_id_idx").on(table.userId),
  userArchivedIdx: index("user_ingredients_user_archived_at_idx").on(table.userId, table.archivedAt),
  catalogItemIdx: index("user_ingredients_catalog_item_idx").on(table.ingredientCatalogItemId),
  customItemIdx: index("user_ingredients_custom_item_idx").on(table.userCustomIngredientId)
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts)
}));
