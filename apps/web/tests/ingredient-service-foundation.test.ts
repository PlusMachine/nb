import { beforeEach, describe, expect, it, vi } from "vitest";

const now = new Date("2026-03-13T10:00:00.000Z");

const { tableRefs, mockState } = vi.hoisted(() => ({
  tableRefs: {
    ingredientFamilies: {
      name: "ingredientFamilies",
      id: "id",
      category: "category",
      subtype: "subtype",
      canonicalName: "canonicalName",
      normalizedCanonicalName: "normalizedCanonicalName",
      displayNameRu: "displayNameRu",
      displayNameEn: "displayNameEn",
      matchPolicy: "matchPolicy",
      isActive: "isActive",
      createdAt: "createdAt",
      updatedAt: "updatedAt"
    },
    ingredientCatalogItems: {
      name: "ingredientCatalogItems",
      id: "id",
      familyId: "familyId",
      type: "type",
      category: "category",
      subtype: "subtype",
      displayName: "displayName",
      normalizedName: "normalizedName",
      aliases: "aliases",
      brandName: "brandName",
      manufacturer: "manufacturer",
      country: "country",
      harvestYear: "harvestYear",
      description: "description",
      defaultUnit: "defaultUnit",
      defaultDisplayUnit: "defaultDisplayUnit",
      allowedUnits: "allowedUnits",
      measurementDimension: "measurementDimension",
      completenessLevel: "completenessLevel",
      technicalData: "technicalData",
      fermentableColorEbc: "fermentableColorEbc",
      fermentableExtractYieldPct: "fermentableExtractYieldPct",
      hopAlphaAcidPct: "hopAlphaAcidPct",
      hopForm: "hopForm",
      hopSeason: "hopSeason",
      yeastAttenuationPct: "yeastAttenuationPct",
      yeastType: "yeastType",
      yeastForm: "yeastForm",
      yeastMinFermentationTempC: "yeastMinFermentationTempC",
      yeastMaxFermentationTempC: "yeastMaxFermentationTempC",
      properties: "properties",
      status: "status",
      visibility: "visibility",
      mergedIntoId: "mergedIntoId",
      createdBy: "createdBy",
      updatedBy: "updatedBy",
      createdAt: "createdAt",
      updatedAt: "updatedAt"
    },
    proposedIngredients: {
      name: "proposedIngredients",
      id: "id",
      status: "status",
      normalizedName: "normalizedName"
    }
  },
  mockState: {
    idCounter: 0,
    families: new Map<string, any>(),
    items: new Map<string, any>()
  }
}));

const getEqValue = (where: unknown, key: string): unknown => {
  if (Array.isArray(where) && where.length === 2 && where[0] === key) {
    return where[1];
  }

  if (!Array.isArray(where)) {
    return undefined;
  }

  for (const entry of where) {
    const value = getEqValue(entry, key);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
};

vi.mock("@nb/db", () => {
  const db: any = {
    query: {
      ingredientFamilies: {
        findFirst: async (arg: any) => {
          const id = getEqValue(arg?.where, "id");
          if (typeof id === "string") {
            return mockState.families.get(id) ?? null;
          }

          const category = getEqValue(arg?.where, "category");
          const normalizedCanonicalName = getEqValue(arg?.where, "normalizedCanonicalName");
          return [...mockState.families.values()].find((family) => (
            family.category === category
            && family.normalizedCanonicalName === normalizedCanonicalName
          )) ?? null;
        }
      },
      proposedIngredients: {
        findFirst: async () => null
      }
    },
    insert: (table: { name: string }) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          const id = table.name === "ingredientFamilies"
            ? `fam-${++mockState.idCounter}`
            : `item-${++mockState.idCounter}`;
          const row = { id, createdAt: now, updatedAt: now, ...values };

          if (table.name === "ingredientFamilies") {
            mockState.families.set(id, row);
          }

          if (table.name === "ingredientCatalogItems") {
            mockState.items.set(id, row);
          }

          return [row];
        }
      })
    }),
    update: (table: { name: string }) => ({
      set: (set: Record<string, unknown>) => ({
        where: (_where: unknown) => ({
          returning: async () => {
            const id = getEqValue(_where, "id");
            if (typeof id !== "string") {
              return [];
            }

            if (table.name === "ingredientFamilies") {
              const current = mockState.families.get(id);
              if (!current) {
                return [];
              }

              const updated = { ...current, ...set };
              mockState.families.set(id, updated);
              return [updated];
            }

            if (table.name === "ingredientCatalogItems") {
              const current = mockState.items.get(id);
              if (!current) {
                return [];
              }

              const updated = { ...current, ...set };
              mockState.items.set(id, updated);
              return [updated];
            }

            return [];
          }
        })
      })
    }),
    select: (shape: Record<string, unknown>) => ({
      from: (table: { name: string }) => ({
        leftJoin: (_joinTable: unknown, _joinCondition: unknown) => ({
          where: (_where: unknown) => ({
            limit: async (_limit: number) => {
              if (table.name !== "ingredientCatalogItems" || !("item" in shape) || !("family" in shape)) {
                return [];
              }

              const id = getEqValue(_where, "id");
              const rows = [...mockState.items.values()]
                .filter((item) => (typeof id === "string" ? item.id === id : true))
                .map((item) => ({
                  item,
                  family: mockState.families.get(item.familyId) ?? null
                }));

              return rows;
            }
          })
        })
      })
    }),
    transaction: async (fn: (tx: any) => Promise<unknown>) => fn(db)
  };

  return {
    db,
    and: (...args: unknown[]) => args,
    asc: (value: unknown) => value,
    desc: (value: unknown) => value,
    eq: (field: string, value: unknown) => [field, value],
    ilike: (...args: unknown[]) => args,
    inArray: (...args: unknown[]) => args,
    or: (...args: unknown[]) => args,
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    ingredientFamilies: tableRefs.ingredientFamilies,
    ingredientCatalogItems: tableRefs.ingredientCatalogItems,
    proposedIngredients: tableRefs.proposedIngredients
  };
});

