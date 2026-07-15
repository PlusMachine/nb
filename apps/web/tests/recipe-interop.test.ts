import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { RecipeDetailDto } from "../features/recipes/contracts";
import { buildBrewPlanSnapshot } from "../features/brew-batches/brew-plan";
import {
  exportRecipeToBeerXml,
  importBeerXmlToCanonicalRecipe
} from "../features/recipes/interop/beerxml";
import {
  importBrewfatherJsonToCanonicalRecipe
} from "../features/recipes/interop/brewfather-json";

const readImportExample = (fileName: string) => (
  readFileSync(new URL(`../../../ingredients/examples_for_import/${fileName}`, import.meta.url), "utf8")
);

const beerXmlExamples = [
  ["apa_sunset_trail.checked.beerxml", "Sunset Trail APA"],
  ["dubbel_abbey_lantern.checked.beerxml", "Abbey Lantern Dubbel"],
  ["neipa_hazy_orbit.checked.beerxml", "Hazy Orbit NEIPA"]
] as const;

const brewfatherJsonExamples = [
  ["apa_sunset_trail.checked.brewfather.json", "Sunset Trail APA"],
  ["dubbel_abbey_lantern.checked.brewfather.json", "Abbey Lantern Dubbel"],
  ["neipa_hazy_orbit.checked.brewfather.json", "Hazy Orbit NEIPA"]
] as const;

