import { relations, sql } from "drizzle-orm";
import { type AnyPgColumn, bigserial, boolean, check, doublePrecision, index, integer, jsonb, pgEnum, pgTable, real, smallint, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "editor", "moderator", "admin"]);
export const verificationTypeEnum = pgEnum("verification_type", ["otp", "magic_link", "password_reset", "sms_otp"]);
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
export const preferredGravityUnitEnum = pgEnum("preferred_gravity_unit", ["sg", "plato", "brix"]);
export const recipePublicationStateEnum = pgEnum("recipe_publication_state", ["draft", "private", "published"]);
export const recipeIngredientStageEnum = pgEnum("recipe_ingredient_stage", ["mash", "boil", "whirlpool", "fermentation", "packaging", "other"]);
export const recipeInventoryAllocationStatusEnum = pgEnum("recipe_inventory_allocation_status", ["allocated", "reserved", "released", "consumed"]);
export const inventoryTransactionTypeEnum = pgEnum("inventory_transaction_type", ["consume", "reserve", "release", "adjustment"]);
export const brewBatchStatusEnum = pgEnum("brew_batch_status", ["planned", "brewing", "fermenting", "completed", "cancelled"]);
export const recipeImageStatusEnum = pgEnum("recipe_image_status", ["uploading", "ready", "failed"]);
export const brewDeviceStatusEnum = pgEnum("brew_device_status", ["online", "offline", "unknown"]);
export const firmwareChannelEnum = pgEnum("firmware_channel", ["stable", "beta"]);
export const deviceCommandStatusEnum = pgEnum("device_command_status", ["queued", "sent", "acked", "failed"]);
// Контент-CMS (Track A): редакторские статьи/гайды/обзоры в БД (BJCP остаётся
// file-backed в @nb/content и сюда не пишется).
export const contentArticleTypeEnum = pgEnum("content_article_type", ["guide", "review"]);
export const contentArticleStatusEnum = pgEnum("content_article_status", ["draft", "published", "archived"]);
// Витрина мастеров (docs/masters-showcase.md): «мастер» — не роль, а наличие
// профиля у пользователя. Модель «черновик + опубликованный снапшот»: каждая
// правка после первой публикации снова уходит на модерацию.
export const masterReviewStatusEnum = pgEnum("master_review_status", ["draft", "pending", "rejected"]);
// Отдельный enum (а не переиспользование recipeImageStatusEnum) — статусы фото
// мастеров и рецептов совпадают по значениям, но это разные домены с разным
// жизненным циклом; так они не окажутся молча завязаны на один Postgres-тип.
export const masterImageStatusEnum = pgEnum("master_image_status", ["uploading", "ready", "failed"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  // email и phone оба nullable: телефон-only аккаунты не обязаны иметь e-mail и наоборот.
  // В Postgres NULL'ы в unique-индексе не конфликтуют, поэтому уникальность сохраняется
  // только для реально заданных значений.
  email: varchar("email", { length: 320 }),
  emailVerified: boolean("email_verified").default(false).notNull(),
  phone: varchar("phone", { length: 20 }),
  phoneVerified: boolean("phone_verified").default(false).notNull(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  preferredCurrency: systemCurrencyEnum("preferred_currency").default("RUB").notNull(),
  preferredGravityUnit: preferredGravityUnitEnum("preferred_gravity_unit").default("plato").notNull(),
  image: text("image"),
  role: userRoleEnum("role").default("user").notNull(),
  passwordHash: text("password_hash"),
  // Фиксация согласия на обработку ПДн (152-ФЗ): момент и версия правовых документов,
  // под которой пользователь дал согласие при регистрации. NULL — согласие не
  // фиксировалось (например, dev-автологин или аккаунт до внедрения фиксации).
  consentAcceptedAt: timestamp("consent_accepted_at", { withTimezone: true }),
  consentVersion: varchar("consent_version", { length: 32 }),
  // Блокировка модератором: аккаунт остаётся в БД, но вход запрещён.
  blockedAt: timestamp("blocked_at", { withTimezone: true }),
  blockedReason: text("blocked_reason"),
  blockedByUserId: uuid("blocked_by_user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  // Обезличивание вместо удаления: ПДн затираются, строка остаётся — иначе
  // рвутся ссылки (авторство, аудит) и заблокированный заново регистрируется
  // по тому же e-mail. NULL = аккаунт живой.
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  emailIdx: uniqueIndex("users_email_uidx").on(table.email),
  phoneIdx: uniqueIndex("users_phone_uidx").on(table.phone),
  blockedAtIdx: index("users_blocked_at_idx").on(table.blockedAt)
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
  // Канал идентификации: для e-mail-флоу заполнен email, для sms_otp — phone.
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  type: verificationTypeEnum("type").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  attempts: integer("attempts").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  emailIdx: index("verifications_email_idx").on(table.email, table.type),
  phoneIdx: index("verifications_phone_idx").on(table.phone, table.type),
  tokenIdx: uniqueIndex("verifications_code_hash_uidx").on(table.codeHash),
  identifierPresent: check(
    "verifications_identifier_present",
    sql`${table.email} is not null or ${table.phone} is not null`
  )
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

// Аудит-лог административных действий (блокировки, скрытие рецептов/изделий,
// слияния каталога). IP и User-Agent сюда НЕ пишутся сознательно: это ПДн
// (152-ФЗ), а журнал модерации в них не нуждается.
export const systemEvents = pgTable("system_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  // NULL = действие системы/CLI-скрипта, а не живого пользователя.
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  // Снапшот e-mail на момент действия: аккаунт актора мог смениться или пропасть.
  // При обезличивании актора снапшот затирается (ПДн), читаемость журнала держит
  // actor_user_id: строка users остаётся живой.
  actorEmail: varchar("actor_email", { length: 320 }),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entity_type", { length: 40 }),
  entityId: varchar("entity_id", { length: 64 }),
  summary: text("summary"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  actionCreatedAtIdx: index("system_events_action_created_at_idx").on(table.action, table.createdAt.desc()),
  entityIdx: index("system_events_entity_idx").on(table.entityType, table.entityId),
  createdAtIdx: index("system_events_created_at_idx").on(table.createdAt.desc())
}));

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
  descriptionRu: text("description_ru"),
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
  properties: jsonb("properties").$type<Record<string, unknown>>().default({}).notNull(),
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
  // Вода под фальшдном/корзиной: в затирании не участвует, но залить её надо, иначе
  // солод окажется не покрыт. В кипячение уходит целиком, поэтому это не потеря.
  mashTunDeadspaceL: doublePrecision("mash_tun_deadspace_l").default(0).notNull(),
  // Минимум воды в заторнике. У систем с ТЭНом на стенке (напр. «Бавария») ниже него
  // ТЭН оголяется и горит.
  minMashVolumeL: doublePrecision("min_mash_volume_l"),
  maxMashVolumeL: doublePrecision("max_mash_volume_l"),
  // Сколько солода физически влезает в корзину/солодовую трубу. Ограничивает не воду,
  // а засыпь: без этого пересчёт чужого плотного рецепта молча выдаёт план, который
  // не сварить — солод просто не помещается.
  maxGrainKg: doublePrecision("max_grain_kg"),
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
  // Денормализованные агрегаты рейтинга (источник — recipeRatings); пересчёт в
  // сервисной транзакции при оценке/удалении (Phase D, §3.4).
  ratingAvg: doublePrecision("rating_avg"),
  ratingCount: integer("rating_count").default(0).notNull(),
  // Байесовский скор рейтинга (IMDb-формула) — ТОЛЬКО для сортировки «По рейтингу»,
  // наружу не показывается (пользователь видит честный ratingAvg). Считается из
  // ratingAvg/ratingCount в той же транзакции; NULL при отсутствии оценок. Гасит
  // патологию «одна оценка 5.0 выше 4.8 при 120 оценках». См. features/recipes/rating-score.ts.
  ratingBayes: doublePrecision("rating_bayes"),
  // Денормализованный агрегат сохранений (источник — recipeSaves); пересчёт в
  // сервисной транзакции при сохранении/снятии. Используется для сортировки
  // «Популярные» на витрине /recipes.
  saveCount: integer("save_count").default(0).notNull(),
  // Сколько раз рецепт скопировали себе ДРУГИЕ пивовары (соц-доказательство
  // «Скопировали N раз»). Счётчик события: инкремент при копировании чужого
  // рецепта (см. cloneRecipeFromPublic), удаление копии его не уменьшает.
  // Копии своих рецептов не считаются.
  cloneCount: integer("clone_count").default(0).notNull(),
  // «Выбор редакции»: когда рецепт отмечен куратором (роль editor+). NULL = не
  // отмечен. Timestamp (а не boolean) даёт бесплатную сортировку «сначала недавно
  // отмеченные». Это КУРАТОРСКАЯ МЕТКА, а не буст ранжирования — на сортировку
  // витрины не влияет. Замена соц-доказательству на холодном старте.
  featuredAt: timestamp("featured_at", { withTimezone: true }),
  // Провенанс клона ЧУЖОГО рецепта: ссылка на исходный published-рецепт, из
  // которого пользователь сделал свою редактируемую копию (используется для
  // атрибуции «Адаптировано из …»). NULL для оригиналов и для дубликатов своих
  // рецептов. Self-FK с ON DELETE SET NULL: удаление источника не каскадит на
  // клон, лишь рвёт связь. НЕ путать с recipeFamilyId+versionNumber (версии своего).
  clonedFromRecipeId: uuid("cloned_from_recipe_id").references((): AnyPgColumn => recipes.id, { onDelete: "set null" }),
  // Скрытие модератором: рецепт пропадает с витрины, но остаётся у автора и в
  // своих партиях. Ортогонально publicationState — автор не может снять метку,
  // сняв и вернув публикацию.
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  hiddenReason: text("hidden_reason"),
  hiddenByUserId: uuid("hidden_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  authorIdIdx: index("recipes_author_id_idx").on(table.authorId),
  familyIdIdx: index("recipes_family_id_idx").on(table.recipeFamilyId),
  familyVersionIdx: uniqueIndex("recipes_family_version_uidx").on(table.recipeFamilyId, table.versionNumber),
  publicationStateIdx: index("recipes_publication_state_idx").on(table.publicationState),
  equipmentProfileIdx: index("recipes_equipment_profile_id_idx").on(table.equipmentProfileId),
  slugIdx: uniqueIndex("recipes_slug_uidx").on(table.slug),
  // Публичная витрина /recipes: фильтр по стилю/семейству (WHERE styleId IN (...))
  // и сортировки по abv/ibu/color/title/updatedAt.
  styleIdIdx: index("recipes_style_id_idx").on(table.styleId),
  abvIdx: index("recipes_abv_idx").on(table.abv),
  ibuIdx: index("recipes_ibu_idx").on(table.ibu),
  colorIdx: index("recipes_color_idx").on(table.color),
  updatedAtIdx: index("recipes_updated_at_idx").on(table.updatedAt),
  titleIdx: index("recipes_title_idx").on(table.title),
  ratingAvgIdx: index("recipes_rating_avg_idx").on(table.ratingAvg),
  ratingBayesIdx: index("recipes_rating_bayes_idx").on(table.ratingBayes),
  saveCountIdx: index("recipes_save_count_idx").on(table.saveCount),
  featuredAtIdx: index("recipes_featured_at_idx").on(table.featuredAt),
  clonedFromIdx: index("recipes_cloned_from_idx").on(table.clonedFromRecipeId),
  hiddenAtIdx: index("recipes_hidden_at_idx").on(table.hiddenAt)
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

// Оценки публичных рецептов (Phase D, §3.4): одна оценка на пользователя
// (UNIQUE recipe+user → upsert), stars 1..5 (CHECK), денормализованные агрегаты
// rating_avg/rating_count на recipes пересчитываются транзакционно в сервисе.
export const recipeRatings = pgTable("recipe_ratings", {
  id: uuid("id").defaultRandom().primaryKey(),
  recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stars: integer("stars").notNull(),
  body: text("body"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  recipeUserUidx: uniqueIndex("recipe_ratings_recipe_user_uidx").on(table.recipeId, table.userId),
  recipeIdIdx: index("recipe_ratings_recipe_id_idx").on(table.recipeId),
  starsCheck: check("recipe_ratings_stars_chk", sql`${table.stars} between 1 and 5`)
}));

// Сохранённые («Избранные») рецепты: одна запись на пользователя на рецепт
// (UNIQUE recipe+user → idempotent save). Денормализованный агрегат save_count
// на recipes пересчитывается транзакционно в сервисе.
export const recipeSaves = pgTable("recipe_saves", {
  id: uuid("id").defaultRandom().primaryKey(),
  recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  recipeUserUidx: uniqueIndex("recipe_saves_recipe_user_uidx").on(table.recipeId, table.userId),
  userIdx: index("recipe_saves_user_idx").on(table.userId, table.createdAt),
  recipeIdIdx: index("recipe_saves_recipe_idx").on(table.recipeId)
}));

// Избранные калькуляторы: одна запись на пользователя на калькулятор. slug —
// строковый идентификатор из статического каталога в коде (features/calculators),
// поэтому без FK; валидность slug проверяется в сервисе. UNIQUE user+slug делает
// добавление идемпотентным.
export const favoriteCalculators = pgTable("favorite_calculators", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  calculatorSlug: text("calculator_slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userSlugUidx: uniqueIndex("favorite_calculators_user_slug_uidx").on(table.userId, table.calculatorSlug),
  userIdx: index("favorite_calculators_user_idx").on(table.userId, table.createdAt)
}));

export const brewBatches = pgTable("brew_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Nullable + set null (не cascade): партию можно сварить из ЛЮБОГО доступного
  // рецепта (своего или чужого published) без клонирования; источник истины для
  // варочного дня — снапшоты ниже, поэтому партия переживает удаление/анпаблиш
  // исходного рецепта (recipeId → NULL, снапшот остаётся).
  recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
  status: brewBatchStatusEnum("status").default("planned").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  // Порядковый номер варки в паре (userId, recipeId), с 1; назначается при
  // создании партии и дальше не меняется (см. createBrewBatchFromRecipe).
  brewNumber: integer("brew_number").notNull(),
  brewPlanSnapshot: jsonb("brew_plan_snapshot").$type<Record<string, unknown>>().default({}).notNull(),
  recipeSnapshot: jsonb("recipe_snapshot").$type<Record<string, unknown>>(),
  equipmentProfileSnapshot: jsonb("equipment_profile_snapshot").$type<Record<string, unknown>>(),
  waterPlanSnapshot: jsonb("water_plan_snapshot").$type<Record<string, unknown>>(),
  // Унаследованные подсказки по устройству (back-compat); реальная привязка — deviceId ниже.
  deviceHints: jsonb("device_hints").$type<Record<string, unknown>[]>().default([]).notNull(),
  // Привязка партии к подключённому контроллеру (BrewForge и т.п.). NULL — варка без устройства.
  deviceId: uuid("device_id").references((): AnyPgColumn => brewDevices.id, { onDelete: "set null" }),
  // Прогресс виртуального «гида варочного дня» (device_id = NULL): отметки «шаг
  // выполнен» и старты таймеров, индексированные стабильным id шага из плана.
  // Мутабельное состояние варки (в отличие от иммутабельного brew_plan_snapshot).
  brewDayProgress: jsonb("brew_day_progress").$type<Record<string, unknown>>().default({}).notNull(),
  // Заметки о варке: ведутся с подготовки и до конца, живут на всех этапах.
  notes: text("notes"),
  // Дегустация: пишется, когда пиво готово (акт «Итог»). Отдельная колонка, а не
  // переиспользование notes — иначе дегустация затирает журнал варочного дня.
  tastingNotes: text("tasting_notes"),
  plannedFor: timestamp("planned_for", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  // Ключ идемпотентности создания партии: генерируется клиентом один раз на
  // «намерение сварить» (открытие диалога «Сварить»). Повторный сабмит того же
  // намерения (двойной клик, ретрай, гонка вкладок) ловит ON CONFLICT и
  // возвращает УЖЕ созданную партию, а не плодит дубли. NULL — намеренно
  // допускаем много (dev-скрипты, старые записи, каллеры без ключа): в Postgres
  // NULL в unique-индексе не конфликтует, поэтому осознанная повторная варка
  // (новое открытие диалога → новый ключ) по-прежнему создаёт отдельную партию.
  idempotencyKey: uuid("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userIdIdx: index("brew_batches_user_id_idx").on(table.userId),
  recipeIdIdx: index("brew_batches_recipe_id_idx").on(table.recipeId),
  statusIdx: index("brew_batches_status_idx").on(table.status),
  deviceIdIdx: index("brew_batches_device_id_idx").on(table.deviceId),
  userIdempotencyUidx: uniqueIndex("brew_batches_user_idempotency_uidx").on(table.userId, table.idempotencyKey)
}));

// Ручной журнал замеров плотности варки: показания ареометра/рефрактометра по
// ходу брожения (в SG). OG = самый ранний замер; FG отмечается явно флагом
// isFinal (не «самый поздний»: во время брожения замеров много, а итоговый один).
// ABV и степень сбраживания считаются на лету (см. features/brew-batches).
// Инвариант «один финальный замер на партию» держит сервис. Отдельно от
// brew_telemetry, которое только про устройство.
export const brewMeasurements = pgTable("brew_measurements", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  brewBatchId: uuid("brew_batch_id").notNull().references(() => brewBatches.id, { onDelete: "cascade" }),
  gravitySg: doublePrecision("gravity_sg").notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }).defaultNow().notNull(),
  isFinal: boolean("is_final").default(false).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  batchTakenIdx: index("brew_measurements_batch_taken_idx").on(table.brewBatchId, table.takenAt),
  userIdx: index("brew_measurements_user_idx").on(table.userId)
}));

