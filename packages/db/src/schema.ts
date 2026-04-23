import { relations, sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, doublePrecision, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "editor", "moderator", "admin"]);
export const verificationTypeEnum = pgEnum("verification_type", ["otp", "magic_link", "password_reset"]);
export const ingredientTypeEnum = pgEnum("ingredient_type", [
  "fermentable",
  "hop",
  "yeast",
  "sugar",
  "adjunct",
  "fining",
  "misc",
  "malt",
  "consumable",
  "water_treatment"
]);
export const ingredientStatusEnum = pgEnum("ingredient_status", ["draft", "active", "archived", "merged"]);
export const ingredientVisibilityEnum = pgEnum("ingredient_visibility", ["public", "internal"]);
export const ingredientCategoryEnum = pgEnum("ingredient_category", [
  "fermentable",
  "hop",
  "yeast",
  "water_prep",
  "misc",
  "consumable",
  "water_treatment"
]);
export const ingredientMatchPolicyEnum = pgEnum("ingredient_match_policy", ["exact_only", "family_compatible"]);
export const ingredientCompletenessLevelEnum = pgEnum("ingredient_completeness_level", ["minimum", "recommended", "full"]);
export const proposedIngredientStatusEnum = pgEnum("proposed_ingredient_status", ["pending", "approved", "rejected", "merged"]);
export const userCustomIngredientVisibilityEnum = pgEnum("user_custom_ingredient_visibility", ["private", "shared"]);
export const hopFormEnum = pgEnum("hop_form", ["pellet", "whole_cone", "lupulin", "cryo", "standard"]);
export const yeastTypeEnum = pgEnum("yeast_type", ["ale", "lager", "wine"]);
export const yeastFormEnum = pgEnum("yeast_form", ["dry", "liquid"]);
export const inventoryUnitDimensionEnum = pgEnum("inventory_unit_dimension", ["weight", "volume", "count"]);
export const inventoryPriceInputModeEnum = pgEnum("inventory_price_input_mode", ["total", "per_display_unit"]);
export const systemCurrencyEnum = pgEnum("system_currency", ["RUB", "USD", "EUR"]);
export const recipePublicationStateEnum = pgEnum("recipe_publication_state", ["draft", "private", "published"]);
export const recipeIngredientStageEnum = pgEnum("recipe_ingredient_stage", ["mash", "boil", "whirlpool", "fermentation", "packaging", "other"]);
export const recipeInventoryAllocationStatusEnum = pgEnum("recipe_inventory_allocation_status", ["allocated", "reserved", "released", "consumed"]);
export const inventoryTransactionTypeEnum = pgEnum("inventory_transaction_type", ["consume", "reserve", "release", "adjustment"]);
export const brewBatchStatusEnum = pgEnum("brew_batch_status", ["planned", "brewing", "fermenting", "completed", "cancelled"]);
export const recipeImageStatusEnum = pgEnum("recipe_image_status", ["uploading", "ready", "failed"]);

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

export const ingredients = pgTable("ingredients", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  nameRu: text("name_ru"),
  nameEn: text("name_en"),
  displayModeRu: text("display_mode_ru").default("auto").notNull(),
  displayNameOverrideRu: text("display_name_override_ru"),
  secondaryNameOverrideRu: text("secondary_name_override_ru"),
  hideSecondaryNameRu: boolean("hide_secondary_name_ru").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  countryCode: text("country_code"),
  countryName: text("country_name"),
  brand: text("brand"),
  producer: text("producer"),
  productCode: text("product_code"),
  groupName: text("group_name"),
  category: text("category"),
  subcategory: text("subcategory"),
  itemKind: text("item_kind"),
  presentOnBirrf: boolean("present_on_birrf"),
  inventoryEnabled: boolean("inventory_enabled").default(true).notNull(),
  attributes: jsonb("attributes").$type<Record<string, unknown>>().default({}).notNull(),
  quantityDefaults: jsonb("quantity_defaults").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  typeIdx: index("ingredients_type_idx").on(table.type),
  activeIdx: index("ingredients_is_active_idx").on(table.isActive),
  categoryIdx: index("ingredients_category_idx").on(table.category),
  itemKindIdx: index("ingredients_item_kind_idx").on(table.itemKind),
  brandIdx: index("ingredients_brand_idx").on(table.brand),
  producerIdx: index("ingredients_producer_idx").on(table.producer),
  productCodeIdx: index("ingredients_product_code_idx").on(table.productCode)
}));

