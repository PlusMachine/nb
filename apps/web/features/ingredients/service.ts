import {
  and,
  asc,
  db,
  desc,
  eq,
  ilike,
  inArray,
  ingredientCatalogItems,
  ingredientFamilies,
  or,
  proposedIngredients,
  sql
} from "@nb/db";

import {
  ingredientSearchQuerySchema,
  ingredientUpsertSchema,
  resolveUpsertCompletenessLevel,
  type IngredientCatalogItemDto,
  type IngredientFamilySummaryDto,
  type IngredientSuggestionItem,
  type IngredientType,
  moderationActionSchema
} from "./contracts";
import { normalizeAliasList, normalizeIngredientName } from "./normalization";
import {
  buildIngredientTypedSummary,
  resolveIngredientFamilyDisplayName
} from "./presentation";
import { scoreIngredientCandidate } from "./ranking";
import {
  extractIngredientTechnicalData,
  extractIngredientTechnicalFields,
  normalizeIngredientTechnicalData,
  normalizeIngredientTechnicalFields,
  syncIngredientPropertiesWithTechnicalFields
} from "./technical-fields";
import {
  resolveIngredientCategory,
  resolveIngredientMatchPolicy,
  resolveIngredientSubtype,
  resolveIngredientUnits,
  resolveLegacyIngredientType
} from "./taxonomy";
import { canModerateTransition, validateMergeInput } from "./workflows";

type SearchParams = { q: string; type?: string; category?: string; limit?: number };
type CatalogListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  type?: string;
  category?: string;
  status?: "draft" | "active" | "archived" | "merged";
};

type CatalogRow = {
  item: typeof ingredientCatalogItems.$inferSelect;
  family: typeof ingredientFamilies.$inferSelect | null;
};

type FamilySeedInput = {
  familyId?: string | null;
  canonicalFamilyName?: string | null;
  familyDisplayNameRu?: string | null;
  familyDisplayNameEn?: string | null;
  matchPolicy?: string | null;
  category: ReturnType<typeof resolveIngredientCategory>;
  subtype: ReturnType<typeof resolveIngredientSubtype>;
  displayName: string;
};

const isPgTrgmUnavailableError = (error: unknown) => (
  typeof error === "object"
  && error !== null
  && "code" in error
  && (error as { code?: string }).code === "42883"
);

const isFamilyUniqueConstraintError = (error: unknown) => (
  typeof error === "object"
  && error !== null
  && "code" in error
  && (error as { code?: string }).code === "23505"
);

const mapIngredientFamilySummary = (
  family: typeof ingredientFamilies.$inferSelect | null | undefined
): IngredientFamilySummaryDto | null => {
  if (!family) {
    return null;
  }

  return {
    id: family.id,
    category: family.category,
    subtype: family.subtype as IngredientFamilySummaryDto["subtype"],
    canonicalName: family.canonicalName,
    normalizedCanonicalName: family.normalizedCanonicalName,
    displayNameRu: family.displayNameRu,
    displayNameEn: family.displayNameEn,
    matchPolicy: family.matchPolicy,
    isActive: family.isActive
  };
};

const mapIngredientCatalogRow = (row: CatalogRow): IngredientCatalogItemDto => ({
  id: row.item.id,
  type: row.item.type,
  category: row.item.category,
  subtype: row.item.subtype as IngredientCatalogItemDto["subtype"],
  familyId: row.item.familyId,
  family: mapIngredientFamilySummary(row.family),
  displayName: row.item.displayName,
  normalizedName: row.item.normalizedName,
  aliases: row.item.aliases,
  brandName: row.item.brandName,
  manufacturer: row.item.manufacturer,
  country: row.item.country,
  harvestYear: row.item.harvestYear,
  description: row.item.description,
  technicalData: extractIngredientTechnicalData(row.item),
  defaultUnit: row.item.defaultUnit as IngredientCatalogItemDto["defaultUnit"],
  defaultDisplayUnit: row.item.defaultDisplayUnit as IngredientCatalogItemDto["defaultDisplayUnit"],
  allowedUnits: row.item.allowedUnits as IngredientCatalogItemDto["allowedUnits"],
  measurementDimension: row.item.measurementDimension,
  completenessLevel: row.item.completenessLevel,
  ...extractIngredientTechnicalFields(row.item),
  properties: row.item.properties,
  status: row.item.status,
  visibility: row.item.visibility,
  mergedIntoId: row.item.mergedIntoId,
  createdBy: row.item.createdBy,
  updatedBy: row.item.updatedBy,
  createdAt: row.item.createdAt,
  updatedAt: row.item.updatedAt
});