export const recipeInventoryAllocations = pgTable("recipe_inventory_allocations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  recipeIngredientId: uuid("recipe_ingredient_id").notNull().references(() => recipeIngredients.id, { onDelete: "cascade" }),
  recipeIngredientPersistentKey: uuid("recipe_ingredient_persistent_key").notNull(),
  inventoryItemId: uuid("inventory_item_id").notNull().references(() => userIngredients.id, { onDelete: "restrict" }),
  status: recipeInventoryAllocationStatusEnum("status").default("allocated").notNull(),
  // Партия-потребитель consumed-аллокации: списание на варку (brew-batches/
  // inventory.ts) привязывает сюда brewBatchId, чтобы завершение/отмена ОДНОЙ
  // партии не блокировало навсегда повторную варку того же рецепта другой
  // партией (см. docs/brew-day-assistant-audit-round2.md, П2). NULL — списание
  // вне партии (из редактора рецепта) или легаси-запись до этой миграции;
  // консервативно продолжает блокировать реюз рецепта.
  brewBatchId: uuid("brew_batch_id").references(() => brewBatches.id, { onDelete: "set null" }),
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
  statusIdx: index("recipe_inventory_allocations_status_idx").on(table.status),
  brewBatchIdIdx: index("recipe_inventory_allocations_brew_batch_id_idx").on(table.brewBatchId)
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

// =============================================================================
//  BrewForge: подключённые контроллеры варки (Phase 3 — devices/telemetry/cmd).
// =============================================================================

// Зарегистрированное устройство (контроллер BrewForge). tokenHash — хэш
// per-device bearer-токена (паттерн как у sessions.token_hash; используется для
// СВЕРКИ, когда устройство/мост предъявляет токен порталу). tokenEncrypted —
// пакет 4-B (P4): тот же токен, но ОБРАТИМО зашифрованный (AES-256-GCM,
// lib/device-token-crypto.ts) — нужен, чтобы портал МОГ САМ предъявить токен
// устройству как Authorization: Bearer при LAN-запросах (resolveDeviceToken);
// hashToken для этого непригоден (односторонний). NULL, если ключ шифрования
// (BREWFORGE_DEVICE_TOKEN_ENC_KEY) не был настроен на момент claimDevice — тогда
// resolveDeviceToken откатывается на env-фолбэк. hardwareId — заводской id
// 'bf-xxxx' (глобально уникален).
export const brewDevices = pgTable("brew_devices", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  providerId: text("provider_id").default("brewforge").notNull(),
  name: text("name").notNull(),
  hardwareId: text("hardware_id").notNull(),
  tokenHash: text("token_hash"),
  tokenEncrypted: text("token_encrypted"),
  fw: text("fw"),
  // Последняя версия прошивки, о доступности которой владельцу уже отправлен
  // web-push (дедуп уведомлений моста, F3 docs/brewforge-firmware-releases.md §6).
  updateNotifiedFw: text("update_notified_fw"),
  capabilities: jsonb("capabilities").$type<string[]>().default([]).notNull(),
  status: brewDeviceStatusEnum("status").default("unknown").notNull(),
  localUrl: text("local_url"),
  mqttPrefix: text("mqtt_prefix"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userIdIdx: index("brew_devices_user_id_idx").on(table.userId),
  hardwareIdIdx: uniqueIndex("brew_devices_hardware_id_uidx").on(table.hardwareId),
  tokenHashIdx: uniqueIndex("brew_devices_token_hash_uidx").on(table.tokenHash)
}));