export const ingredientAliases = pgTable("ingredient_aliases", {
  id: uuid("id").defaultRandom().primaryKey(),
  ingredientId: text("ingredient_id").notNull().references(() => ingredients.id, { onDelete: "cascade" }),
  locale: text("locale").notNull(),
  alias: text("alias").notNull(),
  aliasNormalized: text("alias_normalized").notNull(),
  source: text("source").default("seed").notNull(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  ingredientIdx: index("ingredient_aliases_ingredient_id_idx").on(table.ingredientId),
  normalizedIdx: index("ingredient_aliases_alias_normalized_idx").on(table.aliasNormalized),
  uniqueAliasIdx: uniqueIndex("ingredient_aliases_unique_uidx").on(table.ingredientId, table.locale, table.aliasNormalized)
}));

export const ingredientSources = pgTable("ingredient_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  ingredientId: text("ingredient_id").notNull().references(() => ingredients.id, { onDelete: "cascade" }),
  kind: text("kind"),
  label: text("label"),
  url: text("url"),
  sourceBasis: text("source_basis"),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  ingredientIdx: index("ingredient_sources_ingredient_id_idx").on(table.ingredientId),
  positionIdx: index("ingredient_sources_ingredient_position_idx").on(table.ingredientId, table.position)
}));

export const ingredientPackageVariants = pgTable("ingredient_package_variants", {
  id: text("id").primaryKey(),
  ingredientId: text("ingredient_id").notNull().references(() => ingredients.id, { onDelete: "cascade" }),
  brand: text("brand"),
  productNameEn: text("product_name_en"),
  productNameRu: text("product_name_ru"),
  countryNameRu: text("country_name_ru"),
  packageAmount: doublePrecision("package_amount"),
  packageUnit: text("package_unit"),
  stockContentAmount: doublePrecision("stock_content_amount"),
  stockContentUnit: text("stock_content_unit"),
  sourceGroup: text("source_group"),
  sourceUrl: text("source_url"),
  isDefaultForStock: boolean("is_default_for_stock").default(false).notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  ingredientIdx: index("ingredient_package_variants_ingredient_id_idx").on(table.ingredientId),
  defaultIdx: index("ingredient_package_variants_default_idx").on(table.ingredientId, table.isDefaultForStock),
  positionIdx: index("ingredient_package_variants_position_idx").on(table.ingredientId, table.position)
}));

export const ingredientCatalogItems = pgTable("ingredient_catalog_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: ingredientTypeEnum("type").notNull(),
  category: ingredientCategoryEnum("category").notNull(),
  subtype: varchar("subtype", { length: 80 }),
  familyId: uuid("family_id").notNull().references(() => ingredientFamilies.id, { onDelete: "restrict" }),
  displayName: varchar("display_name", { length: 180 }).notNull(),
  displayNameRu: varchar("display_name_ru", { length: 180 }).notNull(),
  displayNameEn: varchar("display_name_en", { length: 180 }),
  normalizedName: varchar("normalized_name", { length: 220 }).notNull(),
  aliases: jsonb("aliases").$type<string[]>().default([]).notNull(),
  searchAliasesNorm: jsonb("search_aliases_norm").$type<string[]>().default([]).notNull(),
  searchTextNorm: text("search_text_norm").default("").notNull(),
  brandName: varchar("brand_name", { length: 140 }),
  manufacturer: varchar("manufacturer", { length: 140 }),
  country: varchar("country", { length: 80 }),
  catalogSourceDataset: varchar("catalog_source_dataset", { length: 160 }),
  catalogSourceKey: varchar("catalog_source_key", { length: 191 }),
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
  uniqueNamePerTypeIdx: uniqueIndex("ingredient_catalog_items_type_name_uidx").on(table.type, table.normalizedName),
  sourceIdentityIdx: uniqueIndex("ingredient_catalog_items_source_uidx").on(table.catalogSourceDataset, table.catalogSourceKey)
}));

