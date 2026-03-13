import { relations, sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, doublePrecision, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "editor", "moderator", "admin"]);
export const verificationTypeEnum = pgEnum("verification_type", ["otp", "magic_link", "password_reset"]);
export const ingredientTypeEnum = pgEnum("ingredient_type", ["fermentable", "hop", "yeast", "sugar", "adjunct", "fining", "misc"]);
export const ingredientStatusEnum = pgEnum("ingredient_status", ["draft", "active", "archived", "merged"]);
export const ingredientVisibilityEnum = pgEnum("ingredient_visibility", ["public", "internal"]);
export const ingredientCategoryEnum = pgEnum("ingredient_category", ["fermentable", "hop", "yeast", "water_prep", "misc"]);
export const ingredientMatchPolicyEnum = pgEnum("ingredient_match_policy", ["exact_only", "family_compatible"]);
export const ingredientCompletenessLevelEnum = pgEnum("ingredient_completeness_level", ["minimum", "recommended", "full"]);
export const proposedIngredientStatusEnum = pgEnum("proposed_ingredient_status", ["pending", "approved", "rejected", "merged"]);
export const userCustomIngredientVisibilityEnum = pgEnum("user_custom_ingredient_visibility", ["private", "shared"]);
export const hopFormEnum = pgEnum("hop_form", ["pellet", "whole_cone", "lupulin", "cryo"]);
export const yeastTypeEnum = pgEnum("yeast_type", ["ale", "lager", "wine"]);
export const yeastFormEnum = pgEnum("yeast_form", ["dry", "liquid"]);
export const inventoryUnitDimensionEnum = pgEnum("inventory_unit_dimension", ["weight", "volume", "count"]);
export const systemCurrencyEnum = pgEnum("system_currency", ["RUB", "USD", "EUR"]);
export const recipePublicationStateEnum = pgEnum("recipe_publication_state", ["draft", "private", "published"]);
export const recipeIngredientStageEnum = pgEnum("recipe_ingredient_stage", ["mash", "boil", "whirlpool", "fermentation", "packaging", "other"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  preferredCurrency: systemCurrencyEnum("preferred_currency").default("RUB").notNull(),
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

export const systemCurrencyRates = pgTable("system_currency_rates", {
  currency: systemCurrencyEnum("currency").primaryKey(),
  rubMinorPerUnit: integer("rub_minor_per_unit").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const systemEvents = pgTable("system_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: varchar("kind", { length: 80 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const ingredientFamilies = pgTable("ingredient_families", {
  id: uuid("id").defaultRandom().primaryKey(),
  category: ingredientCategoryEnum("category").notNull(),
  subtype: varchar("subtype", { length: 80 }),
  canonicalName: varchar("canonical_name", { length: 180 }).notNull(),
  normalizedCanonicalName: varchar("normalized_canonical_name", { length: 220 }).notNull(),
  displayNameRu: varchar("display_name_ru", { length: 180 }),
  displayNameEn: varchar("display_name_en", { length: 180 }),
  matchPolicy: ingredientMatchPolicyEnum("match_policy").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  categoryIdx: index("ingredient_families_category_idx").on(table.category),
  subtypeIdx: index("ingredient_families_subtype_idx").on(table.subtype),
  uniqueCanonicalNamePerCategoryIdx: uniqueIndex("ingredient_families_category_name_uidx").on(
    table.category,
    table.normalizedCanonicalName
  )
}));

export const ingredientCatalogItems = pgTable("ingredient_catalog_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: ingredientTypeEnum("type").notNull(),
  category: ingredientCategoryEnum("category").notNull(),
  subtype: varchar("subtype", { length: 80 }),
  familyId: uuid("family_id").notNull().references(() => ingredientFamilies.id, { onDelete: "restrict" }),
  displayName: varchar("display_name", { length: 180 }).notNull(),
  normalizedName: varchar("normalized_name", { length: 220 }).notNull(),
  aliases: jsonb("aliases").$type<string[]>().default([]).notNull(),
  brandName: varchar("brand_name", { length: 140 }),
  manufacturer: varchar("manufacturer", { length: 140 }),
  country: varchar("country", { length: 80 }),
  harvestYear: integer("harvest_year"),
  description: text("description"),
  defaultUnit: varchar("default_unit", { length: 32 }).notNull(),
  defaultDisplayUnit: varchar("default_display_unit", { length: 32 }).notNull(),
  allowedUnits: jsonb("allowed_units").$type<string[]>().default([]).notNull(),
  measurementDimension: inventoryUnitDimensionEnum("measurement_dimension").notNull(),
  completenessLevel: ingredientCompletenessLevelEnum("completeness_level").default("minimum").notNull(),
  technicalData: jsonb("technical_data").$type<Record<string, unknown>>().default({}).notNull(),
  fermentableColorEbc: doublePrecision("fermentable_color_ebc"),
  fermentableExtractYieldPct: doublePrecision("fermentable_extract_yield_pct"),
  hopAlphaAcidPct: doublePrecision("hop_alpha_acid_pct"),
  hopForm: hopFormEnum("hop_form"),
  hopSeason: varchar("hop_season", { length: 32 }),
  yeastAttenuationPct: doublePrecision("yeast_attenuation_pct"),
  yeastType: yeastTypeEnum("yeast_type"),
  yeastForm: yeastFormEnum("yeast_form"),
  yeastMinFermentationTempC: doublePrecision("yeast_min_fermentation_temp_c"),
  yeastMaxFermentationTempC: doublePrecision("yeast_max_fermentation_temp_c"),
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
  familyIdIdx: index("ingredient_catalog_items_family_id_idx").on(table.familyId),
  categoryIdx: index("ingredient_catalog_items_category_idx").on(table.category),
  subtypeIdx: index("ingredient_catalog_items_subtype_idx").on(table.subtype),
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
  manufacturer: varchar("manufacturer", { length: 140 }),
  country: varchar("country", { length: 80 }),
  fermentableColorEbc: doublePrecision("fermentable_color_ebc"),
  fermentableExtractYieldPct: doublePrecision("fermentable_extract_yield_pct"),
  hopAlphaAcidPct: doublePrecision("hop_alpha_acid_pct"),
  hopForm: hopFormEnum("hop_form"),
  hopSeason: varchar("hop_season", { length: 32 }),
  yeastAttenuationPct: doublePrecision("yeast_attenuation_pct"),
  yeastType: yeastTypeEnum("yeast_type"),
  yeastForm: yeastFormEnum("yeast_form"),
  yeastMinFermentationTempC: doublePrecision("yeast_min_fermentation_temp_c"),
  yeastMaxFermentationTempC: doublePrecision("yeast_max_fermentation_temp_c"),
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
  ingredientFamilyId: uuid("ingredient_family_id").references(() => ingredientFamilies.id, { onDelete: "set null" }),
  ingredientCategory: ingredientCategoryEnum("ingredient_category").notNull(),
  ingredientSubtype: varchar("ingredient_subtype", { length: 80 }),
  ingredientDisplayNameSnapshot: varchar("ingredient_display_name_snapshot", { length: 180 }),
  ingredientDefaultDisplayUnitSnapshot: varchar("ingredient_default_display_unit_snapshot", { length: 32 }),
  ingredientMeasurementDimension: inventoryUnitDimensionEnum("ingredient_measurement_dimension"),
  enteredQuantity: doublePrecision("entered_quantity").notNull(),
  enteredUnit: varchar("entered_unit", { length: 32 }).notNull(),
  normalizedQuantity: doublePrecision("normalized_quantity").notNull(),
  normalizedUnit: varchar("normalized_unit", { length: 32 }).notNull(),
  unitDimension: inventoryUnitDimensionEnum("unit_dimension").notNull(),
  purchasePriceMinor: integer("purchase_price_minor"),
  purchaseCurrency: systemCurrencyEnum("purchase_currency"),
  purchaseQuantity: doublePrecision("purchase_quantity"),
  purchaseQuantityUnit: varchar("purchase_quantity_unit", { length: 32 }),
  purchaseQuantityNormalized: doublePrecision("purchase_quantity_normalized"),
  purchaseQuantityNormalizedUnit: varchar("purchase_quantity_normalized_unit", { length: 32 }),
  normalizedUnitCostMinorRub: integer("normalized_unit_cost_minor_rub"),
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
  customItemIdx: index("user_ingredients_custom_item_idx").on(table.userCustomIngredientId),
  familyIdx: index("user_ingredients_family_idx").on(table.ingredientFamilyId),
  categoryIdx: index("user_ingredients_category_idx").on(table.ingredientCategory)
}));