const sampleRecipe = {
  id: "00000000-0000-4000-8000-000000000001",
  authorId: "00000000-0000-4000-8000-000000000002",
  recipeFamilyId: "00000000-0000-4000-8000-000000000003",
  versionNumber: 1,
  versionCount: 1,
  publicationState: "private",
  hiddenAt: null,
  hiddenReason: null,
  title: "Interop IPA",
  slug: "interop-ipa",
  styleId: null,
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 75,
  boilTimeMinutes: 60,
  og: 1.052,
  fg: 1.012,
  abv: 5.2,
  ibu: 42,
  color: 8,
  description: null,
  authorNotes: null,
  authorDisplayName: null,
  processMeta: {
    mashProfile: {
      steps: [{ id: "mash-1", name: "Main mash", temperatureC: 67, durationMinutes: 60 }]
    },
    fermentationProfile: {
      primaryTemperatureC: 19,
      primaryDurationDays: 10,
      extraSteps: [],
      coldCrash: { enabled: false, temperatureC: 2, durationDays: 2 },
      conditioning: { enabled: false, temperatureC: 12, durationDays: 14 }
    }
  },
  calculationMeta: { bitternessFormula: "tinseth_whirlpool_v2", bitternessSettings: {} },
  draftState: null,
  importMeta: null,
  equipmentProfileId: null,
  equipmentProfileSnapshot: null,
  waterPlanMeta: null,
  brewPlanMeta: null,
  heroImageId: null,
  rating: null,
  versions: [],
  ingredients: [
    {
      id: "00000000-0000-4000-8000-000000000011",
      recipeId: "00000000-0000-4000-8000-000000000001",
      persistentKey: "00000000-0000-4000-8000-000000000111",
      displayOrder: 0,
      ingredientCatalogItemId: "malt-1",
      userCustomIngredientId: null,
      type: "malt",
      ingredientCategory: "fermentable",
      ingredientSubtype: "malt",
      ingredientFamilyId: null,
      ingredientDisplayName: "Pale Malt",
      ingredientDisplayNameRu: null,
      ingredientDisplayNameEn: "Pale Malt",
      ingredientDisplayNameSnapshot: "Pale Malt",
      ingredientFamilyDisplayName: null,
      ingredientSummary: null,
      ingredientDefaultDisplayUnit: "kg",
      ingredientDefaultDisplayUnitSnapshot: "kg",
      ingredientAllowedUnits: ["g", "kg", "oz", "lb"],
      ingredientMeasurementDimension: "weight",
      ingredientMeasurementDimensionSnapshot: "weight",
      ingredientTechnicalData: {
        type: "malt",
        extractPctDryBasis: 80,
        colorEbcMin: 3.94,
        colorEbcMax: 3.94,
        colorLovibond: 2
      },
      amountEnteredQuantity: 4,
      amountEnteredUnit: "kg",
      amountNormalizedQuantity: 4000,
      amountNormalizedUnit: "g",
      stage: "mash",
      timeOffset: null,
      stepMeta: null,
      inventoryIntentMode: "catalog",
      inventorySelectionMeta: null,
      externalImportMeta: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    },
    {
      id: "00000000-0000-4000-8000-000000000012",
      recipeId: "00000000-0000-4000-8000-000000000001",
      persistentKey: "00000000-0000-4000-8000-000000000112",
      displayOrder: 1,
      ingredientCatalogItemId: "hop-1",
      userCustomIngredientId: null,
      type: "hop",
      ingredientCategory: "hop",
      ingredientSubtype: "hop",
      ingredientFamilyId: null,
      ingredientDisplayName: "Cascade",
      ingredientDisplayNameRu: null,
      ingredientDisplayNameEn: "Cascade",
      ingredientDisplayNameSnapshot: "Cascade",
      ingredientFamilyDisplayName: null,
      ingredientSummary: null,
      ingredientDefaultDisplayUnit: "g",
      ingredientDefaultDisplayUnitSnapshot: "g",
      ingredientAllowedUnits: ["g", "kg", "oz", "lb"],
      ingredientMeasurementDimension: "weight",
      ingredientMeasurementDimensionSnapshot: "weight",
      ingredientTechnicalData: {
        type: "hop",
        alphaAcidPctTypical: 6.5,
        hopForm: "pellet"
      },
      amountEnteredQuantity: 50,
      amountEnteredUnit: "g",
      amountNormalizedQuantity: 50,
      amountNormalizedUnit: "g",
      stage: "whirlpool",
      timeOffset: 20,
      stepMeta: { useType: "whirlpool", timeMinutes: 20, temperatureC: 85 },
      inventoryIntentMode: "catalog",
      inventorySelectionMeta: null,
      externalImportMeta: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    },
    {
      id: "00000000-0000-4000-8000-000000000013",
      recipeId: "00000000-0000-4000-8000-000000000001",
      persistentKey: "00000000-0000-4000-8000-000000000113",
      displayOrder: 2,
      ingredientCatalogItemId: "yeast-1",
      userCustomIngredientId: null,
      type: "yeast",
      ingredientCategory: "yeast",
      ingredientSubtype: "yeast",
      ingredientFamilyId: null,
      ingredientDisplayName: "US-05",
      ingredientDisplayNameRu: null,
      ingredientDisplayNameEn: "US-05",
      ingredientDisplayNameSnapshot: "US-05",
      ingredientFamilyDisplayName: null,
      ingredientSummary: null,
      ingredientDefaultDisplayUnit: "g",
      ingredientDefaultDisplayUnitSnapshot: "g",
      ingredientAllowedUnits: ["g", "kg", "oz", "lb", "pack"],
      ingredientMeasurementDimension: "weight",
      ingredientMeasurementDimensionSnapshot: "weight",
      ingredientTechnicalData: {
        type: "yeast",
        attenuationPctTypical: 78,
        form: "dry"
      },
      amountEnteredQuantity: 11.5,
      amountEnteredUnit: "g",
      amountNormalizedQuantity: 11.5,
      amountNormalizedUnit: "g",
      stage: "fermentation",
      timeOffset: null,
      stepMeta: null,
      inventoryIntentMode: "catalog",
      inventorySelectionMeta: null,
      externalImportMeta: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    }

  ],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  completedBrewCount: 0
} satisfies RecipeDetailDto;