export const proposedIngredients = pgTable("proposed_ingredients", {
  id: uuid("id").defaultRandom().primaryKey(),
  submittedByUserId: uuid("submitted_by_user_id").references(() => users.id, { onDelete: "set null" }),
  sourcePayload: jsonb("source_payload").$type<Record<string, unknown>>().default({}).notNull(),
  sourceType: varchar("source_type", { length: 48 }).notNull(),
  sourceDisplayName: varchar("source_display_name", { length: 180 }).notNull(),
  normalizedName: varchar("normalized_name", { length: 220 }).notNull(),
  status: proposedIngredientStatusEnum("status").default("pending").notNull(),
  targetIngredientId: text("target_ingredient_id").references(() => ingredients.id, { onDelete: "set null" }),
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

export const userIngredientPreferences = pgTable("user_ingredient_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ingredientCatalogItemId: text("ingredient_catalog_item_id").references(() => ingredients.id, { onDelete: "cascade" }),
  userCustomIngredientId: uuid("user_custom_ingredient_id").references(() => userCustomIngredients.id, { onDelete: "cascade" }),
  isFavorite: boolean("is_favorite").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userIdIdx: index("user_ingredient_preferences_user_id_idx").on(table.userId),
  catalogItemIdx: uniqueIndex("user_ingredient_preferences_user_catalog_item_uidx").on(table.userId, table.ingredientCatalogItemId),
  customItemIdx: uniqueIndex("user_ingredient_preferences_user_custom_item_uidx").on(table.userId, table.userCustomIngredientId),
  sourceCheck: check(
    "user_ingredient_preferences_source_linkage_chk",
    sql`((ingredient_catalog_item_id is not null and user_custom_ingredient_id is null) or (ingredient_catalog_item_id is null and user_custom_ingredient_id is not null))`
  )
}));

export const userIngredientPurchaseLinks = pgTable("user_ingredient_purchase_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ingredientCatalogItemId: text("ingredient_catalog_item_id").references(() => ingredients.id, { onDelete: "cascade" }),
  userCustomIngredientId: uuid("user_custom_ingredient_id").references(() => userCustomIngredients.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  normalizedUrl: text("normalized_url").notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userIdIdx: index("user_ingredient_purchase_links_user_id_idx").on(table.userId),
  catalogPositionIdx: index("user_ingredient_purchase_links_catalog_position_idx").on(table.userId, table.ingredientCatalogItemId, table.position),
  customPositionIdx: index("user_ingredient_purchase_links_custom_position_idx").on(table.userId, table.userCustomIngredientId, table.position),
  catalogUrlIdx: uniqueIndex("user_ingredient_purchase_links_user_catalog_url_uidx").on(table.userId, table.ingredientCatalogItemId, table.normalizedUrl),
  customUrlIdx: uniqueIndex("user_ingredient_purchase_links_user_custom_url_uidx").on(table.userId, table.userCustomIngredientId, table.normalizedUrl),
  sourceCheck: check(
    "user_ingredient_purchase_links_source_linkage_chk",
    sql`((ingredient_catalog_item_id is not null and user_custom_ingredient_id is null) or (ingredient_catalog_item_id is null and user_custom_ingredient_id is not null))`
  )
}));