// Web-push подписки браузеров пользователя (Phase 6). Подписка — на ПОЛЬЗОВАТЕЛЯ
// (владелец получает пуши по всем своим пивоварням: промпты «засыпь/промывка» и
// аварии, когда вкладка свёрнута / телефон вне дома). Отправляет always-on мост.
// endpoint (URL push-сервиса) уникален на браузер → upsert по нему; мёртвые
// подписки (404/410) сервис отправки вычищает.
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  failureCount: integer("failure_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  endpointIdx: uniqueIndex("push_subscriptions_endpoint_uidx").on(table.endpoint),
  userIdIdx: index("push_subscriptions_user_id_idx").on(table.userId)
}));

// Одноразовый код привязки (показывается на LCD/в AP устройства). Пользователь
// сдаёт claimCode → сервис связывает устройство с юзером и выдаёт bearer-токен.
// claimCode уникален среди активных (непогашенных) записей.
export const devicePairingTokens = pgTable("device_pairing_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  claimCode: text("claim_code").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  hardwareId: text("hardware_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  claimCodeActiveIdx: uniqueIndex("device_pairing_tokens_claim_code_active_uidx")
    .on(table.claimCode)
    .where(sql`${table.consumedAt} is null`),
  hardwareIdIdx: index("device_pairing_tokens_hardware_id_idx").on(table.hardwareId)
}));

