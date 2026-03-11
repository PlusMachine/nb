import { and, asc, db, desc, eq, ilike, inArray, ingredientCatalogItems, or, proposedIngredients, sql } from "@nb/db";

import { ingredientSearchQuerySchema, ingredientUpsertSchema, type IngredientSuggestionItem, moderationActionSchema } from "./contracts";
import { normalizeAliasList, normalizeIngredientName } from "./normalization";
import { scoreIngredientCandidate } from "./ranking";
import { canModerateTransition, validateMergeInput } from "./workflows";

type SearchParams = { q: string; type?: string; limit?: number };

export const searchIngredientSuggestions = async (params: SearchParams): Promise<IngredientSuggestionItem[]> => {
  const query = ingredientSearchQuerySchema.parse(params);
  const normalized = normalizeIngredientName(query.q);
  const likeQ = `%${query.q.trim()}%`;

  const rows = await db
    .select({
      id: ingredientCatalogItems.id,
      type: ingredientCatalogItems.type,
      displayName: ingredientCatalogItems.displayName,
      manufacturer: ingredientCatalogItems.manufacturer,
      normalizedName: ingredientCatalogItems.normalizedName,
      aliases: ingredientCatalogItems.aliases,
      score: sql<number>`greatest(
        similarity(${ingredientCatalogItems.displayName}, ${query.q}),
        similarity(${ingredientCatalogItems.normalizedName}, ${normalized}),
        similarity(coalesce(${ingredientCatalogItems.manufacturer}, ''), ${query.q})
      )`
    })
    .from(ingredientCatalogItems)
    .where(and(
      eq(ingredientCatalogItems.status, "active"),
      query.type ? eq(ingredientCatalogItems.type, query.type as never) : undefined,
      or(
        ilike(ingredientCatalogItems.displayName, likeQ),
        ilike(ingredientCatalogItems.normalizedName, `%${normalized}%`),
        ilike(sql<string>`coalesce(${ingredientCatalogItems.manufacturer}, '')`, likeQ),
        sql<boolean>`exists (
          select 1
          from jsonb_array_elements_text(${ingredientCatalogItems.aliases}) as alias
          where alias ilike ${`%${normalized}%`}
             or similarity(alias, ${normalized}) > 0.35
        )`,
        sql<boolean>`similarity(${ingredientCatalogItems.displayName}, ${query.q}) > 0.25`,
        sql<boolean>`similarity(${ingredientCatalogItems.normalizedName}, ${normalized}) > 0.25`
      )
    ))
    .orderBy(desc(sql`score`), asc(ingredientCatalogItems.displayName))
    .limit(query.limit);

  return rows
    .map((row) => ({
      id: row.id,
      type: row.type,
      displayName: row.displayName,
      subtitle: row.manufacturer ? `${row.type} · ${row.manufacturer}` : row.type,
      manufacturer: row.manufacturer ?? undefined,
      source: "catalog" as const,
      rankScore: scoreIngredientCandidate(query.q, {
        displayName: row.displayName,
        normalizedName: row.normalizedName,
        aliases: row.aliases
      }) + (row.score * 10)
    }))
    .sort((a, b) => b.rankScore - a.rankScore)
    .map(({ rankScore, ...item }) => item);
};

export const listCatalogIngredients = async (params: {
  page?: number;
  pageSize?: number;
  q?: string;
  type?: string;
  status?: "draft" | "active" | "archived" | "merged";
}) => {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 20));
  const normalized = params.q ? normalizeIngredientName(params.q) : undefined;

  const where = and(
    params.type ? eq(ingredientCatalogItems.type, params.type as never) : undefined,
    params.status ? eq(ingredientCatalogItems.status, params.status) : undefined,
    params.q ? or(
      ilike(ingredientCatalogItems.displayName, `%${params.q}%`),
      ilike(ingredientCatalogItems.normalizedName, `%${normalized}%`),
      sql<boolean>`exists (
        select 1 from jsonb_array_elements_text(${ingredientCatalogItems.aliases}) as alias
        where alias ilike ${`%${normalized}%`}
      )`
    ) : undefined
  );

  const [rows, countRows] = await Promise.all([
    db.select().from(ingredientCatalogItems).where(where).orderBy(desc(ingredientCatalogItems.updatedAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(ingredientCatalogItems).where(where)
  ]);

  return {
    items: rows,
    page,
    pageSize,
    total: countRows[0]?.count ?? 0
  };
};

export const getIngredientById = async (id: string) => {
  const row = await db.query.ingredientCatalogItems.findFirst({ where: eq(ingredientCatalogItems.id, id) });
  return row ?? null;
};

export const createIngredient = async (payload: unknown, actorId?: string) => {
  const parsed = ingredientUpsertSchema.parse(payload);
  const normalizedName = normalizeIngredientName(parsed.displayName);
  const normalizedAliases = normalizeAliasList(parsed.aliases);

  const [created] = await db.insert(ingredientCatalogItems).values({
    ...parsed,
    subtype: parsed.subtype ?? null,
    manufacturer: parsed.manufacturer ?? null,
    country: parsed.country ?? null,
    description: parsed.description ?? null,
    normalizedName,
    aliases: normalizedAliases,
    createdBy: actorId,
    updatedBy: actorId
  }).returning();

  return created;
};

export const updateIngredient = async (id: string, payload: unknown, actorId?: string) => {
  const parsed = ingredientUpsertSchema.parse(payload);
  const normalizedName = normalizeIngredientName(parsed.displayName);
  const normalizedAliases = normalizeAliasList(parsed.aliases);

  const [updated] = await db.update(ingredientCatalogItems).set({
    ...parsed,
    subtype: parsed.subtype ?? null,
    manufacturer: parsed.manufacturer ?? null,
    country: parsed.country ?? null,
    description: parsed.description ?? null,
    normalizedName,
    aliases: normalizedAliases,
    updatedBy: actorId,
    updatedAt: new Date()
  }).where(eq(ingredientCatalogItems.id, id)).returning();

  return updated ?? null;
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
    const created = await createIngredient({
      type: (current.sourcePayload.type as string) ?? "misc",
      subtype: (current.sourcePayload.subtype as string | undefined) ?? null,
      displayName: current.sourceDisplayName,
      aliases: (current.sourcePayload.aliases as string[] | undefined) ?? [],
      manufacturer: (current.sourcePayload.manufacturer as string | undefined) ?? null,
      country: (current.sourcePayload.country as string | undefined) ?? null,
      description: (current.sourcePayload.description as string | undefined) ?? null,
      defaultUnit: (current.sourcePayload.defaultUnit as string | undefined) ?? "g",
      properties: (current.sourcePayload.properties as Record<string, unknown> | undefined) ?? {},
      status: "active",
      visibility: "public"
    }, moderatorId);

    await db.update(proposedIngredients).set({
      status: "approved",
      targetIngredientId: created.id,
      moderatorId,
      resolutionNote: action.resolutionNote ?? null,
      updatedAt: new Date()
    }).where(eq(proposedIngredients.id, id));

    return { status: "approved", targetIngredientId: created.id };
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