export const userIngredients = pgTable("user_ingredients", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ingredientCatalogItemId: text("ingredient_catalog_item_id").references(() => ingredients.id, { onDelete: "set null" }),
  userCustomIngredientId: uuid("user_custom_ingredient_id").references(() => userCustomIngredients.id, { onDelete: "set null" }),
  packageVariantId: text("package_variant_id").references(() => ingredientPackageVariants.id, { onDelete: "set null" }),
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
  priceInputMode: inventoryPriceInputModeEnum("price_input_mode"),
  priceInputAmountMinor: integer("price_input_amount_minor"),
  priceInputCurrency: systemCurrencyEnum("price_input_currency"),
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
  packageVariantIdx: index("user_ingredients_package_variant_idx").on(table.packageVariantId),
  familyIdx: index("user_ingredients_family_idx").on(table.ingredientFamilyId),
  categoryIdx: index("user_ingredients_category_idx").on(table.ingredientCategory),
  sourceCheck: check(
    "user_ingredients_source_linkage_chk",
    sql`((ingredient_catalog_item_id is not null and user_custom_ingredient_id is null) or (ingredient_catalog_item_id is null and user_custom_ingredient_id is not null))`
  )
}));

export const equipmentProfiles = pgTable("equipment_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 180 }).notNull(),
  targetBatchVolumeL: doublePrecision("target_batch_volume_l").notNull(),
  brewhouseEfficiencyPct: doublePrecision("brewhouse_efficiency_pct").default(75).notNull(),
  evaporationRateLPerHr: doublePrecision("evaporation_rate_l_per_hr").default(3).notNull(),
  trubChillerLossL: doublePrecision("trub_chiller_loss_l").default(0).notNull(),
  fermenterLossL: doublePrecision("fermenter_loss_l").default(0).notNull(),
  grainAbsorptionLPerKg: doublePrecision("grain_absorption_l_per_kg").default(0.75).notNull(),
  coolingShrinkagePct: doublePrecision("cooling_shrinkage_pct").default(4).notNull(),
  mashThicknessLPerKg: doublePrecision("mash_thickness_l_per_kg").default(3).notNull(),
  maxMashVolumeL: doublePrecision("max_mash_volume_l"),
  maxKettleVolumeL: doublePrecision("max_kettle_volume_l"),
  hopUtilizationFactor: doublePrecision("hop_utilization_factor").default(1).notNull(),
  altitudeM: doublePrecision("altitude_m").default(0).notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userIdIdx: index("equipment_profiles_user_id_idx").on(table.userId),
  userNameIdx: uniqueIndex("equipment_profiles_user_name_uidx").on(table.userId, table.name),
  userDefaultIdx: uniqueIndex("equipment_profiles_user_default_uidx").on(table.userId).where(sql`${table.isDefault} = true`)
}));

export const userBrewingSettings = pgTable("user_brewing_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  preferredBitternessFormula: varchar("preferred_bitterness_formula", { length: 64 }).default("tinseth_whirlpool_v2").notNull(),
  bitternessSettings: jsonb("bitterness_settings").$type<Record<string, unknown>>().default({}).notNull(),
  preferredWaterEngine: varchar("preferred_water_engine", { length: 64 }).default("balanced_default").notNull(),
  preferredMashPhModel: varchar("preferred_mash_ph_model", { length: 64 }).default("hybrid_mash_ph_v1").notNull(),
  waterSettings: jsonb("water_settings").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userIdIdx: uniqueIndex("user_brewing_settings_user_id_uidx").on(table.userId)
}));