const buildIngredientSearchFilter = (query: ReturnType<typeof ingredientSearchQuerySchema.parse>) => (
  query.category
    ? eq(ingredientCatalogItems.category, query.category)
    : query.type
      ? eq(ingredientCatalogItems.type, query.type as never)
      : undefined
);

const loadIngredientSearchRows = async (
  query: ReturnType<typeof ingredientSearchQuerySchema.parse>,
  normalized: string,
  likeQ: string,
  useSimilarity: boolean
) => {
  const scoreExpression = useSimilarity
    ? sql<number>`greatest(
        similarity(${ingredientCatalogItems.displayName}, ${query.q}),
        similarity(${ingredientCatalogItems.normalizedName}, ${normalized}),
        similarity(coalesce(${ingredientCatalogItems.manufacturer}, ''), ${query.q})
      )`
    : sql<number>`0`;

  const aliasSimilarityClause = useSimilarity
    ? sql`or similarity(alias, ${normalized}) > 0.35`
    : sql``;

  const searchPredicates = [
    ilike(ingredientCatalogItems.displayName, likeQ),
    ilike(ingredientCatalogItems.normalizedName, `%${normalized}%`),
    ilike(sql<string>`coalesce(${ingredientCatalogItems.manufacturer}, '')`, likeQ),
    ilike(sql<string>`coalesce(${ingredientCatalogItems.brandName}, '')`, likeQ),
    sql<boolean>`exists (
      select 1
      from jsonb_array_elements_text(${ingredientCatalogItems.aliases}) as alias
      where alias ilike ${`%${normalized}%`}
      ${aliasSimilarityClause}
    )`
  ];

  if (useSimilarity) {
    searchPredicates.push(
      sql<boolean>`similarity(${ingredientCatalogItems.displayName}, ${query.q}) > 0.25`,
      sql<boolean>`similarity(${ingredientCatalogItems.normalizedName}, ${normalized}) > 0.25`
    );
  }

  const baseQuery = db
    .select({
      id: ingredientCatalogItems.id,
      type: ingredientCatalogItems.type,
      category: ingredientCatalogItems.category,
      subtype: ingredientCatalogItems.subtype,
      familyId: ingredientCatalogItems.familyId,
      familyCanonicalName: ingredientFamilies.canonicalName,
      familyDisplayNameEn: ingredientFamilies.displayNameEn,
      familyDisplayNameRu: ingredientFamilies.displayNameRu,
      displayName: ingredientCatalogItems.displayName,
      brandName: ingredientCatalogItems.brandName,
      manufacturer: ingredientCatalogItems.manufacturer,
      harvestYear: ingredientCatalogItems.harvestYear,
      defaultUnit: ingredientCatalogItems.defaultUnit,
      defaultDisplayUnit: ingredientCatalogItems.defaultDisplayUnit,
      allowedUnits: ingredientCatalogItems.allowedUnits,
      measurementDimension: ingredientCatalogItems.measurementDimension,
      completenessLevel: ingredientCatalogItems.completenessLevel,
      technicalData: ingredientCatalogItems.technicalData,
      normalizedName: ingredientCatalogItems.normalizedName,
      aliases: ingredientCatalogItems.aliases,
      score: scoreExpression
    })
    .from(ingredientCatalogItems)
    .leftJoin(ingredientFamilies, eq(ingredientCatalogItems.familyId, ingredientFamilies.id))
    .where(and(
      eq(ingredientCatalogItems.status, "active"),
      buildIngredientSearchFilter(query),
      or(...searchPredicates)
    ));

  return useSimilarity
    ? baseQuery.orderBy(desc(scoreExpression), asc(ingredientCatalogItems.displayName)).limit(query.limit)
    : baseQuery.orderBy(asc(ingredientCatalogItems.displayName)).limit(query.limit);
};

