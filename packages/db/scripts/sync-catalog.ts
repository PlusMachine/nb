import {
  and,
  db,
  eq,
  inArray,
  ingredientCatalogItems,
  ingredientFamilies,
  isNotNull,
  or,
  sql
} from "../src";
import { legacyDevSeedCatalogKeys } from "./legacy-dev-seed-keys";
import { seedCatalogItems } from "./catalog-seed-data";

export type CatalogSyncResult = {
  archivedLegacyCount: number;
  archivedMissingCount: number;
  totalItems: number;
  totalFamilies: number;
  rowsBySourceKey: Map<string, typeof ingredientCatalogItems.$inferSelect>;
};

const syncCatalogSnapshot = async (): Promise<CatalogSyncResult> => {
  const rowsBySourceKey = new Map<string, typeof ingredientCatalogItems.$inferSelect>();
  const familyKeys = new Set<string>();

  for (const item of seedCatalogItems) {
    const [family] = await db.insert(ingredientFamilies).values({
      category: item.category,
      subtype: item.subtype,
      canonicalName: item.family.canonicalName,
      normalizedCanonicalName: item.family.normalizedCanonicalName,
      displayNameRu: item.family.displayNameRu,
      displayNameEn: item.family.displayNameEn,
      matchPolicy: item.family.matchPolicy,
      isActive: true
    }).onConflictDoUpdate({
      target: [ingredientFamilies.category, ingredientFamilies.normalizedCanonicalName],
      set: {
        subtype: item.subtype,
        canonicalName: item.family.canonicalName,
        displayNameRu: item.family.displayNameRu,
        displayNameEn: item.family.displayNameEn,
        matchPolicy: item.family.matchPolicy,
        isActive: true,
        updatedAt: new Date()
      }
    }).returning();

    familyKeys.add(`${item.category}:${item.family.normalizedCanonicalName}`);

    const [catalogItem] = await db.insert(ingredientCatalogItems).values({
      type: item.type,
      category: item.category,
      subtype: item.subtype,
      familyId: family.id,
      displayName: item.displayName,
      displayNameRu: item.displayNameRu,
      displayNameEn: item.displayNameEn,
      normalizedName: item.normalizedName,
      aliases: item.aliases,
      searchAliasesNorm: item.searchAliasesNorm,
      searchTextNorm: item.searchTextNorm,
      brandName: item.brandName,
      manufacturer: item.manufacturer,
      country: item.country,
      catalogSourceDataset: item.sourceDataset,
      catalogSourceKey: item.sourceKey,
      harvestYear: item.harvestYear,
      description: item.description,
      defaultUnit: item.defaultUnit,
      defaultDisplayUnit: item.defaultDisplayUnit,
      allowedUnits: item.allowedUnits,
      measurementDimension: item.measurementDimension,
      completenessLevel: item.completenessLevel,
      technicalData: item.technicalData,
      fermentableColorEbc: item.fermentableColorEbc,
      fermentableExtractYieldPct: item.fermentableExtractYieldPct,
      hopAlphaAcidPct: item.hopAlphaAcidPct,
      hopForm: item.hopForm,
      hopSeason: item.hopSeason,
      yeastAttenuationPct: item.yeastAttenuationPct,
      yeastType: item.yeastType,
      yeastForm: item.yeastForm,
      yeastMinFermentationTempC: item.yeastMinFermentationTempC,
      yeastMaxFermentationTempC: item.yeastMaxFermentationTempC,
      properties: item.properties,
      status: "active",
      visibility: "public"
    }).onConflictDoUpdate({
      target: [ingredientCatalogItems.catalogSourceDataset, ingredientCatalogItems.catalogSourceKey],
      set: {
        type: item.type,
        category: item.category,
        subtype: item.subtype,
        familyId: family.id,
        displayName: item.displayName,
        displayNameRu: item.displayNameRu,
        displayNameEn: item.displayNameEn,
        normalizedName: item.normalizedName,
        aliases: item.aliases,
        searchAliasesNorm: item.searchAliasesNorm,
        searchTextNorm: item.searchTextNorm,
        brandName: item.brandName,
        manufacturer: item.manufacturer,
        country: item.country,
        harvestYear: item.harvestYear,
        description: item.description,
        defaultUnit: item.defaultUnit,
        defaultDisplayUnit: item.defaultDisplayUnit,
        allowedUnits: item.allowedUnits,
        measurementDimension: item.measurementDimension,
        completenessLevel: item.completenessLevel,
        technicalData: item.technicalData,
        fermentableColorEbc: item.fermentableColorEbc,
        fermentableExtractYieldPct: item.fermentableExtractYieldPct,
        hopAlphaAcidPct: item.hopAlphaAcidPct,
        hopForm: item.hopForm,
        hopSeason: item.hopSeason,
        yeastAttenuationPct: item.yeastAttenuationPct,
        yeastType: item.yeastType,
        yeastForm: item.yeastForm,
        yeastMinFermentationTempC: item.yeastMinFermentationTempC,
        yeastMaxFermentationTempC: item.yeastMaxFermentationTempC,
        properties: item.properties,
        status: "active",
        visibility: "public",
        updatedAt: new Date()
      }
    }).returning();

    rowsBySourceKey.set(item.sourceKey, catalogItem);
  }

  const activeSourceKeys = new Set(seedCatalogItems.map((item) => `${item.sourceDataset}:${item.sourceKey}`));
  const existingSeededRows = await db.select({
    id: ingredientCatalogItems.id,
    sourceDataset: ingredientCatalogItems.catalogSourceDataset,
    sourceKey: ingredientCatalogItems.catalogSourceKey
  }).from(ingredientCatalogItems).where(and(
    isNotNull(ingredientCatalogItems.catalogSourceDataset),
    isNotNull(ingredientCatalogItems.catalogSourceKey)
  ));

  const staleSeededIds = existingSeededRows
    .filter((row) => !activeSourceKeys.has(`${row.sourceDataset}:${row.sourceKey}`))
    .map((row) => row.id);

  if (staleSeededIds.length) {
    await db.update(ingredientCatalogItems).set({
      status: "archived",
      visibility: "internal",
      updatedAt: new Date()
    }).where(inArray(ingredientCatalogItems.id, staleSeededIds));
  }

  const activeNameKeys = new Set(seedCatalogItems.map((item) => `${item.type}:${item.normalizedName}`));
  const staleLegacyKeys = legacyDevSeedCatalogKeys.filter((item) => !activeNameKeys.has(`${item.type}:${item.normalizedName}`));

  if (staleLegacyKeys.length) {
    await db.update(ingredientCatalogItems).set({
      status: "archived",
      visibility: "internal",
      updatedAt: new Date()
    }).where(or(
      ...staleLegacyKeys.map((item) => and(
        eq(ingredientCatalogItems.type, item.type),
        eq(ingredientCatalogItems.normalizedName, item.normalizedName)
      ))
    ));
  }

  await db.execute(sql`
    DELETE FROM "ingredient_families" AS family
    WHERE NOT EXISTS (
      SELECT 1
      FROM "ingredient_catalog_items" AS item
      WHERE item."family_id" = family."id"
    )
  `);

  return {
    archivedLegacyCount: staleLegacyKeys.length,
    archivedMissingCount: staleSeededIds.length,
    totalItems: seedCatalogItems.length,
    totalFamilies: familyKeys.size,
    rowsBySourceKey
  };
};

export { syncCatalogSnapshot };