// Time-series телеметрии (распакованные «горячие» поля + полный снимок Telemetry
// в payload). Держим узкой: индексы по (deviceId, ts) и (brewBatchId, ts).
export const brewTelemetry = pgTable("brew_telemetry", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  deviceId: uuid("device_id").notNull().references(() => brewDevices.id, { onDelete: "cascade" }),
  brewBatchId: uuid("brew_batch_id").references(() => brewBatches.id, { onDelete: "set null" }),
  ts: timestamp("ts", { withTimezone: true }).notNull(),
  seq: integer("seq").notNull(),
  stage: integer("stage"),
  primaryC: real("primary_c"),
  setpointC: real("setpoint_c"),
  heatDutyPct: integer("heat_duty_pct"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull()
}, (table) => ({
  deviceTsIdx: index("brew_telemetry_device_ts_idx").on(table.deviceId, table.ts),
  batchTsIdx: index("brew_telemetry_batch_ts_idx").on(table.brewBatchId, table.ts),
  // Дедуп дублей из конкурентных SSE-стримов/моста. Скоуп по (deviceId,
  // brewBatchId, seq): seq устройства монотонен лишь в пределах одной загрузки и
  // сбрасывается при ребуте, поэтому БЕЗ brewBatchId ранние кадры новой партии
  // (seq 1,2,3…) коллизировали бы со строками прошлой варки и терялись. brewBatchId
  // nullable — это ок: Postgres считает NULL различными, непривязанная телеметрия
  // просто не дедупится. Оба инсёртера используют onConflictDoNothing по этому таргету.
  deviceBatchSeqUidx: uniqueIndex("brew_telemetry_device_batch_seq_uidx").on(table.deviceId, table.brewBatchId, table.seq)
}));