const findIngredientFamilyById = async (familyId: string) => {
  const family = await db.query.ingredientFamilies.findFirst({
    where: eq(ingredientFamilies.id, familyId)
  });

  if (!family) {
    throw new Error("FAMILY_NOT_FOUND");
  }

  return family;
};

const findIngredientFamilyByCanonicalName = async (
  category: typeof ingredientFamilies.$inferSelect.category,
  normalizedCanonicalName: string
) => db.query.ingredientFamilies.findFirst({
  where: and(
    eq(ingredientFamilies.category, category),
    eq(ingredientFamilies.normalizedCanonicalName, normalizedCanonicalName)
  )
});

const upsertFamilyMetadata = async (
  current: typeof ingredientFamilies.$inferSelect,
  input: FamilySeedInput
) => {
  const nextSubtype = input.subtype ?? current.subtype;
  const nextDisplayNameRu = input.familyDisplayNameRu ?? current.displayNameRu;
  const nextDisplayNameEn = input.familyDisplayNameEn ?? current.displayNameEn ?? current.canonicalName;
  const nextMatchPolicy = (input.matchPolicy ?? current.matchPolicy) as typeof ingredientFamilies.$inferSelect.matchPolicy;

  if (
    current.subtype === nextSubtype
    && current.displayNameRu === nextDisplayNameRu
    && current.displayNameEn === nextDisplayNameEn
    && current.matchPolicy === nextMatchPolicy
  ) {
    return current;
  }

  const [updated] = await db.update(ingredientFamilies).set({
    subtype: nextSubtype ?? null,
    displayNameRu: nextDisplayNameRu ?? null,
    displayNameEn: nextDisplayNameEn ?? null,
    matchPolicy: nextMatchPolicy,
    updatedAt: new Date()
  }).where(eq(ingredientFamilies.id, current.id)).returning();

  return updated ?? current;
};

const ensureIngredientFamily = async (input: FamilySeedInput) => {
  if (input.familyId) {
    const family = await findIngredientFamilyById(input.familyId);
    if (family.category !== input.category) {
      throw new Error("FAMILY_CATEGORY_MISMATCH");
    }

    return upsertFamilyMetadata(family, input);
  }

  const canonicalName = (input.canonicalFamilyName ?? input.displayName).trim();
  const normalizedCanonicalName = normalizeIngredientName(canonicalName);
  const existing = await findIngredientFamilyByCanonicalName(input.category, normalizedCanonicalName);

  if (existing) {
    return upsertFamilyMetadata(existing, {
      ...input,
      canonicalFamilyName: canonicalName
    });
  }

  const matchPolicy = (input.matchPolicy ?? resolveIngredientMatchPolicy(input)) as typeof ingredientFamilies.$inferInsert.matchPolicy;

  try {
    const [created] = await db.insert(ingredientFamilies).values({
      category: input.category,
      subtype: input.subtype ?? null,
      canonicalName,
      normalizedCanonicalName,
      displayNameRu: input.familyDisplayNameRu ?? null,
      displayNameEn: input.familyDisplayNameEn ?? canonicalName,
      matchPolicy,
      isActive: true
    }).returning();

    return created;
  } catch (error) {
    if (!isFamilyUniqueConstraintError(error)) {
      throw error;
    }

    const racedFamily = await findIngredientFamilyByCanonicalName(input.category, normalizedCanonicalName);
    if (!racedFamily) {
      throw error;
    }

    return racedFamily;
  }
};