export const recipes = pgTable("recipes", {
  id: uuid("id").defaultRandom().primaryKey(),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recipeFamilyId: uuid("recipe_family_id").notNull(),
  versionNumber: integer("version_number").default(1).notNull(),
  publicationState: recipePublicationStateEnum("publication_state").default("draft").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  slug: varchar("slug", { length: 220 }).notNull(),
  styleId: varchar("style_id", { length: 64 }),
  batchSizeEnteredQuantity: doublePrecision("batch_size_entered_quantity").notNull(),
  batchSizeEnteredUnit: varchar("batch_size_entered_unit", { length: 32 }).notNull(),
  batchSizeNormalizedQuantity: doublePrecision("batch_size_normalized_quantity").notNull(),
  batchSizeNormalizedUnit: varchar("batch_size_normalized_unit", { length: 32 }).notNull(),
  efficiency: doublePrecision("efficiency"),
  boilTimeMinutes: integer("boil_time_minutes").default(60).notNull(),
  og: doublePrecision("og"),
  fg: doublePrecision("fg"),
  abv: doublePrecision("abv"),
  ibu: doublePrecision("ibu"),
  color: doublePrecision("color"),
  description: text("description"),
  authorNotes: text("author_notes"),
  processMeta: jsonb("process_meta").$type<Record<string, unknown>>(),
  calculationMeta: jsonb("calculation_meta").$type<Record<string, unknown>>(),
  draftState: jsonb("draft_state").$type<Record<string, unknown>>(),
  importMeta: jsonb("import_meta").$type<Record<string, unknown>>(),
  equipmentProfileId: uuid("equipment_profile_id").references(() => equipmentProfiles.id, { onDelete: "set null" }),
  equipmentProfileSnapshot: jsonb("equipment_profile_snapshot").$type<Record<string, unknown>>(),
  waterPlanMeta: jsonb("water_plan_meta").$type<Record<string, unknown>>(),
  brewPlanMeta: jsonb("brew_plan_meta").$type<Record<string, unknown>>(),
  heroImageId: uuid("hero_image_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  authorIdIdx: index("recipes_author_id_idx").on(table.authorId),
  familyIdIdx: index("recipes_family_id_idx").on(table.recipeFamilyId),
  familyVersionIdx: uniqueIndex("recipes_family_version_uidx").on(table.recipeFamilyId, table.versionNumber),
  publicationStateIdx: index("recipes_publication_state_idx").on(table.publicationState),
  equipmentProfileIdx: index("recipes_equipment_profile_id_idx").on(table.equipmentProfileId),
  slugIdx: uniqueIndex("recipes_slug_uidx").on(table.slug)
}));

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: uuid("id").defaultRandom().primaryKey(),
  recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  persistentKey: uuid("persistent_key").defaultRandom().notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  ingredientCatalogItemId: text("ingredient_catalog_item_id").references(() => ingredients.id, { onDelete: "set null" }),
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
  inventoryIntentMode: varchar("inventory_intent_mode", { length: 32 }),
  inventorySelectionMeta: jsonb("inventory_selection_meta").$type<Record<string, unknown>>(),
  externalImportMeta: jsonb("external_import_meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  recipeIdIdx: index("recipe_ingredients_recipe_id_idx").on(table.recipeId),
  persistentKeyIdx: uniqueIndex("recipe_ingredients_recipe_persistent_key_uidx").on(table.recipeId, table.persistentKey),
  displayOrderIdx: index("recipe_ingredients_recipe_display_order_idx").on(table.recipeId, table.displayOrder),
  catalogItemIdx: index("recipe_ingredients_catalog_item_idx").on(table.ingredientCatalogItemId),
  customItemIdx: index("recipe_ingredients_custom_item_idx").on(table.userCustomIngredientId),
  familyIdx: index("recipe_ingredients_family_idx").on(table.ingredientFamilyId),
  categoryIdx: index("recipe_ingredients_category_idx").on(table.ingredientCategory),
  sourceCheck: check(
    "recipe_ingredients_source_linkage_chk",
    sql`((ingredient_catalog_item_id is not null and user_custom_ingredient_id is null and coalesce(inventory_intent_mode, '') <> 'imported') or (ingredient_catalog_item_id is null and user_custom_ingredient_id is not null and coalesce(inventory_intent_mode, '') <> 'imported') or (ingredient_catalog_item_id is null and user_custom_ingredient_id is null and inventory_intent_mode = 'imported'))`
  )
}));