// События брю-лога устройства (стадии, промпты, интерлоки и т.п.).
export const brewLogEvents = pgTable("brew_log_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  deviceId: uuid("device_id").notNull().references(() => brewDevices.id, { onDelete: "cascade" }),
  brewBatchId: uuid("brew_batch_id").references(() => brewBatches.id, { onDelete: "set null" }),
  ts: timestamp("ts", { withTimezone: true }).notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  deviceTsIdx: index("brew_log_events_device_ts_idx").on(table.deviceId, table.ts),
  batchTsIdx: index("brew_log_events_batch_ts_idx").on(table.brewBatchId, table.ts)
}));

// Пакет 4-B (P3) — реестр УЖЕ ДОГРУЖЕННЫХ офлайн-журналов варки (bf_log.c,
// GET /log[?name=] на устройстве). Один журнал = один файл .jsonl = одна варка.
// Идемпотентность синхронизации: (deviceId, name) уникальны; sizeBytes хранится,
// чтобы отличить «уже полностью догружен» (тот же размер — файл закрыт, варка
// завершилась) от «файл ещё растёт» (варка идёт, размер вырос с прошлой
// синхронизации — файл дочитывается заново; строки внутри дедуплицируются
// детерминированными id при вставке в brew_telemetry/brew_log_events, см.
// features/devices/log-sync.ts). samples/eventsImported — для диагностики UI
// («догружено N точек»), не участвуют в решении «скипнуть файл».
export const deviceLogFiles = pgTable("device_log_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  deviceId: uuid("device_id").notNull().references(() => brewDevices.id, { onDelete: "cascade" }),
  brewBatchId: uuid("brew_batch_id").references(() => brewBatches.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  samplesImported: integer("samples_imported").default(0).notNull(),
  eventsImported: integer("events_imported").default(0).notNull(),
  malformedLines: integer("malformed_lines").default(0).notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  deviceNameUidx: uniqueIndex("device_log_files_device_name_uidx").on(table.deviceId, table.name),
  deviceIdx: index("device_log_files_device_idx").on(table.deviceId)
}));

// Аудит команд портал→устройство. reason — причина ack/nack (AckReason).
export const deviceCommands = pgTable("device_commands", {
  id: uuid("id").defaultRandom().primaryKey(),
  deviceId: uuid("device_id").notNull().references(() => brewDevices.id, { onDelete: "cascade" }),
  brewBatchId: uuid("brew_batch_id").references(() => brewBatches.id, { onDelete: "set null" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  arg: jsonb("arg").$type<Record<string, unknown>>(),
  status: deviceCommandStatusEnum("status").default("queued").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  ackedAt: timestamp("acked_at", { withTimezone: true })
}, (table) => ({
  deviceCreatedIdx: index("device_commands_device_created_idx").on(table.deviceId, table.createdAt),
  batchIdx: index("device_commands_batch_idx").on(table.brewBatchId),
  userIdIdx: index("device_commands_user_id_idx").on(table.userId),
  statusIdx: index("device_commands_status_idx").on(table.status)
}));

// Бэкап/пресет настраиваемого конфига §6.3 (Phase 4.3 — облачное резервирование
// настроек устройства). config — снимок DeviceConfig (несекретный, как отдаёт
// /config). deviceId NULL = пресет «вообще» (не привязан к конкретному прибору).
// БЕЗОПАСНЫЙ КЛАМПИНГ всё равно происходит на устройстве при применении.
export const deviceProfiles = pgTable("device_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").references(() => brewDevices.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userIdIdx: index("device_profiles_user_id_idx").on(table.userId),
  deviceIdIdx: index("device_profiles_device_id_idx").on(table.deviceId)
}));

