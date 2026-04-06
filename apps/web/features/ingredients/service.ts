import { randomUUID } from "node:crypto";

import {
  and,
  db,
  eq,
  ingredientAliases,
  ingredientPackageVariants,
  ingredients,
  ingredientSources,
  inArray,
  proposedIngredients,
  recipeIngredients,
  sql,
  userIngredients
} from "@nb/db";
import { z } from "zod";

import {
  ingredientSearchQuerySchema,
  ingredientUpsertSchema,
  moderationActionSchema,
  resolveUpsertCompletenessLevel,
  type IngredientAliasDto,
  type IngredientCatalogItemDto,
  type IngredientPackageVariantDto,
  type IngredientProposalDto,
  type IngredientSourceDto,
  type IngredientSuggestionItem,
  type IngredientType
} from "./contracts";
import { normalizeSearchText } from "./normalization";
import {
  buildIngredientTypedSummary,
  resolveIngredientDisplayNames,
  resolveIngredientPrimaryDisplayName
} from "./presentation";
import { rankIngredientCandidate } from "./ranking";
import { extractIngredientTechnicalData, extractIngredientTechnicalFields } from "./technical-fields";
import {
  resolveIngredientCategory,
  resolveIngredientSubtype,
  type IngredientCategory,
  type IngredientSubtype
} from "./taxonomy";
import { resolveHumanFacingInventoryUnitProfile } from "../inventory/units";

type SearchParams = { q: string; type?: string; category?: string; limit?: number };
type CatalogListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  type?: string;
  category?: string;
  status?: "draft" | "active" | "archived" | "merged";
  sort?: string;
};