describe("recipe interop and brew plan foundation", () => {
  it("exports and imports a BeerXML-compatible recipe shell", () => {
    const beerXml = exportRecipeToBeerXml(sampleRecipe);
    const imported = importBeerXmlToCanonicalRecipe(beerXml);

    expect(beerXml).toContain("<RECIPES>");
    expect(beerXml).toContain("<OG>1.052</OG>");
    expect(beerXml).toContain("<FG>1.012</FG>");
    expect(beerXml).toContain("<IBU>42</IBU>");
    expect(beerXml).toContain("<IBU_METHOD>Tinseth Whirlpool v2</IBU_METHOD>");
    expect(beerXml).toContain("<COLOR>8</COLOR>");
    expect(beerXml).toContain("<ABV>5.2</ABV>");
    expect(beerXml).toContain("<ALPHA>6.5</ALPHA>");
    expect(beerXml).toContain("<YIELD>80</YIELD>");
    expect(beerXml).toContain("<FORM>Pellet</FORM>");
    expect(beerXml).toContain("<ATTENUATION>78</ATTENUATION>");
    expect(beerXml).toContain("<MASH_STEP>");
    expect(imported.title).toBe("Interop IPA");
    expect(imported.calculationMeta).toMatchObject({
      bitternessFormula: "tinseth_whirlpool_v2",
      bitternessSettings: {}
    });
    expect(imported.importMeta).toMatchObject({
      importedFormulaPreference: "tinseth_whirlpool_v2",
      rawIbuMethod: "Tinseth Whirlpool v2"
    });
    const importedMalt = imported.ingredients.find((ingredient) => ingredient.name === "Pale Malt");
    const importedHop = imported.ingredients.find((ingredient) => ingredient.name === "Cascade");
    const importedYeast = imported.ingredients.find((ingredient) => ingredient.name === "US-05");
    const processMeta = imported.processMeta as { mashProfile?: { steps?: Array<Record<string, unknown>> } } | null;
    expect(importedMalt).toMatchObject({
      category: "fermentable",
      fermentableExtractYieldPct: 80,
      fermentableColorEbc: 3.94
    });
    expect(importedHop).toMatchObject({
      category: "hop",
      hopAlphaAcidPct: 6.5,
      hopForm: "pellet"
    });
    expect(importedYeast).toMatchObject({
      category: "yeast",
      yeastAttenuationPct: 78,
      yeastForm: "dry"
    });
    expect(processMeta?.mashProfile?.steps?.[0]).toMatchObject({ temperatureC: 67, durationMinutes: 60 });
  });

  it("maps Brewfather JSON beta payload to canonical recipe ingredients", () => {
    const canonical = importBrewfatherJsonToCanonicalRecipe({
      name: "Brewfather IPA",
      batchSize: 19,
      boilTime: 60,
      ibuFormula: "Tinseth",
      fermentables: [{ id: "f1", name: "Pilsner", type: "Grain", amount: 4.5, lovibond: 2.1, yield: 81 }],
      hops: [{ id: "h1", name: "Citra", amount: 80, use: "Whirlpool", type: "Pellet", alpha: 12.5, time: 20, temp: 82 }],
      yeasts: [{ id: "y1", name: "US-05", amount: 1, form: "Dry", attenuation: 78 }],
      mash: {
        steps: [{ name: "Saccharification", stepTemp: 66, stepTime: 60 }]
      }
    });

    expect(canonical.importMeta?.source).toBe("brewfather_json_beta");
    expect(canonical.calculationMeta).toMatchObject({
      bitternessFormula: "tinseth_whirlpool_v2",
      bitternessSettings: {}
    });
    expect(canonical.ingredients).toHaveLength(3);
    expect(canonical.ingredients.find((ingredient) => ingredient.name === "Citra")).toMatchObject({
      category: "hop",
      stage: "whirlpool",
      hopAlphaAcidPct: 12.5,
      hopForm: "pellet",
      stepMeta: { useType: "whirlpool", temperatureC: 82 }
    });
    expect(canonical.ingredients.find((ingredient) => ingredient.name === "Pilsner")).toMatchObject({
      category: "fermentable",
      fermentableExtractYieldPct: 81
    });
    expect(canonical.processMeta).toMatchObject({
      mashProfile: {
        steps: [{ temperatureC: 66, durationMinutes: 60 }]
      }
    });
  });

  it.each(beerXmlExamples)("imports BeerXML example %s", (fileName, expectedTitle) => {
    const canonical = importBeerXmlToCanonicalRecipe(readImportExample(fileName));

    expect(canonical.title).toBe(expectedTitle);
    expect(canonical.ingredients.length).toBeGreaterThan(0);
    expect(canonical.ingredients.every((ingredient) => ingredient.amount > 0)).toBe(true);
    expect(canonical.ingredients.some((ingredient) => ingredient.category === "fermentable")).toBe(true);
    expect(canonical.ingredients.some((ingredient) => ingredient.category === "hop")).toBe(true);
    expect(canonical.ingredients.some((ingredient) => ingredient.category === "yeast")).toBe(true);
    expect(canonical.ingredients.some((ingredient) => ingredient.category === "consumable")).toBe(true);
    const fermentable = canonical.ingredients.find((ingredient) => ingredient.category === "fermentable");
    const hop = canonical.ingredients.find((ingredient) => ingredient.category === "hop");
    const processMeta = canonical.processMeta as { mashProfile?: { steps?: Array<Record<string, unknown>> } } | null;
    expect(fermentable?.fermentableColorEbc).toBeGreaterThan(0);
    expect(fermentable?.fermentableExtractYieldPct).toBeGreaterThan(0);
    expect(hop?.hopAlphaAcidPct).toBeGreaterThan(0);
    expect(hop?.hopForm).toBe("pellet");
    expect(processMeta?.mashProfile?.steps?.length).toBeGreaterThan(0);
    const yeast = canonical.ingredients.find((ingredient) => ingredient.category === "yeast");
    expect(yeast?.unit === "g" || yeast?.unit === "pack").toBe(true);
    if (yeast?.unit === "pack") {
      expect(yeast.amount).toBeGreaterThanOrEqual(1);
    }
  });

  it.each(brewfatherJsonExamples)("imports Brewfather JSON example %s", (fileName, expectedTitle) => {
    const canonical = importBrewfatherJsonToCanonicalRecipe(JSON.parse(readImportExample(fileName)));

    expect(canonical.title).toBe(expectedTitle);
    expect(canonical.ingredients.length).toBeGreaterThan(0);
    expect(canonical.ingredients.every((ingredient) => ingredient.amount > 0)).toBe(true);
    expect(canonical.ingredients.some((ingredient) => ingredient.category === "fermentable")).toBe(true);
    expect(canonical.ingredients.some((ingredient) => ingredient.category === "hop")).toBe(true);
    expect(canonical.ingredients.some((ingredient) => ingredient.category === "yeast")).toBe(true);
    expect(canonical.ingredients.some((ingredient) => ingredient.category === "consumable")).toBe(true);
    const fermentable = canonical.ingredients.find((ingredient) => ingredient.category === "fermentable");
    const hop = canonical.ingredients.find((ingredient) => ingredient.category === "hop");
    const processMeta = canonical.processMeta as { mashProfile?: { steps?: Array<Record<string, unknown>> } } | null;
    expect(fermentable?.fermentableColorEbc).toBeGreaterThan(0);
    expect(hop?.hopAlphaAcidPct).toBeGreaterThan(0);
    expect(hop?.hopForm).toBe("pellet");
    expect(processMeta?.mashProfile?.steps?.length).toBeGreaterThan(0);
    expect(canonical.calculationMeta).toMatchObject({
      bitternessFormula: "tinseth_whirlpool_v2",
      bitternessSettings: {}
    });
    expect(canonical.importMeta).toMatchObject({
      source: "brewfather_json_beta",
      importedFormulaPreference: "tinseth"
    });
  });

  it("reports invalid interop payloads with explicit errors", () => {
    expect(() => importBeerXmlToCanonicalRecipe("not xml")).toThrow("INVALID_BEERXML");
    expect(() => importBeerXmlToCanonicalRecipe("")).toThrow("EMPTY_BEERXML");
    expect(() => importBrewfatherJsonToCanonicalRecipe({ foo: "bar" })).toThrow("INVALID_BREWFATHER_JSON");
  });

  it("builds brewPlanSnapshot from recipe process and stable recipe line identities", () => {
    const snapshot = buildBrewPlanSnapshot(sampleRecipe);

    expect(snapshot.version).toBe("brew_plan_v1");
    expect(snapshot.recipe.batchSizeL).toBe(20);
    expect(snapshot.mashSteps[0]).toMatchObject({ targetTemperatureC: 67, durationMinutes: 60 });
    expect(snapshot.whirlpoolPlan[0]).toMatchObject({
      linePersistentKey: "00000000-0000-4000-8000-000000000112",
      stage: "whirlpool"
    });
    // Единственный fermentation-ингредиент образца — дрожжи US-05: питчинг уже
    // покрыт шагом "Поставить на брожение", отдельной addition-строки для него
    // в dryHopPlan быть не должно.
    expect(snapshot.dryHopPlan).toEqual([]);
  });

  it("collects non-yeast fermentation-stage ingredients (dry hop and others) into dryHopPlan", () => {
    const withDryHop: RecipeDetailDto = {
      ...sampleRecipe,
      ingredients: [
        ...sampleRecipe.ingredients,
        {
          id: "00000000-0000-4000-8000-000000000014",
          recipeId: sampleRecipe.id,
          persistentKey: "00000000-0000-4000-8000-000000000114",
          displayOrder: 3,
          ingredientCatalogItemId: "hop-2",
          userCustomIngredientId: null,
          type: "hop",
          ingredientCategory: "hop",
          ingredientSubtype: "hop",
          ingredientFamilyId: null,
          ingredientDisplayName: "Citra",
          ingredientDisplayNameRu: null,
          ingredientDisplayNameEn: "Citra",
          ingredientDisplayNameSnapshot: "Citra",
          ingredientFamilyDisplayName: null,
          ingredientSummary: null,
          ingredientDefaultDisplayUnit: "g",
          ingredientDefaultDisplayUnitSnapshot: "g",
          ingredientAllowedUnits: ["g", "kg", "oz", "lb"],
          ingredientMeasurementDimension: "weight",
          ingredientMeasurementDimensionSnapshot: "weight",
          ingredientTechnicalData: { type: "hop", alphaAcidPctTypical: 12, hopForm: "pellet" },
          amountEnteredQuantity: 60,
          amountEnteredUnit: "g",
          amountNormalizedQuantity: 60,
          amountNormalizedUnit: "g",
          stage: "fermentation",
          timeOffset: null,
          stepMeta: { useType: "dry_hop", durationDays: 4 },
          inventoryIntentMode: "catalog",
          inventorySelectionMeta: null,
          externalImportMeta: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        }
      ]
    };

    const snapshot = buildBrewPlanSnapshot(withDryHop);
    expect(snapshot.dryHopPlan).toHaveLength(1);
    expect(snapshot.dryHopPlan[0]).toMatchObject({
      linePersistentKey: "00000000-0000-4000-8000-000000000114",
      name: "Citra",
      category: "hop",
      stage: "fermentation"
    });
  });

  it("computes waterSchedule from the recipe's water engine when water setup is enabled", () => {
    const withWater: RecipeDetailDto = {
      ...sampleRecipe,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "balanced_default",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfile: { ca: 5, mg: 2, na: 5, cl: 10, so4: 10, hco3: 20, ph: null },
        targetProfileMode: "manual",
        targetProfile: { ca: 100, mg: 10, na: 10, cl: 60, so4: 150, hco3: 40, ph: null },
        showWaterAdditivesInIngredients: false,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: 5.4,
        spargeAcidificationEnabled: false,
        selectedAcid: "lactic_acid"
      }
    };

    const snapshot = buildBrewPlanSnapshot(withWater);
    expect(snapshot.waterSchedule).not.toBeNull();
    expect(snapshot.waterSchedule?.targetMashPh).toBe(5.4);
    expect(snapshot.waterSchedule?.mashSalts.length).toBeGreaterThan(0);
    for (const salt of snapshot.waterSchedule?.mashSalts ?? []) {
      expect(salt.grams).toBeGreaterThan(0);
      expect(typeof salt.label).toBe("string");
    }
    // Целевой профиль требует больше сульфата/хлорида, чем в исходной воде — движок
    // должен насчитать кислоту, чтобы удержать pH затора у цели 5.4.
    expect(snapshot.waterSchedule?.mashAcid).not.toBeNull();
    expect(snapshot.waterSchedule?.mashAcid?.ml).toBeGreaterThan(0);
  });

  it("leaves waterSchedule null when the recipe has no water setup enabled", () => {
    const snapshot = buildBrewPlanSnapshot(sampleRecipe);
    expect(snapshot.waterSchedule).toBeNull();
  });

  it("sums grainBillTotalKg from mash-stage fermentables only, excluding boil-stage sugar and steeped (use=steep) fermentables (Ф10)", () => {
    const withMixedFermentables: RecipeDetailDto = {
      ...sampleRecipe,
      ingredients: [
        // sampleRecipe.ingredients[0] is "Pale Malt", 4000 g, stage "mash", stepMeta null → counted.
        ...sampleRecipe.ingredients,
        {
          id: "00000000-0000-4000-8000-000000000015",
          recipeId: sampleRecipe.id,
          persistentKey: "00000000-0000-4000-8000-000000000115",
          displayOrder: 4,
          ingredientCatalogItemId: "sugar-1",
          userCustomIngredientId: null,
          type: "fermentable",
          ingredientCategory: "fermentable",
          ingredientSubtype: "fermentable",
          ingredientFamilyId: null,
          ingredientDisplayName: "Декстроза",
          ingredientDisplayNameRu: null,
          ingredientDisplayNameEn: "Dextrose",
          ingredientDisplayNameSnapshot: "Dextrose",
          ingredientFamilyDisplayName: null,
          ingredientSummary: null,
          ingredientDefaultDisplayUnit: "g",
          ingredientDefaultDisplayUnitSnapshot: "g",
          ingredientAllowedUnits: ["g", "kg"],
          ingredientMeasurementDimension: "weight",
          ingredientMeasurementDimensionSnapshot: "weight",
          ingredientTechnicalData: null,
          amountEnteredQuantity: 500,
          amountEnteredUnit: "g",
          amountNormalizedQuantity: 500,
          amountNormalizedUnit: "g",
          stage: "boil",
          timeOffset: 10,
          stepMeta: null,
          inventoryIntentMode: "catalog",
          inventorySelectionMeta: null,
          externalImportMeta: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        },
        {
          id: "00000000-0000-4000-8000-000000000016",
          recipeId: sampleRecipe.id,
          persistentKey: "00000000-0000-4000-8000-000000000116",
          displayOrder: 5,
          ingredientCatalogItemId: "malt-2",
          userCustomIngredientId: null,
          type: "malt",
          ingredientCategory: "fermentable",
          ingredientSubtype: "malt",
          ingredientFamilyId: null,
          ingredientDisplayName: "Спец. солод (настой)",
          ingredientDisplayNameRu: null,
          ingredientDisplayNameEn: "Special malt (steep)",
          ingredientDisplayNameSnapshot: "Special malt (steep)",
          ingredientFamilyDisplayName: null,
          ingredientSummary: null,
          ingredientDefaultDisplayUnit: "g",
          ingredientDefaultDisplayUnitSnapshot: "g",
          ingredientAllowedUnits: ["g", "kg"],
          ingredientMeasurementDimension: "weight",
          ingredientMeasurementDimensionSnapshot: "weight",
          ingredientTechnicalData: { type: "malt", extractPctDryBasis: 70, colorEbcMin: 100, colorEbcMax: 100, colorLovibond: 50 },
          amountEnteredQuantity: 300,
          amountEnteredUnit: "g",
          amountNormalizedQuantity: 300,
          amountNormalizedUnit: "g",
          stage: "mash",
          timeOffset: null,
          stepMeta: { use: "steep" },
          inventoryIntentMode: "catalog",
          inventorySelectionMeta: null,
          externalImportMeta: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        }
      ]
    };

    const snapshot = buildBrewPlanSnapshot(withMixedFermentables);
    // Только Pale Malt (4 кг, mash, use не задан): кипятильная декстроза и
    // настойный солод (use=steep) в засыпь не входят — у обоих свой шаг "Внести: …".
    expect(snapshot.grainBillTotalKg).toBe(4);
  });
});