// Single-writer control-lease: одно активное УПРАВЛЯЮЩЕЕ соединение на устройство
// (Phase 2). deviceId — первичный ключ (ровно одна аренда на устройство). Держатель
// = (holderUserId, holderSessionId): sessionId различает вкладки/приборы ОДНОГО юзера
// (телефон vs планшет), закрывая last-write-wins. Аренда валидна, пока expiresAt >
// now; тот же heartbeat, что продлевает её, кормит firmware dead-man (Phase 3/6).
// takeoverBy* — «Запросить перехват»: кооперативная передача (держатель видит запрос
// и отдаёт; если оффлайн — аренда истекает по TTL и запросивший берёт сам).
export const deviceControlLeases = pgTable("device_control_leases", {
  deviceId: uuid("device_id").primaryKey().references(() => brewDevices.id, { onDelete: "cascade" }),
  holderUserId: uuid("holder_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  holderSessionId: text("holder_session_id").notNull(),
  acquiredAt: timestamp("acquired_at", { withTimezone: true }).defaultNow().notNull(),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  takeoverByUserId: uuid("takeover_by_user_id").references(() => users.id, { onDelete: "set null" }),
  takeoverBySessionId: text("takeover_by_session_id"),
  takeoverAt: timestamp("takeover_at", { withTimezone: true })
}, (table) => ({
  holderUserIdIdx: index("device_control_leases_holder_user_id_idx").on(table.holderUserId)
}));

// Привязка слота устройства к исходному рецепту nb (Phase 4 — рецепты «на борту»).
// Реализует решение дизайна «слот↔recipeId» (двусторонний обмен через привязку, а
// НЕ реверс-маппинг DeviceRecipe→каталог, который беднее модели nb). Одна привязка
// на (deviceId, slot). recipeId — источник (ON DELETE SET NULL: если рецепт удалён,
// привязка осиротеет, но recipeName сохранит человекочитаемое имя пуша). recipeName
// денормализован на момент записи — переживает удаление/переименование рецепта.
export const deviceRecipeSlots = pgTable("device_recipe_slots", {
  id: uuid("id").defaultRandom().primaryKey(),
  deviceId: uuid("device_id").notNull().references(() => brewDevices.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  slot: integer("slot").notNull(),
  recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
  recipeName: text("recipe_name").notNull(),
  pushedAt: timestamp("pushed_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  deviceSlotUidx: uniqueIndex("device_recipe_slots_device_slot_uidx").on(table.deviceId, table.slot),
  deviceIdIdx: index("device_recipe_slots_device_id_idx").on(table.deviceId),
  recipeIdIdx: index("device_recipe_slots_recipe_id_idx").on(table.recipeId)
}));

// Реестр релизов прошивки BrewForge (F2, docs/brewforge-firmware-releases.md §3).
// Бинарники лежат на диске (FIRMWARE_STORAGE_DIR, дефолт <repo>/storage/firmware);
// storagePath — путь файла ОТНОСИТЕЛЬНО этого корня. publishedAt NULL = черновик,
// не раздаётся; yankedAt — отзыв битого релиза (раздача прекращается, запись и
// файл остаются для аудита). Повторная публикация той же (providerId, version)
// запрещена uniq-индексом — защита от подмены бинарника под тем же номером.
export const firmwareReleases = pgTable("firmware_releases", {
  id: uuid("id").defaultRandom().primaryKey(),
  providerId: text("provider_id").default("brewforge").notNull(),
  version: text("version").notNull(),
  channel: firmwareChannelEnum("channel").default("stable").notNull(),
  protocolSchema: integer("protocol_schema").notNull(),
  notes: text("notes").default("").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  fileSha256: text("file_sha256").notNull(),
  storagePath: text("storage_path").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  yankedAt: timestamp("yanked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  providerVersionUidx: uniqueIndex("firmware_releases_provider_version_uidx").on(table.providerId, table.version),
  channelIdx: index("firmware_releases_channel_idx").on(table.providerId, table.channel)
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
  inventoryTransactions: many(inventoryTransactions),
  brewDevices: many(brewDevices),
  devicePairingTokens: many(devicePairingTokens),
  deviceCommands: many(deviceCommands),
  deviceProfiles: many(deviceProfiles)
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
  ratings: many(recipeRatings),
  saves: many(recipeSaves),
  brewBatches: many(brewBatches),
  inventoryAllocations: many(recipeInventoryAllocations),
  inventoryTransactions: many(inventoryTransactions)
}));

export const recipeRatingsRelations = relations(recipeRatings, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeRatings.recipeId],
    references: [recipes.id]
  }),
  user: one(users, {
    fields: [recipeRatings.userId],
    references: [users.id]
  })
}));

export const recipeSavesRelations = relations(recipeSaves, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeSaves.recipeId],
    references: [recipes.id]
  }),
  user: one(users, {
    fields: [recipeSaves.userId],
    references: [users.id]
  })
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
  device: one(brewDevices, {
    fields: [brewBatches.deviceId],
    references: [brewDevices.id]
  }),
  inventoryTransactions: many(inventoryTransactions),
  telemetry: many(brewTelemetry),
  logEvents: many(brewLogEvents),
  commands: many(deviceCommands),
  measurements: many(brewMeasurements)
}));