export const recipeImages = pgTable("recipe_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  storageKeyOriginal: text("storage_key_original"),
  storageKeyLarge: text("storage_key_large"),
  storageKeyMedium: text("storage_key_medium"),
  storageKeyThumb: text("storage_key_thumb"),
  width: integer("width"),
  height: integer("height"),
  mimeType: varchar("mime_type", { length: 128 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  blurDataUrl: text("blur_data_url"),
  caption: text("caption"),
  altText: text("alt_text"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isCover: boolean("is_cover").default(false).notNull(),
  status: recipeImageStatusEnum("status").default("uploading").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
}, (table) => ({
  recipeIdIdx: index("recipe_images_recipe_id_idx").on(table.recipeId),
  recipeSortOrderIdx: index("recipe_images_recipe_sort_order_idx").on(table.recipeId, table.sortOrder),
  recipeCoverIdx: index("recipe_images_recipe_cover_idx").on(table.recipeId, table.isCover)
}));

export const brewBatches = pgTable("brew_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  status: brewBatchStatusEnum("status").default("planned").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  brewPlanSnapshot: jsonb("brew_plan_snapshot").$type<Record<string, unknown>>().default({}).notNull(),
  recipeSnapshot: jsonb("recipe_snapshot").$type<Record<string, unknown>>(),
  equipmentProfileSnapshot: jsonb("equipment_profile_snapshot").$type<Record<string, unknown>>(),
  waterPlanSnapshot: jsonb("water_plan_snapshot").$type<Record<string, unknown>>(),
  deviceHints: jsonb("device_hints").$type<Record<string, unknown>[]>().default([]).notNull(),
  notes: text("notes"),
  plannedFor: timestamp("planned_for", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userIdIdx: index("brew_batches_user_id_idx").on(table.userId),
  recipeIdIdx: index("brew_batches_recipe_id_idx").on(table.recipeId),
  statusIdx: index("brew_batches_status_idx").on(table.status)
}));

export const recipeInventoryAllocations = pgTable("recipe_inventory_allocations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  recipeIngredientId: uuid("recipe_ingredient_id").notNull().references(() => recipeIngredients.id, { onDelete: "cascade" }),
  recipeIngredientPersistentKey: uuid("recipe_ingredient_persistent_key").notNull(),
  inventoryItemId: uuid("inventory_item_id").notNull().references(() => userIngredients.id, { onDelete: "restrict" }),
  status: recipeInventoryAllocationStatusEnum("status").default("allocated").notNull(),
  allocatedQuantityNormalized: doublePrecision("allocated_quantity_normalized").notNull(),
  allocatedNormalizedUnit: varchar("allocated_normalized_unit", { length: 32 }).notNull(),
  allocationMeta: jsonb("allocation_meta").$type<Record<string, unknown>>().default({}).notNull(),
  allocatedAt: timestamp("allocated_at", { withTimezone: true }).defaultNow().notNull(),
  reservedAt: timestamp("reserved_at", { withTimezone: true }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userRecipeIdx: index("recipe_inventory_allocations_user_recipe_idx").on(table.userId, table.recipeId),
  recipeIngredientIdx: index("recipe_inventory_allocations_recipe_ingredient_idx").on(table.recipeIngredientId),
  persistentKeyIdx: index("recipe_inventory_allocations_persistent_key_idx").on(table.recipeId, table.recipeIngredientPersistentKey),
  inventoryItemIdx: index("recipe_inventory_allocations_inventory_item_idx").on(table.inventoryItemId),
  statusIdx: index("recipe_inventory_allocations_status_idx").on(table.status)
}));