const buildCatalogDtoById = async (id: string) => {
  const rows = await db
    .select({
      item: ingredientCatalogItems,
      family: ingredientFamilies
    })
    .from(ingredientCatalogItems)
    .leftJoin(ingredientFamilies, eq(ingredientCatalogItems.familyId, ingredientFamilies.id))
    .where(eq(ingredientCatalogItems.id, id))
    .limit(1);

  const row = rows[0];
  return row ? mapIngredientCatalogRow(row) : null;
};

const buildCatalogVariantPayload = async (payload: ReturnType<typeof ingredientUpsertSchema.parse>, actorId?: string) => {
  const category = resolveIngredientCategory(payload);
  const subtype = resolveIngredientSubtype(payload);
  const legacyType = resolveLegacyIngredientType(payload);
  const normalizedName = normalizeIngredientName(payload.displayName);
  const normalizedAliases = normalizeAliasList(payload.aliases);
  const technicalData = normalizeIngredientTechnicalData({
    ...payload,
    category,
    subtype,
    type: legacyType
  });
  const technicalSource = {
    ...payload,
    category,
    subtype,
    type: legacyType,
    harvestYear: technicalData.category === "hop" ? technicalData.harvestYear : payload.harvestYear ?? null,
    yeastForm: technicalData.category === "yeast" ? technicalData.form : payload.yeastForm ?? null,
    technicalData
  };
  const technicalFields = normalizeIngredientTechnicalFields(technicalSource);
  const properties = syncIngredientPropertiesWithTechnicalFields(technicalSource);
  const units = resolveIngredientUnits({
    ...payload,
    category,
    subtype,
    yeastForm: technicalData.category === "yeast" ? technicalData.form : payload.yeastForm ?? null
  });
  const completenessLevel = resolveUpsertCompletenessLevel(payload);
  const family = await ensureIngredientFamily({
    familyId: payload.familyId ?? null,
    canonicalFamilyName: payload.canonicalFamilyName ?? null,
    familyDisplayNameRu: payload.familyDisplayNameRu ?? null,
    familyDisplayNameEn: payload.familyDisplayNameEn ?? null,
    matchPolicy: payload.matchPolicy ?? null,
    category,
    subtype,
    displayName: payload.displayName
  });

  return {
    familyId: family.id,
    type: legacyType,
    category,
    subtype: subtype ?? null,
    displayName: payload.displayName,
    normalizedName,
    aliases: normalizedAliases,
    brandName: payload.brandName || payload.manufacturer || null,
    manufacturer: payload.manufacturer || null,
    country: payload.country || null,
    harvestYear: payload.harvestYear ?? null,
    description: payload.description || null,
    defaultUnit: units.defaultDisplayUnit,
    defaultDisplayUnit: units.defaultDisplayUnit,
    allowedUnits: payload.allowedUnits?.length ? payload.allowedUnits : units.allowedUnits,
    measurementDimension: payload.measurementDimension ?? units.measurementDimension,
    completenessLevel,
    technicalData,
    ...technicalFields,
    properties,
    status: payload.status,
    visibility: payload.visibility,
    createdBy: actorId,
    updatedBy: actorId
  } satisfies typeof ingredientCatalogItems.$inferInsert;
};

