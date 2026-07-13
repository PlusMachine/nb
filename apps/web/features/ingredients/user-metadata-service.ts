import { assertRateLimit } from "@nb/auth";
import {
  and,
  asc,
  db,
  eq,
  inArray,
  ingredients,
  isNull,
  or,
  userCustomIngredients,
  userIngredientPreferences,
  userIngredientPurchaseLinks
} from "@nb/db";

import type {
  IngredientPurchaseLinkDto,
  IngredientPurchaseLinkSummaryDto,
  UserCatalogIngredientDto,
  UserIngredientReference
} from "./contracts";
import {
  PURCHASE_LINK_CREATE_RATE_LIMIT,
  PURCHASE_LINK_CREATE_RATE_WINDOW_SECONDS,
  PURCHASE_LINK_MAX_PER_REFERENCE
} from "./contracts";
import { buildIngredientPurchaseLinkView, normalizeIngredientPurchaseLinkInput } from "./purchase-links";

const buildIngredientReferenceKey = (reference: UserIngredientReference) => `${reference.source}:${reference.id}`;

const resolveIngredientReferenceFromRow = (
  row: Pick<typeof userIngredientPurchaseLinks.$inferSelect, "ingredientCatalogItemId" | "userCustomIngredientId">
): UserIngredientReference => {
  if (row.userCustomIngredientId) {
    return {
      source: "custom",
      id: row.userCustomIngredientId
    };
  }

  return {
    source: "catalog",
    id: row.ingredientCatalogItemId ?? ""
  };
};

const buildPreferenceReferenceWhere = (
  reference: UserIngredientReference
) => (
  reference.source === "catalog"
    ? and(
      eq(userIngredientPreferences.ingredientCatalogItemId, reference.id),
      isNull(userIngredientPreferences.userCustomIngredientId)
    )
    : and(
      eq(userIngredientPreferences.userCustomIngredientId, reference.id),
      isNull(userIngredientPreferences.ingredientCatalogItemId)
    )
);

const buildPurchaseLinkReferenceWhere = (
  reference: UserIngredientReference
) => (
  reference.source === "catalog"
    ? and(
      eq(userIngredientPurchaseLinks.ingredientCatalogItemId, reference.id),
      isNull(userIngredientPurchaseLinks.userCustomIngredientId)
    )
    : and(
      eq(userIngredientPurchaseLinks.userCustomIngredientId, reference.id),
      isNull(userIngredientPurchaseLinks.ingredientCatalogItemId)
    )
);

const assertOwnedCustomIngredientReference = async (userId: string, reference: UserIngredientReference) => {
  if (reference.source !== "custom") {
    return;
  }

  const item = await db.query.userCustomIngredients.findFirst({
    where: and(
      eq(userCustomIngredients.id, reference.id),
      eq(userCustomIngredients.userId, userId)
    )
  });

  if (!item) {
    throw new Error("CUSTOM_INGREDIENT_NOT_FOUND");
  }
};

const listPurchaseLinkRowsForReferences = async (
  userId: string,
  references: UserIngredientReference[]
) => {
  const uniqueReferences = Array.from(new Map(
    references.map((reference) => [buildIngredientReferenceKey(reference), reference])
  ).values());
  const catalogIds = uniqueReferences
    .filter((reference) => reference.source === "catalog")
    .map((reference) => reference.id);
  const customIds = uniqueReferences
    .filter((reference) => reference.source === "custom")
    .map((reference) => reference.id);

  const scope = [
    catalogIds.length > 0 ? inArray(userIngredientPurchaseLinks.ingredientCatalogItemId, catalogIds) : undefined,
    customIds.length > 0 ? inArray(userIngredientPurchaseLinks.userCustomIngredientId, customIds) : undefined
  ].filter(Boolean);

  if (scope.length === 0) {
    return [];
  }

  return db.select()
    .from(userIngredientPurchaseLinks)
    .where(and(
      eq(userIngredientPurchaseLinks.userId, userId),
      or(...scope)
    ))
    .orderBy(
      asc(userIngredientPurchaseLinks.position),
      asc(userIngredientPurchaseLinks.createdAt)
    );
};