import { createIngredient, updateIngredient } from "../features/ingredients/service";

describe("ingredient family foundation service", () => {
  beforeEach(() => {
    mockState.idCounter = 0;
    mockState.families.clear();
    mockState.items.clear();
  });

  it("creates a family and links the variant to it", async () => {
    const created = await createIngredient({
      type: "hop",
      displayName: "Cascade",
      aliases: [],
      defaultUnit: "g",
      hopAlphaAcidPct: 5.8,
      hopForm: "pellet",
      properties: {}
    }, "admin-1");

    expect(created?.family).toMatchObject({
      canonicalName: "Cascade",
      category: "hop",
      matchPolicy: "family_compatible"
    });
    expect(created?.familyId).toBe(created?.family?.id);
    expect(mockState.families.size).toBe(1);
    expect(created?.technicalData).toMatchObject({
      category: "hop",
      subtype: "pellet",
      alphaAcidPct: 5.8
    });
  });

  it("reuses the same canonical family for identical category + normalized name", async () => {
    const first = await createIngredient({
      type: "hop",
      displayName: "Cascade",
      aliases: [],
      defaultUnit: "g",
      hopAlphaAcidPct: 5.8,
      hopForm: "pellet",
      properties: {}
    }, "admin-1");

    const second = await createIngredient({
      type: "hop",
      displayName: "Cascade",
      aliases: ["Cascade T-90"],
      defaultUnit: "g",
      hopAlphaAcidPct: 6.1,
      hopForm: "whole_cone",
      manufacturer: "Other Farm",
      properties: {}
    }, "admin-2");

    expect(mockState.families.size).toBe(1);
    expect(second?.familyId).toBe(first?.familyId);
  });

  it("defaults yeast families to exact_only match policy", async () => {
    const created = await createIngredient({
      type: "yeast",
      displayName: "SafAle US-05",
      aliases: [],
      defaultUnit: "pack",
      yeastAttenuationPct: 78,
      yeastForm: "dry",
      properties: {}
    }, "admin-1");

    expect(created?.family?.matchPolicy).toBe("exact_only");
  });

  it("supports typed technicalData input and keeps legacy properties synchronized", async () => {
    const created = await createIngredient({
      category: "hop",
      subtype: "pellet",
      displayName: "Citra",
      aliases: [],
      defaultDisplayUnit: "g",
      country: "US",
      technicalData: {
        category: "hop",
        subtype: "pellet",
        alphaAcidPct: 12.4,
        betaAcidPct: 4.1,
        totalOilMlPer100g: 2.2,
        notes: "Citrus and tropical",
        harvestYear: 2024
      },
      properties: {}
    }, "admin-1");

    expect(created?.technicalData).toMatchObject({
      category: "hop",
      subtype: "pellet",
      alphaAcidPct: 12.4,
      harvestYear: 2024
    });
    expect(mockState.items.get(created!.id)?.properties).toMatchObject({
      alphaAcid: 12.4,
      alphaAcidPercent: 12.4,
      betaAcid: 4.1,
      totalOil: 2.2,
      season: "2024"
    });
  });

  it("persists completeness level and keeps variant linked after update", async () => {
    const created = await createIngredient({
      type: "hop",
      displayName: "Mosaic",
      aliases: [],
      defaultUnit: "g",
      hopAlphaAcidPct: 12,
      hopForm: "pellet",
      completenessLevel: "full",
      properties: {}
    }, "admin-1");

    const updated = await updateIngredient(created!.id, {
      type: "hop",
      displayName: "Mosaic T-90",
      canonicalFamilyName: "Mosaic",
      aliases: [],
      defaultUnit: "g",
      hopAlphaAcidPct: 12.5,
      hopForm: "pellet",
      completenessLevel: "full",
      properties: {}
    }, "admin-2");

    expect(updated?.family?.canonicalName).toBe("Mosaic");
    expect(updated?.familyId).toBe(created?.familyId);
    expect(updated?.completenessLevel).toBe("full");
    expect(mockState.items.get(created!.id)?.completenessLevel).toBe("full");
  });

  it("computes recommended completeness from category-specific recommended fields", async () => {
    const fermentable = await createIngredient({
      category: "fermentable",
      subtype: "base_malt",
      displayName: "Vienna Malt",
      aliases: [],
      defaultDisplayUnit: "kg",
      manufacturer: "BESTMALZ",
      country: "DE",
      fermentableColorEbc: 8,
      fermentableExtractYieldPct: 80,
      properties: {}
    }, "admin-1");

    const yeast = await createIngredient({
      category: "yeast",
      subtype: "ale",
      displayName: "US-05",
      aliases: [],
      defaultDisplayUnit: "pack",
      yeastForm: "dry",
      yeastAttenuationPct: 78,
      yeastMinFermentationTempC: 18,
      yeastMaxFermentationTempC: 22,
      properties: {}
    }, "admin-2");

    expect(fermentable?.completenessLevel).toBe("recommended");
    expect(yeast?.completenessLevel).toBe("recommended");
  });
});