export const searchIngredientSuggestions = async (params: SearchParams): Promise<IngredientSuggestionItem[]> => {
  const query = ingredientSearchQuerySchema.parse(params);
  const normalized = normalizeIngredientName(query.q);
  const likeQ = `%${query.q.trim()}%`;

  const rows = await loadIngredientSearchRows(query, normalized, likeQ, true).catch(async (error) => {
    if (!isPgTrgmUnavailableError(error)) {
      throw error;
    }

    return loadIngredientSearchRows(query, normalized, likeQ, false);
  });

  return rows
    .map((row) => {
      const familyDisplayName = resolveIngredientFamilyDisplayName({
        displayName: row.displayName,
        familyCanonicalName: row.familyCanonicalName,
        familyDisplayNameEn: row.familyDisplayNameEn,
        familyDisplayNameRu: row.familyDisplayNameRu
      });

      const subtitle = buildIngredientTypedSummary({
        category: row.category,
        subtype: row.subtype as IngredientSuggestionItem["subtype"],
        displayName: row.displayName,
        harvestYear: row.harvestYear,
        defaultDisplayUnit: row.defaultDisplayUnit as IngredientSuggestionItem["defaultDisplayUnit"],
        technicalData: row.technicalData
      });

      return {
        id: row.id,
        type: row.type,
        category: row.category,
        subtype: row.subtype as IngredientSuggestionItem["subtype"],
        familyId: row.familyId,
        familyCanonicalName: row.familyCanonicalName ?? undefined,
        familyDisplayName,
        displayName: row.displayName,
        subtitle,
        brandName: row.brandName ?? undefined,
        manufacturer: row.manufacturer ?? undefined,
        technicalData: row.technicalData as IngredientSuggestionItem["technicalData"],
        defaultUnit: row.defaultDisplayUnit as IngredientSuggestionItem["defaultUnit"],
        defaultDisplayUnit: row.defaultDisplayUnit as IngredientSuggestionItem["defaultDisplayUnit"],
        allowedUnits: row.allowedUnits as IngredientSuggestionItem["allowedUnits"],
        measurementDimension: row.measurementDimension,
        completenessLevel: row.completenessLevel,
        source: "catalog" as const,
        rankScore: scoreIngredientCandidate(query.q, {
          displayName: row.displayName,
          normalizedName: row.normalizedName,
          aliases: row.aliases
        }) + (row.score * 10)
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore)
    .map(({ rankScore, ...item }) => item);
};

export const listCatalogIngredients = async (params: CatalogListParams) => {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 20));
  const normalized = params.q ? normalizeIngredientName(params.q) : undefined;

  const where = and(
    params.category ? eq(ingredientCatalogItems.category, params.category as never) : undefined,
    params.type ? eq(ingredientCatalogItems.type, params.type as never) : undefined,
    params.status ? eq(ingredientCatalogItems.status, params.status) : undefined,
    params.q ? or(
      ilike(ingredientCatalogItems.displayName, `%${params.q}%`),
      ilike(ingredientCatalogItems.normalizedName, `%${normalized}%`),
      ilike(sql<string>`coalesce(${ingredientCatalogItems.manufacturer}, '')`, `%${params.q}%`),
      ilike(sql<string>`coalesce(${ingredientCatalogItems.brandName}, '')`, `%${params.q}%`),
      sql<boolean>`exists (
        select 1 from jsonb_array_elements_text(${ingredientCatalogItems.aliases}) as alias
        where alias ilike ${`%${normalized}%`}
      )`
    ) : undefined
  );

  const [rows, countRows] = await Promise.all([
    db
      .select({
        item: ingredientCatalogItems,
        family: ingredientFamilies
      })
      .from(ingredientCatalogItems)
      .leftJoin(ingredientFamilies, eq(ingredientCatalogItems.familyId, ingredientFamilies.id))
      .where(where)
      .orderBy(desc(ingredientCatalogItems.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(ingredientCatalogItems).where(where)
  ]);

  return {
    items: rows.map(mapIngredientCatalogRow),
    page,
    pageSize,
    total: countRows[0]?.count ?? 0
  };
};

export const getIngredientById = async (id: string) => buildCatalogDtoById(id);

export const createIngredient = async (payload: unknown, actorId?: string) => {
  const parsed = ingredientUpsertSchema.parse(payload);
  const values = await buildCatalogVariantPayload(parsed, actorId);

  const [created] = await db.insert(ingredientCatalogItems).values(values).returning();
  return buildCatalogDtoById(created.id);
};

export const updateIngredient = async (id: string, payload: unknown, actorId?: string) => {
  const parsed = ingredientUpsertSchema.parse(payload);
  const values = await buildCatalogVariantPayload(parsed, actorId);
  const { createdBy: _createdBy, ...updateValues } = values;

  const [updated] = await db.update(ingredientCatalogItems).set({
    ...updateValues,
    updatedBy: actorId,
    updatedAt: new Date()
  }).where(eq(ingredientCatalogItems.id, id)).returning();

  return updated ? buildCatalogDtoById(updated.id) : null;
};

export const createProposedIngredient = async (payload: {
  submittedByUserId?: string;
  sourceType: string;
  sourceDisplayName: string;
  sourcePayload?: Record<string, unknown>;
}) => {
  const [created] = await db.insert(proposedIngredients).values({
    submittedByUserId: payload.submittedByUserId,
    sourceType: payload.sourceType,
    sourceDisplayName: payload.sourceDisplayName,
    sourcePayload: payload.sourcePayload ?? {},
    normalizedName: normalizeIngredientName(payload.sourceDisplayName)
  }).returning();

  return created;
};

export const listProposedIngredients = async (status: "pending" | "approved" | "rejected" | "merged" = "pending") => {
  return db.select().from(proposedIngredients).where(eq(proposedIngredients.status, status)).orderBy(asc(proposedIngredients.createdAt));
};

export const applyModerationAction = async (id: string, payload: unknown, moderatorId: string) => {
  const action = moderationActionSchema.parse(payload);

  const current = await db.query.proposedIngredients.findFirst({ where: eq(proposedIngredients.id, id) });
  if (!current) {
    throw new Error("NOT_FOUND");
  }
  if (!canModerateTransition(current.status, action.action)) {
    throw new Error("INVALID_STATUS");
  }

  if (action.action === "approve") {
    const proposedType = ((current.sourcePayload.type as string | undefined) ?? null) as IngredientType | null;
    const proposedProperties = (current.sourcePayload.properties as Record<string, unknown> | undefined) ?? {};
    const proposedTechnicalFields = extractIngredientTechnicalFields({
      type: proposedType ?? resolveLegacyIngredientType({
        category: current.sourcePayload.category as string | undefined,
        type: "misc",
        subtype: current.sourcePayload.subtype as string | undefined,
        displayName: current.sourceDisplayName,
        properties: proposedProperties,
        hopForm: current.sourcePayload.hopForm as string | undefined,
        yeastType: current.sourcePayload.yeastType as string | undefined
      }),
      manufacturer: (current.sourcePayload.manufacturer as string | undefined) ?? null,
      country: (current.sourcePayload.country as string | undefined) ?? null,
      fermentableColorEbc: current.sourcePayload.fermentableColorEbc as number | undefined,
      fermentableExtractYieldPct: current.sourcePayload.fermentableExtractYieldPct as number | undefined,
      hopAlphaAcidPct: current.sourcePayload.hopAlphaAcidPct as number | undefined,
      hopForm: current.sourcePayload.hopForm as "pellet" | "whole_cone" | "lupulin" | "cryo" | undefined,
      hopSeason: current.sourcePayload.hopSeason as string | undefined,
      yeastAttenuationPct: current.sourcePayload.yeastAttenuationPct as number | undefined,
      yeastType: current.sourcePayload.yeastType as "ale" | "lager" | "wine" | undefined,
      yeastForm: current.sourcePayload.yeastForm as "dry" | "liquid" | undefined,
      yeastMinFermentationTempC: current.sourcePayload.yeastMinFermentationTempC as number | undefined,
      yeastMaxFermentationTempC: current.sourcePayload.yeastMaxFermentationTempC as number | undefined,
      properties: proposedProperties
    });

    const created = await createIngredient({
      type: proposedType ?? undefined,
      category: (current.sourcePayload.category as string | undefined) ?? undefined,
      subtype: (current.sourcePayload.subtype as string | undefined) ?? null,
      familyId: (current.sourcePayload.familyId as string | undefined) ?? null,
      canonicalFamilyName: (current.sourcePayload.canonicalFamilyName as string | undefined) ?? null,
      familyDisplayNameRu: (current.sourcePayload.familyDisplayNameRu as string | undefined) ?? null,
      familyDisplayNameEn: (current.sourcePayload.familyDisplayNameEn as string | undefined) ?? null,
      matchPolicy: (current.sourcePayload.matchPolicy as string | undefined) ?? null,
      displayName: current.sourceDisplayName,
      aliases: (current.sourcePayload.aliases as string[] | undefined) ?? [],
      brandName: (current.sourcePayload.brandName as string | undefined) ?? null,
      manufacturer: (current.sourcePayload.manufacturer as string | undefined) ?? null,
      country: (current.sourcePayload.country as string | undefined) ?? null,
      harvestYear: (current.sourcePayload.harvestYear as number | undefined) ?? null,
      description: (current.sourcePayload.description as string | undefined) ?? null,
      defaultUnit: (current.sourcePayload.defaultUnit as string | undefined) ?? (current.sourcePayload.defaultDisplayUnit as string | undefined) ?? "g",
      defaultDisplayUnit: (current.sourcePayload.defaultDisplayUnit as IngredientCatalogItemDto["defaultDisplayUnit"] | undefined),
      allowedUnits: (current.sourcePayload.allowedUnits as IngredientCatalogItemDto["allowedUnits"] | undefined) ?? undefined,
      measurementDimension: (current.sourcePayload.measurementDimension as IngredientCatalogItemDto["measurementDimension"] | undefined) ?? undefined,
      completenessLevel: (current.sourcePayload.completenessLevel as IngredientCatalogItemDto["completenessLevel"] | undefined) ?? undefined,
      ...proposedTechnicalFields,
      properties: proposedProperties,
      status: "active",
      visibility: "public"
    }, moderatorId);

    await db.update(proposedIngredients).set({
      status: "approved",
      targetIngredientId: created?.id ?? null,
      moderatorId,
      resolutionNote: action.resolutionNote ?? null,
      updatedAt: new Date()
    }).where(eq(proposedIngredients.id, id));

    return { status: "approved", targetIngredientId: created?.id ?? null };
  }

  if (action.action === "merge") {
    if (!action.targetIngredientId) {
      throw new Error("TARGET_REQUIRED");
    }

    await db.update(proposedIngredients).set({
      status: "merged",
      targetIngredientId: action.targetIngredientId,
      moderatorId,
      resolutionNote: action.resolutionNote ?? null,
      updatedAt: new Date()
    }).where(eq(proposedIngredients.id, id));

    return { status: "merged", targetIngredientId: action.targetIngredientId };
  }

  await db.update(proposedIngredients).set({
    status: "rejected",
    moderatorId,
    resolutionNote: action.resolutionNote ?? null,
    updatedAt: new Date()
  }).where(eq(proposedIngredients.id, id));

  return { status: "rejected" };
};

export const mergeDuplicateIngredients = async (sourceIngredientId: string, targetIngredientId: string, actorId: string, note?: string) => {
  validateMergeInput(sourceIngredientId, targetIngredientId);

  const rows = await db.select().from(ingredientCatalogItems).where(inArray(ingredientCatalogItems.id, [sourceIngredientId, targetIngredientId]));
  const source = rows.find((r) => r.id === sourceIngredientId);
  const target = rows.find((r) => r.id === targetIngredientId);

  if (!source || !target) {
    throw new Error("NOT_FOUND");
  }

  await db.transaction(async (tx) => {
    await tx.update(ingredientCatalogItems).set({
      status: "merged",
      mergedIntoId: targetIngredientId,
      updatedBy: actorId,
      updatedAt: new Date(),
      description: source.description ? `${source.description}\n\n[merged note] ${note ?? "merged by moderator"}` : `[merged note] ${note ?? "merged by moderator"}`
    }).where(eq(ingredientCatalogItems.id, sourceIngredientId));

    await tx.update(proposedIngredients).set({
      status: "merged",
      targetIngredientId,
      moderatorId: actorId,
      resolutionNote: note ?? "merged into existing ingredient",
      updatedAt: new Date()
    }).where(and(
      eq(proposedIngredients.status, "pending"),
      eq(proposedIngredients.normalizedName, source.normalizedName)
    ));
  });

  return { sourceIngredientId, targetIngredientId };
};