export const listIngredientPurchaseLinkSummaries = async (
  userId: string,
  references: UserIngredientReference[]
): Promise<Map<string, IngredientPurchaseLinkSummaryDto>> => {
  const rows = await listPurchaseLinkRowsForReferences(userId, references);
  const summaries = new Map<string, IngredientPurchaseLinkSummaryDto>();

  for (const row of rows) {
    const reference = resolveIngredientReferenceFromRow(row);
    const key = buildIngredientReferenceKey(reference);
    const current = summaries.get(key) ?? {
      count: 0,
      marketplaces: []
    };
    const view = buildIngredientPurchaseLinkView({
      id: row.id,
      url: row.url,
      normalizedUrl: row.normalizedUrl,
      position: row.position
    });

    current.count += 1;
    if (current.marketplaces.length < 3 && !current.marketplaces.includes(view.marketplace)) {
      current.marketplaces.push(view.marketplace);
    }

    summaries.set(key, current);
  }

  return summaries;
};

export const listIngredientPurchaseLinksByReference = async (
  userId: string,
  reference: UserIngredientReference
): Promise<IngredientPurchaseLinkDto[]> => {
  const summaries = await listPurchaseLinkRowsForReferences(userId, [reference]);

  return summaries
    .filter((row) => buildIngredientReferenceKey(resolveIngredientReferenceFromRow(row)) === buildIngredientReferenceKey(reference))
    .map((row) => buildIngredientPurchaseLinkView({
      id: row.id,
      url: row.url,
      normalizedUrl: row.normalizedUrl,
      position: row.position
    }));
};

export const replaceIngredientPurchaseLinksForReference = async (
  userId: string,
  reference: UserIngredientReference,
  urls: string[]
): Promise<IngredientPurchaseLinkDto[]> => {
  await assertOwnedCustomIngredientReference(userId, reference);

  const normalizedUrls = Array.from(new Set(
    urls
      .map((value) => normalizeIngredientPurchaseLinkInput(value))
      .filter((value): value is string => Boolean(value))
  )).slice(0, PURCHASE_LINK_MAX_PER_REFERENCE);

  await db.transaction(async (tx) => {
    await tx.delete(userIngredientPurchaseLinks).where(and(
      eq(userIngredientPurchaseLinks.userId, userId),
      buildPurchaseLinkReferenceWhere(reference)
    ));

    if (normalizedUrls.length === 0) {
      return;
    }

    await tx.insert(userIngredientPurchaseLinks).values(normalizedUrls.map((url, index) => ({
      userId,
      ingredientCatalogItemId: reference.source === "catalog" ? reference.id : null,
      userCustomIngredientId: reference.source === "custom" ? reference.id : null,
      url,
      normalizedUrl: url,
      position: index,
      updatedAt: new Date()
    })));
  });

  return listIngredientPurchaseLinksByReference(userId, reference);
};

export const createIngredientPurchaseLink = async (
  userId: string,
  reference: UserIngredientReference,
  url: string
): Promise<IngredientPurchaseLinkDto> => {
  await assertOwnedCustomIngredientReference(userId, reference);

  const normalizedUrl = normalizeIngredientPurchaseLinkInput(url);
  if (!normalizedUrl) {
    throw new Error("INVALID_PURCHASE_LINK_URL");
  }

  await assertRateLimit(userId, "purchase_link_create", PURCHASE_LINK_CREATE_RATE_LIMIT, PURCHASE_LINK_CREATE_RATE_WINDOW_SECONDS);

  const currentLinks = await listIngredientPurchaseLinksByReference(userId, reference);
  if (currentLinks.length >= PURCHASE_LINK_MAX_PER_REFERENCE) {
    throw new Error("PURCHASE_LINK_QUOTA_REACHED");
  }
  const [created] = await db.insert(userIngredientPurchaseLinks).values({
    userId,
    ingredientCatalogItemId: reference.source === "catalog" ? reference.id : null,
    userCustomIngredientId: reference.source === "custom" ? reference.id : null,
    url: normalizedUrl,
    normalizedUrl,
    position: currentLinks.length,
    updatedAt: new Date()
  }).returning();

  return buildIngredientPurchaseLinkView({
    id: created.id,
    url: created.url,
    normalizedUrl: created.normalizedUrl,
    position: created.position
  });
};