export const inventoryTransactions = pgTable("inventory_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  inventoryItemId: uuid("inventory_item_id").notNull().references(() => userIngredients.id, { onDelete: "restrict" }),
  recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
  recipeIngredientId: uuid("recipe_ingredient_id").references(() => recipeIngredients.id, { onDelete: "set null" }),
  brewBatchId: uuid("brew_batch_id").references(() => brewBatches.id, { onDelete: "set null" }),
  type: inventoryTransactionTypeEnum("type").notNull(),
  quantityDeltaNormalized: doublePrecision("quantity_delta_normalized").notNull(),
  normalizedUnit: varchar("normalized_unit", { length: 32 }).notNull(),
  quantityBeforeNormalized: doublePrecision("quantity_before_normalized").notNull(),
  quantityAfterNormalized: doublePrecision("quantity_after_normalized").notNull(),
  transactionMeta: jsonb("transaction_meta").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userIdIdx: index("inventory_transactions_user_id_idx").on(table.userId),
  inventoryItemIdx: index("inventory_transactions_inventory_item_idx").on(table.inventoryItemId),
  recipeIdx: index("inventory_transactions_recipe_idx").on(table.recipeId),
  brewBatchIdx: index("inventory_transactions_brew_batch_idx").on(table.brewBatchId),
  typeIdx: index("inventory_transactions_type_idx").on(table.type)
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  recipes: many(recipes),
  ingredientPreferences: many(userIngredientPreferences),
  ingredientPurchaseLinks: many(userIngredientPurchaseLinks),
  equipmentProfiles: many(equipmentProfiles),
  brewingSettings: many(userBrewingSettings),
  brewBatches: many(brewBatches),
  recipeInventoryAllocations: many(recipeInventoryAllocations),
  inventoryTransactions: many(inventoryTransactions)
}));

export const ingredientFamiliesRelations = relations(ingredientFamilies, ({ many }) => ({
  catalogItems: many(ingredientCatalogItems)
}));

export const ingredientsRelations = relations(ingredients, ({ many }) => ({
  aliases: many(ingredientAliases),
  sources: many(ingredientSources),
  packageVariants: many(ingredientPackageVariants),
  userPreferences: many(userIngredientPreferences),
  userPurchaseLinks: many(userIngredientPurchaseLinks)
}));

export const ingredientAliasesRelations = relations(ingredientAliases, ({ one }) => ({
  ingredient: one(ingredients, {
    fields: [ingredientAliases.ingredientId],
    references: [ingredients.id]
  })
}));

export const ingredientSourcesRelations = relations(ingredientSources, ({ one }) => ({
  ingredient: one(ingredients, {
    fields: [ingredientSources.ingredientId],
    references: [ingredients.id]
  })
}));

export const ingredientPackageVariantsRelations = relations(ingredientPackageVariants, ({ one }) => ({
  ingredient: one(ingredients, {
    fields: [ingredientPackageVariants.ingredientId],
    references: [ingredients.id]
  })
}));

export const userCustomIngredientsRelations = relations(userCustomIngredients, ({ many }) => ({
  userPreferences: many(userIngredientPreferences),
  userPurchaseLinks: many(userIngredientPurchaseLinks)
}));

export const userIngredientPreferencesRelations = relations(userIngredientPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userIngredientPreferences.userId],
    references: [users.id]
  }),
  catalogItem: one(ingredients, {
    fields: [userIngredientPreferences.ingredientCatalogItemId],
    references: [ingredients.id]
  }),
  customItem: one(userCustomIngredients, {
    fields: [userIngredientPreferences.userCustomIngredientId],
    references: [userCustomIngredients.id]
  })
}));

export const userIngredientPurchaseLinksRelations = relations(userIngredientPurchaseLinks, ({ one }) => ({
  user: one(users, {
    fields: [userIngredientPurchaseLinks.userId],
    references: [users.id]
  }),
  catalogItem: one(ingredients, {
    fields: [userIngredientPurchaseLinks.ingredientCatalogItemId],
    references: [ingredients.id]
  }),
  customItem: one(userCustomIngredients, {
    fields: [userIngredientPurchaseLinks.userCustomIngredientId],
    references: [userCustomIngredients.id]
  })
}));