export const brewMeasurementsRelations = relations(brewMeasurements, ({ one }) => ({
  user: one(users, {
    fields: [brewMeasurements.userId],
    references: [users.id]
  }),
  brewBatch: one(brewBatches, {
    fields: [brewMeasurements.brewBatchId],
    references: [brewBatches.id]
  })
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

export const brewDevicesRelations = relations(brewDevices, ({ one, many }) => ({
  user: one(users, {
    fields: [brewDevices.userId],
    references: [users.id]
  }),
  brewBatches: many(brewBatches),
  telemetry: many(brewTelemetry),
  logEvents: many(brewLogEvents),
  commands: many(deviceCommands),
  profiles: many(deviceProfiles),
  controlLease: one(deviceControlLeases),
  recipeSlots: many(deviceRecipeSlots),
  logFiles: many(deviceLogFiles)
}));

export const deviceControlLeasesRelations = relations(deviceControlLeases, ({ one }) => ({
  device: one(brewDevices, {
    fields: [deviceControlLeases.deviceId],
    references: [brewDevices.id]
  }),
  holder: one(users, {
    fields: [deviceControlLeases.holderUserId],
    references: [users.id]
  })
}));

export const deviceRecipeSlotsRelations = relations(deviceRecipeSlots, ({ one }) => ({
  device: one(brewDevices, {
    fields: [deviceRecipeSlots.deviceId],
    references: [brewDevices.id]
  }),
  user: one(users, {
    fields: [deviceRecipeSlots.userId],
    references: [users.id]
  }),
  recipe: one(recipes, {
    fields: [deviceRecipeSlots.recipeId],
    references: [recipes.id]
  })
}));

export const deviceProfilesRelations = relations(deviceProfiles, ({ one }) => ({
  user: one(users, {
    fields: [deviceProfiles.userId],
    references: [users.id]
  }),
  device: one(brewDevices, {
    fields: [deviceProfiles.deviceId],
    references: [brewDevices.id]
  })
}));

export const devicePairingTokensRelations = relations(devicePairingTokens, ({ one }) => ({
  user: one(users, {
    fields: [devicePairingTokens.userId],
    references: [users.id]
  })
}));

export const brewTelemetryRelations = relations(brewTelemetry, ({ one }) => ({
  device: one(brewDevices, {
    fields: [brewTelemetry.deviceId],
    references: [brewDevices.id]
  }),
  brewBatch: one(brewBatches, {
    fields: [brewTelemetry.brewBatchId],
    references: [brewBatches.id]
  })
}));

export const brewLogEventsRelations = relations(brewLogEvents, ({ one }) => ({
  device: one(brewDevices, {
    fields: [brewLogEvents.deviceId],
    references: [brewDevices.id]
  }),
  brewBatch: one(brewBatches, {
    fields: [brewLogEvents.brewBatchId],
    references: [brewBatches.id]
  })
}));

export const deviceLogFilesRelations = relations(deviceLogFiles, ({ one }) => ({
  device: one(brewDevices, {
    fields: [deviceLogFiles.deviceId],
    references: [brewDevices.id]
  }),
  brewBatch: one(brewBatches, {
    fields: [deviceLogFiles.brewBatchId],
    references: [brewBatches.id]
  })
}));

export const deviceCommandsRelations = relations(deviceCommands, ({ one }) => ({
  device: one(brewDevices, {
    fields: [deviceCommands.deviceId],
    references: [brewDevices.id]
  }),
  brewBatch: one(brewBatches, {
    fields: [deviceCommands.brewBatchId],
    references: [brewBatches.id]
  }),
  user: one(users, {
    fields: [deviceCommands.userId],
    references: [users.id]
  })
}));

// =============================================================================
//  Контент-CMS (Track A): редакторские статьи/гайды/обзоры в БД.
//  BJCP-стили остаются file-backed (@nb/content) и в эту таблицу НЕ пишутся.
//  Тело свободных статей — Tiptap JSON (bodyJson); специфика обзоров — metaJson.
// =============================================================================
export const contentArticles = pgTable("content_articles", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: contentArticleTypeEnum("type").default("guide").notNull(),
  status: contentArticleStatusEnum("status").default("draft").notNull(),
  slug: varchar("slug", { length: 220 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  excerpt: text("excerpt"),
  // Tiptap ProseMirror JSON (см. components/content/rich-text-editor.tsx).
  bodyJson: jsonb("body_json").$type<Record<string, unknown> | null>(),
  // Структурированные поля под тип (обзор: pros/cons/verdict/specs/rating и т.п.).
  metaJson: jsonb("meta_json").$type<Record<string, unknown>>().default({}).notNull(),
  coverImageKey: text("cover_image_key"),
  coverImageUrl: text("cover_image_url"),
  seoTitle: varchar("seo_title", { length: 255 }),
  seoDescription: text("seo_description"),
  readingMinutes: integer("reading_minutes").default(1).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  // SET NULL (как reviewerId и catalog created_by): удаление автора НЕ должно
  // стирать опубликованный контент. Редакционные статьи переживают автора.
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  slugUidx: uniqueIndex("content_articles_slug_uidx").on(table.slug),
  statusPublishedIdx: index("content_articles_status_published_idx").on(table.status, table.publishedAt),
  authorIdx: index("content_articles_author_idx").on(table.authorId),
  featuredIdx: index("content_articles_featured_idx").on(table.isFeatured, table.publishedAt),
  typeIdx: index("content_articles_type_idx").on(table.type)
}));

export const contentArticlesRelations = relations(contentArticles, ({ one }) => ({
  author: one(users, {
    fields: [contentArticles.authorId],
    references: [users.id]
  }),
  reviewer: one(users, {
    fields: [contentArticles.reviewerId],
    references: [users.id]
  })
}));

// Обратная связь по контенту: пользователь (или аноним) сообщает о неточности,
// предлагает улучшение или репортит ошибку. Очередь модерации — по образцу
// proposedIngredients (submit → resolve модератором).
export const feedbackKindEnum = pgEnum("feedback_kind", ["inaccuracy", "improvement", "bug", "question"]);
export const feedbackStatusEnum = pgEnum("feedback_status", ["new", "in_progress", "resolved", "dismissed"]);

export const feedback = pgTable("feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  // SET NULL: удаление автора не должно стирать полезный сигнал.
  submittedByUserId: uuid("submitted_by_user_id").references(() => users.id, { onDelete: "set null" }),
  kind: feedbackKindEnum("kind").notNull(),
  message: text("message").notNull(),
  // Только для анонимов — чтобы можно было ответить.
  contactEmail: varchar("contact_email", { length: 320 }),
  // Страница, с которой пришло сообщение: полный URL и pathname для группировки.
  pageUrl: text("page_url"),
  pagePath: varchar("page_path", { length: 512 }),
  // Контекст страницы: entityType/entityId, referrer, viewport, userAgent, zone.
  context: jsonb("context").$type<Record<string, unknown>>().default({}).notNull(),
  status: feedbackStatusEnum("status").default("new").notNull(),
  moderatorId: uuid("moderator_id").references(() => users.id, { onDelete: "set null" }),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  statusCreatedIdx: index("feedback_status_created_idx").on(table.status, table.createdAt),
  submitterIdx: index("feedback_submitter_idx").on(table.submittedByUserId),
  pagePathIdx: index("feedback_page_path_idx").on(table.pagePath)
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  submitter: one(users, {
    fields: [feedback.submittedByUserId],
    references: [users.id]
  }),
  moderator: one(users, {
    fields: [feedback.moderatorId],
    references: [users.id]
  })
}));

// Витрина мастеров: profiles (черновик + опубликованный снапшот) → items
// (изделия) → images (общая галерея работ + фото изделий). См. docs/masters-showcase.md.
export const masterProfiles = pgTable("master_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Cascade: удалил аккаунт — витрина исчезла (корректно и по ПДн).
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Nullable до первого approve: слаг генерится из displayName при первой
  // публикации транслит-утилитой и дальше остаётся стабильным.
  slug: varchar("slug", { length: 220 }),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  city: varchar("city", { length: 120 }).notNull(),
  // Ключи из MASTER_SPECIALIZATIONS (features/masters/contracts.ts), не pgEnum —
  // чтобы добавление специализации не требовало миграции.
  specializations: text("specializations").array().notNull().default([]),
  summary: varchar("summary", { length: 200 }).default("").notNull(),
  about: text("about").default("").notNull(),
  contactTelegram: varchar("contact_telegram", { length: 200 }),
  contactPhone: varchar("contact_phone", { length: 200 }),
  contactEmail: varchar("contact_email", { length: 200 }),
  contactWebsite: varchar("contact_website", { length: 200 }),
  craftSince: smallint("craft_since"),
  reviewStatus: masterReviewStatusEnum("review_status").default("draft").notNull(),
  isListed: boolean("is_listed").default(true).notNull(),
  // Денормализованный снапшот последней одобренной версии (профиль + изделия +
  // упорядоченные ссылки на фото). Публичные страницы читают ТОЛЬКО отсюда —
  // черновые таблицы ниже видит только владелец/модератор. Тип не завязываем на
  // apps/web (packages/db не должен знать про feature-слой) — типизация
  // MasterPublishedSnapshot живёт в apps/web/features/masters/contracts.ts и
  // применяется на уровне сервиса, как и у остальных jsonb-полей в этом файле.
  publishedJson: jsonb("published_json").$type<Record<string, unknown>>(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  moderatorId: uuid("moderator_id").references(() => users.id, { onDelete: "set null" }),
  moderationNote: text("moderation_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userIdUidx: uniqueIndex("master_profiles_user_id_uidx").on(table.userId),
  slugUidx: uniqueIndex("master_profiles_slug_uidx").on(table.slug),
  reviewQueueIdx: index("master_profiles_review_status_submitted_at_idx").on(table.reviewStatus, table.submittedAt)
}));

export const masterItems = pgTable("master_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => masterProfiles.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 160 }).notNull(),
  description: text("description").default("").notNull(),
  priceNote: varchar("price_note", { length: 80 }),
  // Без .references(): как recipes.heroImageId ↔ recipe_images — masterImages
  // объявлена ниже и ссылается на masterItems, циклический FK не заводим.
  coverImageId: uuid("cover_image_id"),
  sortOrder: integer("sort_order").default(0).notNull(),
  // Точечное скрытие модератором: снять одно изделие с витрины, не отправляя
  // весь профиль обратно на модерацию.
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  hiddenReason: text("hidden_reason"),
  hiddenByUserId: uuid("hidden_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  profileSortOrderIdx: index("master_items_profile_id_sort_order_idx").on(table.profileId, table.sortOrder),
  hiddenAtIdx: index("master_items_hidden_at_idx").on(table.hiddenAt)
}));