type IngredientWithRelations = typeof ingredients.$inferSelect & {
  aliases: typeof ingredientAliases.$inferSelect[];
  sources: typeof ingredientSources.$inferSelect[];
  packageVariants: typeof ingredientPackageVariants.$inferSelect[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeAlias = (value: string) => normalizeSearchText(
  value.replace(/[‐‑‒–—―]/g, "-")
);

const buildCatalogStatus = (item: typeof ingredients.$inferSelect) => {
  const attributes = isRecord(item.attributes) ? item.attributes : {};
  if (attributes._catalog_status === "merged") {
    return "merged" as const;
  }

  if (attributes._catalog_status === "draft") {
    return "draft" as const;
  }

  return item.isActive ? "active" as const : "archived" as const;
};

const mapAliasRow = (row: typeof ingredientAliases.$inferSelect): IngredientAliasDto => ({
  id: row.id,
  locale: row.locale as IngredientAliasDto["locale"],
  alias: row.alias,
  aliasNormalized: row.aliasNormalized,
  source: row.source,
  isEnabled: row.isEnabled
});

const mapSourceRow = (row: typeof ingredientSources.$inferSelect): IngredientSourceDto => ({
  id: row.id,
  kind: row.kind,
  label: row.label,
  url: row.url,
  sourceBasis: row.sourceBasis,
  position: row.position
});

const mapPackageVariantRow = (row: typeof ingredientPackageVariants.$inferSelect): IngredientPackageVariantDto => ({
  id: row.id,
  brand: row.brand,
  productNameEn: row.productNameEn,
  productNameRu: row.productNameRu,
  countryNameRu: row.countryNameRu,
  packageAmount: row.packageAmount,
  packageUnit: row.packageUnit,
  stockContentAmount: row.stockContentAmount,
  stockContentUnit: row.stockContentUnit,
  sourceGroup: row.sourceGroup,
  sourceUrl: row.sourceUrl,
  isDefaultForStock: row.isDefaultForStock,
  position: row.position
});

const mapIngredientRow = (row: IngredientWithRelations): IngredientCatalogItemDto => {
  const technicalData = extractIngredientTechnicalData({
    type: row.type,
    attributes: row.attributes
  });
  const type = row.type as IngredientType;
  const category = resolveIngredientCategory({ type });
  const subtype = resolveIngredientSubtype({ type, subtype: row.itemKind }) as IngredientSubtype | null;
  const unitPreferred = technicalData?.type === "water_treatment" && typeof technicalData.unitPreferred === "string"
    ? technicalData.unitPreferred
    : null;
  const unitProfile = resolveHumanFacingInventoryUnitProfile({
    type,
    category,
    subtype,
    technicalData,
    quantityDefaults: isRecord(row.quantityDefaults) ? row.quantityDefaults : null,
    unitPreferred
  });
  const aliases = row.aliases
    .slice()
    .sort((left, right) => left.alias.localeCompare(right.alias, "ru"))
    .map(mapAliasRow);
  const sources = row.sources
    .slice()
    .sort((left, right) => left.position - right.position)
    .map(mapSourceRow);
  const packageVariants = row.packageVariants
    .slice()
    .sort((left, right) => left.position - right.position)
    .map(mapPackageVariantRow);
  const { primaryName, secondaryName } = resolveIngredientDisplayNames({
    type,
    countryCode: row.countryCode,
    countryName: row.countryName,
    nameRu: row.nameRu,
    nameEn: row.nameEn,
    displayModeRu: row.displayModeRu as "auto" | "localized_first" | "source_first",
    displayNameOverrideRu: row.displayNameOverrideRu,
    secondaryNameOverrideRu: row.secondaryNameOverrideRu,
    hideSecondaryNameRu: row.hideSecondaryNameRu
  });
  const status = buildCatalogStatus(row);
  const mergedIntoId = isRecord(row.attributes) && typeof row.attributes._merged_into_id === "string"
    ? row.attributes._merged_into_id
    : null;

  return {
    id: row.id,
    type,
    category,
    subtype,
    familyId: null,
    family: null,
    primaryLabelRu: primaryName,
    secondaryLabelRu: secondaryName ?? null,
    displayName: primaryName,
    displayNameRu: row.nameRu,
    displayNameEn: row.nameEn,
    nameRu: row.nameRu,
    nameEn: row.nameEn,
    displayModeRu: row.displayModeRu as "auto" | "localized_first" | "source_first",
    displayNameOverrideRu: row.displayNameOverrideRu,
    secondaryNameOverrideRu: row.secondaryNameOverrideRu,
    hideSecondaryNameRu: row.hideSecondaryNameRu,
    brand: row.brand,
    producer: row.producer,
    brandName: row.brand,
    manufacturer: row.producer,
    country: row.countryName,
    countryCode: row.countryCode,
    countryName: row.countryName,
    productCode: row.productCode,
    groupName: row.groupName,
    sourceCategory: row.category,
    subcategory: row.subcategory,
    itemKind: row.itemKind,
    presentOnBirrf: row.presentOnBirrf,
    isActive: row.isActive,
    inventoryEnabled: row.inventoryEnabled,
    attributes: isRecord(row.attributes) ? row.attributes : {},
    technicalData,
    aliases,
    sources,
    packageVariants,
    quantityDefaults: isRecord(row.quantityDefaults) ? row.quantityDefaults : null,
    unitPreferred,
    defaultUnit: unitProfile.defaultUnit,
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: unitProfile.measurementDimension,
    completenessLevel: resolveUpsertCompletenessLevel({
      type,
      category,
      itemKind: row.itemKind,
      nameRu: row.nameRu,
      nameEn: row.nameEn,
      displayModeRu: row.displayModeRu as "auto" | "localized_first" | "source_first",
      displayNameOverrideRu: row.displayNameOverrideRu,
      secondaryNameOverrideRu: row.secondaryNameOverrideRu,
      hideSecondaryNameRu: row.hideSecondaryNameRu,
      isActive: row.isActive,
      inventoryEnabled: row.inventoryEnabled,
      countryCode: row.countryCode,
      countryName: row.countryName,
      brand: row.brand,
      producer: row.producer,
      productCode: row.productCode,
      groupName: row.groupName,
      sourceCategory: row.category,
      subcategory: row.subcategory,
      presentOnBirrf: row.presentOnBirrf,
      attributes: isRecord(row.attributes) ? row.attributes : {},
      quantityDefaults: isRecord(row.quantityDefaults) ? row.quantityDefaults : null,
      aliases: aliases.map((alias) => ({
        id: alias.id,
        locale: alias.locale,
        alias: alias.alias,
        source: alias.source,
        isEnabled: alias.isEnabled
      })),
      sources: [],
      packageVariants: []
    }),
    status,
    visibility: row.isActive ? "public" : "internal",
    mergedIntoId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...extractIngredientTechnicalFields({
      type: row.type,
      attributes: row.attributes
    })
  };
};

const toSuggestionItem = (
  dto: IngredientCatalogItemDto,
  extras?: Partial<Pick<IngredientSuggestionItem, "matchType" | "matchedAlias" | "matchedPackageVariantId" | "matchedPackageVariantName" | "score">>
): IngredientSuggestionItem => ({
  id: dto.id,
  type: dto.type,
  category: dto.category,
  subtype: dto.subtype,
  itemKind: dto.itemKind,
  primaryLabelRu: dto.primaryLabelRu,
  secondaryLabelRu: dto.secondaryLabelRu,
  displayName: dto.primaryLabelRu,
  displayNameRu: dto.nameRu,
  displayNameEn: dto.nameEn,
  nameRu: dto.nameRu,
  nameEn: dto.nameEn,
  displayModeRu: dto.displayModeRu,
  subtitle: [
    dto.brand ?? dto.producer ?? null,
    dto.countryName ?? null,
    buildIngredientTypedSummary({
      type: dto.type,
      category: dto.category,
      subtype: dto.subtype,
      technicalData: dto.technicalData,
      unitPreferred: dto.unitPreferred
    }) ?? null
  ].filter(Boolean).join(" • ") || undefined,
  brand: dto.brand,
  producer: dto.producer,
  brandName: dto.brand,
  manufacturer: dto.producer,
  country: dto.countryName,
  countryCode: dto.countryCode,
  countryName: dto.countryName,
  productCode: dto.productCode,
  technicalData: dto.technicalData,
  defaultUnit: dto.defaultUnit,
  defaultDisplayUnit: dto.defaultDisplayUnit,
  allowedUnits: dto.allowedUnits,
  measurementDimension: dto.measurementDimension,
  completenessLevel: dto.completenessLevel,
  quantityDefaults: dto.quantityDefaults,
  unitPreferred: dto.unitPreferred,
  packageVariants: dto.packageVariants,
  familyDisplayName: null,
  familyCanonicalName: null,
  source: "catalog",
  ...extras
});

export const loadIngredients = async (params?: {
  includeInactive?: boolean;
  type?: string;
  category?: string;
}): Promise<IngredientCatalogItemDto[]> => {
  const rows = await db.query.ingredients.findMany({
    where: and(
      params?.includeInactive ? undefined : eq(ingredients.isActive, true),
      params?.type ? eq(ingredients.type, params.type) : undefined,
      undefined
    ),
    with: {
      aliases: true,
      sources: true,
      packageVariants: true
    }
  });

  return rows
    .map((row) => mapIngredientRow(row as IngredientWithRelations))
    .filter((row) => params?.category ? row.category === params.category : true);
};

const getIngredientRow = async (id: string): Promise<IngredientCatalogItemDto | null> => {
  const row = await db.query.ingredients.findFirst({
    where: eq(ingredients.id, id),
    with: {
      aliases: true,
      sources: true,
      packageVariants: true
    }
  });

  return row ? mapIngredientRow(row as IngredientWithRelations) : null;
};

type MatchResult = {
  score: number;
  matchType: NonNullable<IngredientSuggestionItem["matchType"]>;
  matchedAlias?: string | null;
  matchedPackageVariantId?: string | null;
  matchedPackageVariantName?: string | null;
};

const rankCatalogItems = (
  items: IngredientCatalogItemDto[],
  query: string,
  limit?: number
): IngredientSuggestionItem[] => {
  const ranked = items
    .map((item) => {
      const match = scoreCandidate(item, query);
      return match ? toSuggestionItem(item, match) : null;
    })
    .filter((item): item is IngredientSuggestionItem => item !== null)
    .sort((left, right) => (
      (right.score ?? 0) - (left.score ?? 0)
      || (left.primaryLabelRu ?? left.displayName).localeCompare(right.primaryLabelRu ?? right.displayName, "ru")
    ));

  return typeof limit === "number" ? ranked.slice(0, limit) : ranked;
};

const scoreCandidate = (item: IngredientCatalogItemDto, query: string): MatchResult | null => {
  const rank = rankIngredientCandidate(query, {
    displayName: item.primaryLabelRu,
    displayNameRu: item.nameRu,
    displayNameEn: item.nameEn,
    nameRu: item.nameRu,
    nameEn: item.nameEn,
    category: item.category,
    sourceCategory: item.sourceCategory,
    aliases: item.aliases
      .filter((alias) => alias.isEnabled)
      .map((alias) => ({
        alias: alias.alias,
        aliasNormalized: alias.aliasNormalized,
        source: alias.source,
        isEnabled: alias.isEnabled
      })),
    brandName: item.brand,
    manufacturer: item.producer,
    productCode: item.productCode,
    source: "catalog",
    sourcesCount: item.sources.length,
    packageVariantsCount: item.packageVariants.length,
    packageVariants: item.packageVariants.map((variant) => ({
      id: variant.id,
      brand: variant.brand,
      productNameEn: variant.productNameEn,
      productNameRu: variant.productNameRu,
      packageAmount: variant.packageAmount,
      packageUnit: variant.packageUnit,
      stockContentAmount: variant.stockContentAmount,
      stockContentUnit: variant.stockContentUnit
    }))
  });

  if (!rank) {
    return null;
  }

  return {
    score: rank.score,
    matchType: rank.matchType,
    matchedAlias: rank.matchedAlias,
    matchedPackageVariantId: rank.matchedPackageVariantId,
    matchedPackageVariantName: rank.matchedPackageVariantName
  };
};

const toStatusFacets = (items: IngredientCatalogItemDto[]) => {
  const facets = {
    active: 0,
    draft: 0,
    archived: 0,
    merged: 0
  };

  for (const item of items) {
    facets[buildCatalogStatus({
      id: item.id,
      type: item.type,
      nameRu: item.nameRu,
      nameEn: item.nameEn,
      displayModeRu: item.displayModeRu,
      displayNameOverrideRu: item.displayNameOverrideRu,
      secondaryNameOverrideRu: item.secondaryNameOverrideRu,
      hideSecondaryNameRu: item.hideSecondaryNameRu,
      isActive: item.isActive,
      countryCode: item.countryCode,
      countryName: item.countryName,
      brand: item.brand,
      producer: item.producer,
      productCode: item.productCode,
      groupName: item.groupName,
      category: item.sourceCategory,
      subcategory: item.subcategory,
      itemKind: item.itemKind,
      presentOnBirrf: item.presentOnBirrf,
      inventoryEnabled: item.inventoryEnabled,
      attributes: item.attributes,
      quantityDefaults: item.quantityDefaults,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    })] += 1;
  }

  return facets;
};

const upsertIngredientRelations = async (
  tx: Pick<typeof db, "delete" | "insert">,
  ingredientId: string,
  payload: z.infer<typeof ingredientUpsertSchema>
) => {
  await tx.delete(ingredientAliases).where(eq(ingredientAliases.ingredientId, ingredientId));
  await tx.delete(ingredientSources).where(eq(ingredientSources.ingredientId, ingredientId));
  await tx.delete(ingredientPackageVariants).where(eq(ingredientPackageVariants.ingredientId, ingredientId));

  const dedupedAliases = new Map<string, z.infer<typeof ingredientUpsertSchema>["aliases"][number]>();
  for (const alias of payload.aliases) {
    const normalized = normalizeAlias(alias.alias);
    if (!normalized) {
      continue;
    }

    dedupedAliases.set(`${alias.locale}:${normalized}`, alias);
  }

  const aliasValues = Array.from(dedupedAliases.values()).map((alias) => ({
    ingredientId,
    locale: alias.locale,
    alias: collapseWhitespace(alias.alias),
    aliasNormalized: normalizeAlias(alias.alias),
    source: alias.source,
    isEnabled: alias.isEnabled
  }));

  if (aliasValues.length) {
    await tx.insert(ingredientAliases).values(aliasValues);
  }

  if (payload.sources.length) {
    await tx.insert(ingredientSources).values(payload.sources.map((source, index) => ({
      ingredientId,
      kind: source.kind,
      label: source.label,
      url: source.url,
      sourceBasis: source.sourceBasis,
      position: source.position ?? index
    })));
  }

  if (payload.type === "consumable" && payload.packageVariants.length) {
    await tx.insert(ingredientPackageVariants).values(payload.packageVariants.map((variant, index) => ({
      id: variant.id,
      ingredientId,
      brand: variant.brand,
      productNameEn: variant.productNameEn,
      productNameRu: variant.productNameRu,
      countryNameRu: variant.countryNameRu,
      packageAmount: variant.packageAmount ?? null,
      packageUnit: variant.packageUnit,
      stockContentAmount: variant.stockContentAmount ?? null,
      stockContentUnit: variant.stockContentUnit,
      sourceGroup: variant.sourceGroup,
      sourceUrl: variant.sourceUrl,
      isDefaultForStock: variant.isDefaultForStock,
      position: variant.position ?? index
    })));
  }
};

const buildIngredientValues = (payload: z.infer<typeof ingredientUpsertSchema>) => ({
  type: payload.type,
  nameRu: payload.nameRu,
  nameEn: payload.nameEn,
  displayModeRu: payload.displayModeRu,
  displayNameOverrideRu: payload.displayNameOverrideRu,
  secondaryNameOverrideRu: payload.secondaryNameOverrideRu,
  hideSecondaryNameRu: payload.hideSecondaryNameRu,
  isActive: payload.isActive,
  countryCode: payload.countryCode,
  countryName: payload.countryName,
  brand: payload.brand,
  producer: payload.producer,
  productCode: payload.productCode,
  groupName: payload.groupName,
  category: payload.sourceCategory,
  subcategory: payload.subcategory,
  itemKind: payload.itemKind,
  presentOnBirrf: payload.presentOnBirrf ?? null,
  inventoryEnabled: payload.inventoryEnabled,
  attributes: payload.attributes,
  quantityDefaults: payload.quantityDefaults
});

export const searchCatalogItems = async (params: SearchParams): Promise<IngredientSuggestionItem[]> => {
  const query = ingredientSearchQuerySchema.parse(params);
  const items = await loadIngredients({ type: query.type, category: query.category });

  return rankCatalogItems(items, query.q, query.limit);
};

export const searchIngredientSuggestions = searchCatalogItems;

export const listCatalogIngredients = async (params: CatalogListParams) => {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 20));
  const [allItems, pendingProposals] = await Promise.all([
    loadIngredients({ includeInactive: true, type: params.type, category: params.category }),
    db.query.proposedIngredients.findMany({
      where: eq(proposedIngredients.status, "pending")
    }).then((rows) => rows.length)
  ]);

  let filtered = allItems.filter((item) => {
    if (!params.status) {
      return true;
    }

    return buildCatalogStatus({
      id: item.id,
      type: item.type,
      nameRu: item.nameRu,
      nameEn: item.nameEn,
      displayModeRu: item.displayModeRu,
      displayNameOverrideRu: item.displayNameOverrideRu,
      secondaryNameOverrideRu: item.secondaryNameOverrideRu,
      hideSecondaryNameRu: item.hideSecondaryNameRu,
      isActive: item.isActive,
      countryCode: item.countryCode,
      countryName: item.countryName,
      brand: item.brand,
      producer: item.producer,
      productCode: item.productCode,
      groupName: item.groupName,
      category: item.sourceCategory,
      subcategory: item.subcategory,
      itemKind: item.itemKind,
      presentOnBirrf: item.presentOnBirrf,
      inventoryEnabled: item.inventoryEnabled,
      attributes: item.attributes,
      quantityDefaults: item.quantityDefaults,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }) === params.status;
  });

  if (params.q?.trim()) {
    const ranked = rankCatalogItems(filtered, params.q);
    const order = new Map(ranked.map((item, index) => [item.id, index]));
    filtered = filtered
      .filter((item) => order.has(item.id))
      .sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  } else {
    filtered = filtered.sort((left, right) => {
      if (params.sort === "updated") {
        return right.updatedAt.getTime() - left.updatedAt.getTime();
      }

      if (params.sort === "brand") {
        return (left.brand ?? left.producer ?? "").localeCompare(right.brand ?? right.producer ?? "", "ru")
          || left.primaryLabelRu.localeCompare(right.primaryLabelRu, "ru");
      }

      return left.primaryLabelRu.localeCompare(right.primaryLabelRu, "ru");
    });
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const offset = (page - 1) * pageSize;

  return {
    items: filtered.slice(offset, offset + pageSize),
    page,
    pageSize,
    total,
    totalPages,
    pendingProposals,
    facets: {
      byCategory: {
        fermentable: filtered.filter((item) => item.category === "fermentable").length,
        hop: filtered.filter((item) => item.category === "hop").length,
        yeast: filtered.filter((item) => item.category === "yeast").length,
        consumable: filtered.filter((item) => item.category === "consumable").length,
        water_treatment: filtered.filter((item) => item.category === "water_treatment").length
      },
      byStatus: toStatusFacets(filtered)
    }
  };
};

export const getIngredientById = async (id: string) => getIngredientRow(id);

export const createIngredient = async (input: unknown, _actorId: string) => {
  const parsed = ingredientUpsertSchema.parse(input);
  const ingredientId = parsed.id ?? `manual-${randomUUID()}`;

  await db.transaction(async (tx) => {
    await tx.insert(ingredients).values({
      id: ingredientId,
      ...buildIngredientValues(parsed)
    });

    await upsertIngredientRelations(tx, ingredientId, parsed);
  });

  return await getIngredientRow(ingredientId);
};

const ingredientPatchSchema = z.record(z.string(), z.unknown());

const toUpsertPayload = (item: IngredientCatalogItemDto): z.infer<typeof ingredientUpsertSchema> => ({
  id: item.id,
  type: item.type,
  category: item.category,
  itemKind: item.itemKind,
  nameRu: item.nameRu,
  nameEn: item.nameEn,
  displayModeRu: item.displayModeRu,
  displayNameOverrideRu: item.displayNameOverrideRu,
  secondaryNameOverrideRu: item.secondaryNameOverrideRu,
  hideSecondaryNameRu: item.hideSecondaryNameRu,
  isActive: item.isActive,
  inventoryEnabled: item.inventoryEnabled,
  countryCode: item.countryCode,
  countryName: item.countryName,
  brand: item.brand,
  producer: item.producer,
  productCode: item.productCode,
  groupName: item.groupName,
  sourceCategory: item.sourceCategory,
  subcategory: item.subcategory,
  presentOnBirrf: item.presentOnBirrf,
  attributes: item.attributes,
  quantityDefaults: item.quantityDefaults,
  aliases: item.aliases.map((alias) => ({
    id: alias.id,
    locale: alias.locale,
    alias: alias.alias,
    source: alias.source,
    isEnabled: alias.isEnabled
  })),
  sources: item.sources.map((source) => ({
    id: source.id,
    kind: source.kind,
    label: source.label,
    url: source.url,
    sourceBasis: source.sourceBasis,
    position: source.position
  })),
  packageVariants: item.packageVariants.map((variant) => ({
    id: variant.id,
    brand: variant.brand,
    productNameEn: variant.productNameEn,
    productNameRu: variant.productNameRu,
    countryNameRu: variant.countryNameRu,
    packageAmount: variant.packageAmount,
    packageUnit: variant.packageUnit,
    stockContentAmount: variant.stockContentAmount,
    stockContentUnit: variant.stockContentUnit,
    sourceGroup: variant.sourceGroup,
    sourceUrl: variant.sourceUrl,
    isDefaultForStock: variant.isDefaultForStock,
    position: variant.position
  }))
});

export const updateIngredient = async (id: string, input: unknown, _actorId: string) => {
  const current = await getIngredientRow(id);
  if (!current) {
    return null;
  }

  const patch = ingredientPatchSchema.parse(input);
  const merged = ingredientUpsertSchema.parse({
    ...toUpsertPayload(current),
    ...patch,
    aliases: patch.aliases ?? toUpsertPayload(current).aliases,
    sources: patch.sources ?? toUpsertPayload(current).sources,
    packageVariants: patch.packageVariants ?? toUpsertPayload(current).packageVariants
  });

  await db.transaction(async (tx) => {
    await tx.update(ingredients).set({
      ...buildIngredientValues(merged),
      updatedAt: new Date()
    }).where(eq(ingredients.id, id));

    await upsertIngredientRelations(tx, id, merged);
  });

  return await getIngredientRow(id);
};

export const deleteIngredient = async (id: string, _actorId: string) => {
  const current = await getIngredientRow(id);
  if (!current) {
    return null;
  }

  const [inventoryUsageRow] = await db.select({
    count: sql<number>`count(*)::int`
  }).from(userIngredients).where(eq(userIngredients.ingredientCatalogItemId, id));

  const [recipeUsageRow] = await db.select({
    count: sql<number>`count(*)::int`
  }).from(recipeIngredients).where(eq(recipeIngredients.ingredientCatalogItemId, id));

  if ((inventoryUsageRow?.count ?? 0) > 0 || (recipeUsageRow?.count ?? 0) > 0) {
    const nextAttributes = {
      ...current.attributes,
      _catalog_status: "archived"
    };

    await db.update(ingredients).set({
      isActive: false,
      attributes: nextAttributes,
      updatedAt: new Date()
    }).where(eq(ingredients.id, id));

    return {
      id,
      displayName: current.primaryLabelRu,
      archived: true
    };
  }

  await db.delete(ingredients).where(eq(ingredients.id, id));
  return {
    id,
    displayName: current.primaryLabelRu,
    archived: false
  };
};

export const createProposedIngredient = async (input: {
  submittedByUserId?: string | null;
  sourceType: string;
  sourceDisplayName: string;
  sourcePayload: Record<string, unknown>;
}) => {
  const [created] = await db.insert(proposedIngredients).values({
    submittedByUserId: input.submittedByUserId ?? null,
    sourcePayload: input.sourcePayload,
    sourceType: input.sourceType,
    sourceDisplayName: input.sourceDisplayName,
    normalizedName: normalizeSearchText(input.sourceDisplayName),
    status: "pending"
  }).returning();

  return created;
};

export const listProposedIngredients = async (
  status?: IngredientProposalDto["status"]
): Promise<IngredientProposalDto[]> => {
  const rows = await db.query.proposedIngredients.findMany({
    where: status ? eq(proposedIngredients.status, status) : undefined
  });

  return rows.map((row) => ({
    id: row.id,
    sourcePayload: row.sourcePayload,
    sourceType: row.sourceType,
    sourceDisplayName: row.sourceDisplayName,
    normalizedName: row.normalizedName,
    status: row.status,
    targetIngredientId: row.targetIngredientId,
    moderatorId: row.moderatorId,
    resolutionNote: row.resolutionNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
};

export const applyModerationAction = async (
  id: string,
  input: unknown,
  moderatorId: string
) => {
  const action = moderationActionSchema.parse(input);
  const nextStatus = action.action === "approve"
    ? "approved"
    : action.action === "reject"
      ? "rejected"
      : "merged";

  const [updated] = await db.update(proposedIngredients).set({
    status: nextStatus,
    targetIngredientId: action.targetIngredientId ?? null,
    resolutionNote: action.resolutionNote ?? null,
    moderatorId,
    updatedAt: new Date()
  }).where(eq(proposedIngredients.id, id)).returning();

  return updated;
};

export const mergeDuplicateIngredients = async (
  sourceIngredientId: string,
  targetIngredientId: string,
  _actorId: string,
  note?: string
) => {
  if (sourceIngredientId === targetIngredientId) {
    throw new Error("SOURCE_EQUALS_TARGET");
  }

  const [source, target] = await Promise.all([
    getIngredientRow(sourceIngredientId),
    getIngredientRow(targetIngredientId)
  ]);

  if (!source || !target) {
    throw new Error("NOT_FOUND");
  }

  await db.transaction(async (tx) => {
    await tx.update(userIngredients).set({
      ingredientCatalogItemId: targetIngredientId,
      packageVariantId: null,
      updatedAt: new Date()
    }).where(eq(userIngredients.ingredientCatalogItemId, sourceIngredientId));

    await tx.update(recipeIngredients).set({
      ingredientCatalogItemId: targetIngredientId,
      updatedAt: new Date()
    }).where(eq(recipeIngredients.ingredientCatalogItemId, sourceIngredientId));

    const sourceAliasCandidates = [
      source.nameRu,
      source.nameEn,
      ...source.aliases.filter((alias) => alias.isEnabled).map((alias) => alias.alias)
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    const existingAliases = await tx.query.ingredientAliases.findMany({
      where: eq(ingredientAliases.ingredientId, targetIngredientId)
    });
    const existingNormalized = new Set(existingAliases.map((alias) => `${alias.locale}:${alias.aliasNormalized}`));
    const additionalAliasValues = sourceAliasCandidates
      .map((alias) => ({
        locale: /[а-яё]/i.test(alias) ? "ru" : "en",
        alias: collapseWhitespace(alias),
        aliasNormalized: normalizeAlias(alias)
      }))
      .filter((alias) => alias.aliasNormalized.length > 0)
      .filter((alias) => !existingNormalized.has(`${alias.locale}:${alias.aliasNormalized}`))
      .map((alias) => ({
        ingredientId: targetIngredientId,
        locale: alias.locale,
        alias: alias.alias,
        aliasNormalized: alias.aliasNormalized,
        source: "merge",
        isEnabled: true
      }));

    if (additionalAliasValues.length) {
      await tx.insert(ingredientAliases).values(additionalAliasValues);
    }

    await tx.update(ingredients).set({
      isActive: false,
      attributes: {
        ...source.attributes,
        _catalog_status: "merged",
        _merged_into_id: targetIngredientId,
        _merge_note: note ?? null
      },
      updatedAt: new Date()
    }).where(eq(ingredients.id, sourceIngredientId));
  });

  return {
    sourceIngredientId,
    targetIngredientId
  };
};