export const equipmentProfilesRelations = relations(equipmentProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [equipmentProfiles.userId],
    references: [users.id]
  }),
  recipes: many(recipes)
}));

export const userBrewingSettingsRelations = relations(userBrewingSettings, ({ one }) => ({
  user: one(users, {
    fields: [userBrewingSettings.userId],
    references: [users.id]
  })
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
  equipmentProfile: one(equipmentProfiles, {
    fields: [recipes.equipmentProfileId],
    references: [equipmentProfiles.id]
  }),
  ingredients: many(recipeIngredients),
  images: many(recipeImages),
  brewBatches: many(brewBatches),
  inventoryAllocations: many(recipeInventoryAllocations),
  inventoryTransactions: many(inventoryTransactions)
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one, many }) => ({
  recipe: one(recipes, {
    fields: [recipeIngredients.recipeId],
    references: [recipes.id]
  }),
  catalogItem: one(ingredients, {
    fields: [recipeIngredients.ingredientCatalogItemId],
    references: [ingredients.id]
  }),
  customItem: one(userCustomIngredients, {
    fields: [recipeIngredients.userCustomIngredientId],
    references: [userCustomIngredients.id]
  }),
  inventoryAllocations: many(recipeInventoryAllocations),
  inventoryTransactions: many(inventoryTransactions)
}));

export const recipeImagesRelations = relations(recipeImages, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeImages.recipeId],
    references: [recipes.id]
  })
}));

export const userIngredientsRelations = relations(userIngredients, ({ one, many }) => ({
  user: one(users, {
    fields: [userIngredients.userId],
    references: [users.id]
  }),
  catalogItem: one(ingredients, {
    fields: [userIngredients.ingredientCatalogItemId],
    references: [ingredients.id]
  }),
  customItem: one(userCustomIngredients, {
    fields: [userIngredients.userCustomIngredientId],
    references: [userCustomIngredients.id]
  }),
  recipeInventoryAllocations: many(recipeInventoryAllocations),
  inventoryTransactions: many(inventoryTransactions)
}));

export const brewBatchesRelations = relations(brewBatches, ({ one, many }) => ({
  user: one(users, {
    fields: [brewBatches.userId],
    references: [users.id]
  }),
  recipe: one(recipes, {
    fields: [brewBatches.recipeId],
    references: [recipes.id]
  }),
  inventoryTransactions: many(inventoryTransactions)
}));

export const recipeInventoryAllocationsRelations = relations(recipeInventoryAllocations, ({ one }) => ({
  user: one(users, {
    fields: [recipeInventoryAllocations.userId],
    references: [users.id]
  }),
  recipe: one(recipes, {
    fields: [recipeInventoryAllocations.recipeId],
    references: [recipes.id]
  }),
  recipeIngredient: one(recipeIngredients, {
    fields: [recipeInventoryAllocations.recipeIngredientId],
    references: [recipeIngredients.id]
  }),
  inventoryItem: one(userIngredients, {
    fields: [recipeInventoryAllocations.inventoryItemId],
    references: [userIngredients.id]
  })
}));

export const inventoryTransactionsRelations = relations(inventoryTransactions, ({ one }) => ({
  user: one(users, {
    fields: [inventoryTransactions.userId],
    references: [users.id]
  }),
  inventoryItem: one(userIngredients, {
    fields: [inventoryTransactions.inventoryItemId],
    references: [userIngredients.id]
  }),
  recipe: one(recipes, {
    fields: [inventoryTransactions.recipeId],
    references: [recipes.id]
  }),
  recipeIngredient: one(recipeIngredients, {
    fields: [inventoryTransactions.recipeIngredientId],
    references: [recipeIngredients.id]
  }),
  brewBatch: one(brewBatches, {
    fields: [inventoryTransactions.brewBatchId],
    references: [brewBatches.id]
  })
}));