// По образцу recipe_images (storage-варианты original/large/medium/thumb,
// статус аплоада, soft-delete), плюс профиль/изделие-владелец и sortOrder.
export const masterImages = pgTable("master_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => masterProfiles.id, { onDelete: "cascade" }),
  // null = общая галерея работ; иначе фото конкретного изделия. При удалении
  // изделия сервис отвязывает фото (itemId → null), а не удаляет их.
  itemId: uuid("item_id").references(() => masterItems.id, { onDelete: "set null" }),
  storageKeyOriginal: text("storage_key_original"),
  storageKeyLarge: text("storage_key_large"),
  storageKeyMedium: text("storage_key_medium"),
  storageKeyThumb: text("storage_key_thumb"),
  width: integer("width"),
  height: integer("height"),
  mimeType: varchar("mime_type", { length: 128 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  blurDataUrl: text("blur_data_url"),
  sortOrder: integer("sort_order").default(0).notNull(),
  status: masterImageStatusEnum("status").default("uploading").notNull(),
  // Скрытие модератором — отдельно от deletedAt (soft-delete владельцем):
  // владелец не должен «расскрывать» фото, удалив и загрузив его заново.
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  hiddenReason: text("hidden_reason"),
  hiddenByUserId: uuid("hidden_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
}, (table) => ({
  profileIdIdx: index("master_images_profile_id_idx").on(table.profileId),
  itemIdIdx: index("master_images_item_id_idx").on(table.itemId),
  hiddenAtIdx: index("master_images_hidden_at_idx").on(table.hiddenAt)
}));

export const masterProfilesRelations = relations(masterProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [masterProfiles.userId],
    references: [users.id]
  }),
  moderator: one(users, {
    fields: [masterProfiles.moderatorId],
    references: [users.id]
  }),
  items: many(masterItems),
  images: many(masterImages)
}));

export const masterItemsRelations = relations(masterItems, ({ one, many }) => ({
  profile: one(masterProfiles, {
    fields: [masterItems.profileId],
    references: [masterProfiles.id]
  }),
  images: many(masterImages)
}));

export const masterImagesRelations = relations(masterImages, ({ one }) => ({
  profile: one(masterProfiles, {
    fields: [masterImages.profileId],
    references: [masterProfiles.id]
  }),
  item: one(masterItems, {
    fields: [masterImages.itemId],
    references: [masterItems.id]
  })
}));