export const updateIngredientPurchaseLink = async (
  userId: string,
  purchaseLinkId: string,
  url: string
): Promise<IngredientPurchaseLinkDto> => {
  const current = await db.query.userIngredientPurchaseLinks.findFirst({
    where: and(
      eq(userIngredientPurchaseLinks.id, purchaseLinkId),
      eq(userIngredientPurchaseLinks.userId, userId)
    )
  });

  if (!current) {
    throw new Error("PURCHASE_LINK_NOT_FOUND");
  }

  const normalizedUrl = normalizeIngredientPurchaseLinkInput(url);
  if (!normalizedUrl) {
    throw new Error("INVALID_PURCHASE_LINK_URL");
  }

  const [updated] = await db.update(userIngredientPurchaseLinks).set({
    url: normalizedUrl,
    normalizedUrl,
    updatedAt: new Date()
  }).where(and(
    eq(userIngredientPurchaseLinks.id, purchaseLinkId),
    eq(userIngredientPurchaseLinks.userId, userId)
  )).returning();

  if (!updated) {
    throw new Error("PURCHASE_LINK_NOT_FOUND");
  }

  return buildIngredientPurchaseLinkView({
    id: updated.id,
    url: updated.url,
    normalizedUrl: updated.normalizedUrl,
    position: updated.position
  });
};

export const deleteIngredientPurchaseLink = async (
  userId: string,
  purchaseLinkId: string
): Promise<void> => {
  await db.delete(userIngredientPurchaseLinks).where(and(
    eq(userIngredientPurchaseLinks.id, purchaseLinkId),
    eq(userIngredientPurchaseLinks.userId, userId)
  ));
};

export const listIngredientFavoriteKeys = async (
  userId: string,
  references: UserIngredientReference[]
): Promise<Set<string>> => {
  const uniqueReferences = Array.from(new Map(
    references.map((reference) => [buildIngredientReferenceKey(reference), reference])
  ).values());
  const catalogIds = uniqueReferences
    .filter((reference) => reference.source === "catalog")
    .map((reference) => reference.id);
  const customIds = uniqueReferences
    .filter((reference) => reference.source === "custom")
    .map((reference) => reference.id);
  const scope = [
    catalogIds.length > 0 ? inArray(userIngredientPreferences.ingredientCatalogItemId, catalogIds) : undefined,
    customIds.length > 0 ? inArray(userIngredientPreferences.userCustomIngredientId, customIds) : undefined
  ].filter(Boolean);

  if (scope.length === 0) {
    return new Set();
  }

  const rows = await db.select({
    ingredientCatalogItemId: userIngredientPreferences.ingredientCatalogItemId,
    userCustomIngredientId: userIngredientPreferences.userCustomIngredientId
  }).from(userIngredientPreferences).where(and(
    eq(userIngredientPreferences.userId, userId),
    eq(userIngredientPreferences.isFavorite, true),
    or(...scope)
  ));

  return new Set(rows.map((row) => buildIngredientReferenceKey({
    source: row.userCustomIngredientId ? "custom" : "catalog",
    id: row.userCustomIngredientId ?? row.ingredientCatalogItemId ?? ""
  })));
};

export const applyFavoriteStateToCatalogItems = async (
  userId: string,
  items: UserCatalogIngredientDto[]
): Promise<UserCatalogIngredientDto[]> => {
  const favoriteKeys = await listIngredientFavoriteKeys(userId, items.map((item) => ({
    source: item.source,
    id: item.id
  })));

  return items.map((item) => ({
    ...item,
    isFavorite: favoriteKeys.has(buildIngredientReferenceKey({
      source: item.source,
      id: item.id
    }))
  }));
};

export const setIngredientFavoriteState = async (
  userId: string,
  reference: UserIngredientReference,
  isFavorite: boolean
): Promise<boolean> => {
  await assertOwnedCustomIngredientReference(userId, reference);

  if (!isFavorite) {
    await db.delete(userIngredientPreferences).where(and(
      eq(userIngredientPreferences.userId, userId),
      buildPreferenceReferenceWhere(reference)
    ));

    return false;
  }

  await db.insert(userIngredientPreferences).values({
    userId,
    ingredientCatalogItemId: reference.source === "catalog" ? reference.id : null,
    userCustomIngredientId: reference.source === "custom" ? reference.id : null,
    isFavorite: true,
    updatedAt: new Date()
  }).onConflictDoUpdate({
    target: reference.source === "catalog"
      ? [userIngredientPreferences.userId, userIngredientPreferences.ingredientCatalogItemId]
      : [userIngredientPreferences.userId, userIngredientPreferences.userCustomIngredientId],
    set: {
      isFavorite: true,
      updatedAt: new Date()
    }
  });

  return true;
};