export const recipes = pgTable("recipes", {
  id: uuid("id").defaultRandom().primaryKey(),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  publicationState: recipePublicationStateEnum("publication_state").default("draft").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  slug: varchar("slug", { length: 220 }).notNull(),
  styleId: varchar("style_id", { length: 64 }),
  batchSizeEnteredQuantity: doublePrecision("batch_size_entered_quantity").notNull(),
  batchSizeEnteredUnit: varchar("batch_size_entered_unit", { length: 32 }).notNull(),
  batchSizeNormalizedQuantity: doublePrecision("batch_size_normalized_quantity").notNull(),
  batchSizeNormalizedUnit: varchar("batch_size_normalized_unit", { length: 32 }).notNull(),
  efficiency: doublePrecision("efficiency"),
  og: doublePrecision("og"),
  fg: doublePrecision("fg"),
  abv: doublePrecision("abv"),
  ibu: doublePrecision("ibu"),
  color: doublePrecision("color"),
  description: text("description"),
  authorNotes: text("author_notes"),
  heroImageId: uuid("hero_image_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  authorIdIdx: index("recipes_author_id_idx").on(table.authorId),
  publicationStateIdx: index("recipes_publication_state_idx").on(table.publicationState),
  slugIdx: uniqueIndex("recipes_slug_uidx").on(table.slug)
}));

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: uuid("id").defaultRandom().primaryKey(),
  recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  ingredientCatalogItemId: uuid("ingredient_catalog_item_id").references(() => ingredientCatalogItems.id, { onDelete: "set null" }),
  userCustomIngredientId: uuid("user_custom_ingredient_id").references(() => userCustomIngredients.id, { onDelete: "set null" }),
  ingredientFamilyId: uuid("ingredient_family_id").references(() => ingredientFamilies.id, { onDelete: "set null" }),
  ingredientCategory: ingredientCategoryEnum("ingredient_category").notNull(),
  ingredientSubtype: varchar("ingredient_subtype", { length: 80 }),
  ingredientDisplayNameSnapshot: varchar("ingredient_display_name_snapshot", { length: 180 }),
  ingredientDefaultDisplayUnitSnapshot: varchar("ingredient_default_display_unit_snapshot", { length: 32 }),
  ingredientMeasurementDimension: inventoryUnitDimensionEnum("ingredient_measurement_dimension"),
  type: ingredientTypeEnum("type").notNull(),
  amountEnteredQuantity: doublePrecision("amount_entered_quantity").notNull(),
  amountEnteredUnit: varchar("amount_entered_unit", { length: 32 }).notNull(),
  amountNormalizedQuantity: doublePrecision("amount_normalized_quantity").notNull(),
  amountNormalizedUnit: varchar("amount_normalized_unit", { length: 32 }).notNull(),
  stage: recipeIngredientStageEnum("stage").default("other").notNull(),
  timeOffset: integer("time_offset"),
  stepMeta: jsonb("step_meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  recipeIdIdx: index("recipe_ingredients_recipe_id_idx").on(table.recipeId),
  catalogItemIdx: index("recipe_ingredients_catalog_item_idx").on(table.ingredientCatalogItemId),
  customItemIdx: index("recipe_ingredients_custom_item_idx").on(table.userCustomIngredientId),
  familyIdx: index("recipe_ingredients_family_idx").on(table.ingredientFamilyId),
  categoryIdx: index("recipe_ingredients_category_idx").on(table.ingredientCategory),
  sourceCheck: check(
    "recipe_ingredients_source_linkage_chk",
    sql`((ingredient_catalog_item_id is not null and user_custom_ingredient_id is null) or (ingredient_catalog_item_id is null and user_custom_ingredient_id is not null))`
  )
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  recipes: many(recipes)
}));

export const ingredientFamiliesRelations = relations(ingredientFamilies, ({ many }) => ({
  catalogItems: many(ingredientCatalogItems)
}));

export const ingredientCatalogItemsRelations = relations(ingredientCatalogItems, ({ one }) => ({
  family: one(ingredientFamilies, {
    fields: [ingredientCatalogItems.familyId],
    references: [ingredientFamilies.id]
  })
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  author: one(users, {
    fields: [recipes.authorId],
    references: [users.id]
  }),
  ingredients: many(recipeIngredients)
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeIngredients.recipeId],
    references: [recipes.id]
  }),
  catalogItem: one(ingredientCatalogItems, {
    fields: [recipeIngredients.ingredientCatalogItemId],
    references: [ingredientCatalogItems.id]
  }),
  customItem: one(userCustomIngredients, {
    fields: [recipeIngredients.userCustomIngredientId],
    references: [userCustomIngredients.id]
  })
}));
