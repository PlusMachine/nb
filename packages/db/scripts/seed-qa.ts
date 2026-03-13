import { db, inArray, ingredientCatalogItems, ingredientFamilies, pool, userIngredients, users } from "../src";
import { assertDevOnlyExecution } from "./_dev-utils";
import { seedCatalogItems, seedUsers } from "./qa-seed-data";

const resolveSeedCategory = (item: (typeof seedCatalogItems)[number]) => {
  if (item.type === "fermentable" || item.type === "hop" || item.type === "yeast") {
    return item.type;
  }

  if (item.type === "sugar") {
    return "fermentable" as const;
  }

  if (item.type === "fining") {
    return "misc" as const;
  }

  const displayName = item.displayName.toLowerCase();
  const stage = String(item.properties?.stage ?? "").toLowerCase();

  if (
    item.type === "misc"
    && (stage.includes("water-treatment") || displayName.includes("gypsum") || displayName.includes("chloride") || displayName.includes("epsom") || displayName.includes("acid") || displayName.includes("campden"))
  ) {
    return "water_prep" as const;
  }

  if (item.type === "adjunct" && (displayName.includes("rice hull") || displayName.includes("cocoa") || displayName.includes("peanut") || displayName.includes("coconut"))) {
    return "misc" as const;
  }

  if (item.type === "adjunct") {
    return "fermentable" as const;
  }

  return "misc" as const;
};

const normalizeSeedSubtype = (item: (typeof seedCatalogItems)[number]) => {
  const category = resolveSeedCategory(item);
  const displayName = item.displayName.toLowerCase();
  const subtype = item.subtype?.replace(/-/g, "_");

  if (category === "fermentable") {
    if (subtype === "base_malt" || subtype === "specialty_malt" || subtype === "roasted_malt") {
      return subtype;
    }

    if (subtype === "roasted_grain") {
      return "roasted_malt";
    }

    if (item.type === "sugar") {
      return displayName.includes("honey") || displayName.includes("syrup") || displayName.includes("molasses") || displayName.includes("maple")
        ? "syrup_honey"
        : "sugar";
    }

    if (item.type === "adjunct") {
      return "adjunct_grain";
    }

    return subtype ?? "base_malt";
  }

  if (category === "hop") {
    return item.hopForm ?? subtype ?? null;
  }

  if (category === "yeast") {
    if (displayName.includes("kveik")) return "kveik";
    if (displayName.includes("belg") || displayName.includes("saison")) return "belgian";
    if (displayName.includes("wit") || displayName.includes("wheat")) return "wheat";
    if (item.yeastType === "lager") return "lager";
    if (item.yeastType === "ale") return "ale";
    return subtype ?? "other";
  }

  if (category === "water_prep") {
    if (displayName.includes("acid")) return "acid";
    if (displayName.includes("bicarbonate") || displayName.includes("chalk")) return "base";
    if (displayName.includes("nutrient")) return "nutrient_other";
    return "salt";
  }

  if (item.type === "fining") return "fining";
  if (displayName.includes("nutrient") || displayName.includes("servomyces")) return "nutrient";
  if (displayName.includes("campden") || displayName.includes("metabisulfite")) return "antioxidant";
  if (displayName.includes("rice hull") || displayName.includes("star san")) return "process_aid";
  if (displayName.includes("cocoa") || displayName.includes("peanut") || displayName.includes("coconut")) return "flavoring";
  return subtype ?? "other";
};

const resolveSeedAllowedUnits = (item: (typeof seedCatalogItems)[number], category: ReturnType<typeof resolveSeedCategory>, subtype: ReturnType<typeof normalizeSeedSubtype>) => {
  if (category === "fermentable" || category === "hop") {
    return ["g", "kg", "oz", "lb"] as const;
  }

  if (category === "yeast") {
    return item.yeastForm === "liquid" ? ["pack", "ml"] as const : ["pack", "g"] as const;
  }

  if (category === "water_prep") {
    return subtype === "acid" ? ["ml", "l", "gal"] as const : ["g", "kg", "oz", "lb"] as const;
  }

  if (item.defaultUnit === "g") {
    return ["g", "kg", "oz", "lb"] as const;
  }

  if (item.defaultUnit === "ml") {
    return ["ml", "l", "gal"] as const;
  }

  return ["item", "pack"] as const;
};

const resolveSeedMeasurementDimension = (defaultDisplayUnit: (typeof seedCatalogItems)[number]["defaultUnit"]) => {
  if (defaultDisplayUnit === "g") return "weight" as const;
  if (defaultDisplayUnit === "ml") return "volume" as const;
  return "count" as const;
};

const readSeedNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }

      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
};

const readSeedText = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
};

const readSeedStringArray = (...values: unknown[]) => {
  for (const value of values) {
    if (Array.isArray(value)) {
      const items = value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);

      if (items.length) {
        return items;
      }
    }
  }

  return [];
};

const resolveSeedWaterPrepAcidType = (displayName: string) => {
  const normalized = displayName.toLowerCase();
  if (normalized.includes("lactic")) return "lactic";
  if (normalized.includes("phosphoric")) return "phosphoric";
  if (normalized.includes("citric")) return "citric";
  return displayName;
};

const buildSeedTechnicalData = (
  item: (typeof seedCatalogItems)[number],
  category: ReturnType<typeof resolveSeedCategory>,
  subtype: ReturnType<typeof normalizeSeedSubtype>
) => {
  const properties = item.properties ?? {};

  if (category === "fermentable") {
    return {
      category,
      subtype,
      colorEbc: readSeedNumber(item.fermentableColorEbc, properties.colorEbc),
      extractYieldPct: readSeedNumber(item.fermentableExtractYieldPct, properties.extractFgdbPct, properties.extractYieldPct),
      proteinPct: readSeedNumber(properties.proteinPct),
      moisturePct: readSeedNumber(properties.moisturePct),
      maxUsagePercent: readSeedNumber(properties.maxUsagePercent),
      diastaticPowerLintner: readSeedNumber(properties.diastaticPowerLintner),
      usageFlags: readSeedStringArray(properties.usageFlags)
    };
  }

  if (category === "hop") {
    return {
      category,
      subtype,
      alphaAcidPct: readSeedNumber(item.hopAlphaAcidPct, properties.alphaAcidPercent, properties.alphaAcid),
      betaAcidPct: readSeedNumber(properties.betaAcidPercent, properties.betaAcid),
      totalOilMlPer100g: readSeedNumber(properties.totalOilMlPer100g, properties.totalOil),
      notes: readSeedText(properties.hopNotes),
      harvestYear: readSeedNumber(item.hopSeason, properties.harvestYear)
    };
  }

  if (category === "yeast") {
    return {
      category,
      subtype,
      form: item.yeastForm ?? readSeedText(properties.technicalYeastForm, properties.yeastForm, properties.form),
      attenuationPct: readSeedNumber(item.yeastAttenuationPct, properties.attenuationPercent),
      tempMinC: readSeedNumber(item.yeastMinFermentationTempC, properties.minTemperatureC),
      tempMaxC: readSeedNumber(item.yeastMaxFermentationTempC, properties.maxTemperatureC),
      flocculation: readSeedText(properties.flocculation),
      alcoholTolerancePct: readSeedNumber(properties.alcoholTolerancePct),
      packageSize: readSeedNumber(properties.packageSize),
      packageUnit: readSeedText(properties.packageUnit),
      phenolic: typeof properties.phenolic === "boolean" ? properties.phenolic : null,
      diastaticus: typeof properties.diastaticus === "boolean" ? properties.diastaticus : null
    };
  }

  if (category === "water_prep") {
    const strengthFromName = readSeedNumber(item.displayName.match(/(\d+(?:\.\d+)?)%/)?.[1]);

    return {
      category,
      subtype,
      compound: subtype === "salt" || subtype === "base"
        ? readSeedText(properties.compound, item.displayName)
        : null,
      acidType: subtype === "acid"
        ? readSeedText(properties.acidType, resolveSeedWaterPrepAcidType(item.displayName))
        : null,
      strengthPct: readSeedNumber(properties.strengthPct, properties.strength, strengthFromName),
      purityPct: readSeedNumber(properties.purityPct),
      physicalForm: readSeedText(properties.physicalForm, subtype === "acid" ? "liquid" : null)
    };
  }

  return {
    category,
    subtype,
    usagePhase: readSeedText(properties.usagePhase, properties.stage),
    doseHint: readSeedText(properties.doseHint)
  };
};

const resolveSeedCompleteness = (item: (typeof seedCatalogItems)[number], category: ReturnType<typeof resolveSeedCategory>) => {
  if (category === "fermentable" && item.fermentableColorEbc != null && item.fermentableExtractYieldPct != null) {
    return item.manufacturer && item.country ? "full" as const : "recommended" as const;
  }

  if (category === "hop" && item.hopAlphaAcidPct != null) {
    return item.manufacturer && item.country && item.hopSeason ? "full" as const : "recommended" as const;
  }

  if (category === "yeast" && item.yeastAttenuationPct != null && item.yeastForm) {
    return item.manufacturer && item.country ? "full" as const : "recommended" as const;
  }

  return item.description || item.aliases?.length ? "recommended" as const : "minimum" as const;
};

const resolveSeedMatchPolicy = (category: ReturnType<typeof resolveSeedCategory>) => (
  category === "yeast" || category === "misc" ? "exact_only" as const : "family_compatible" as const
);

const run = async () => {
  assertDevOnlyExecution();

  for (const user of seedUsers) {
    await db.insert(users).values({
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      emailVerified: true
    }).onConflictDoUpdate({
      target: users.email,
      set: {
        displayName: user.displayName,
        role: user.role,
        emailVerified: true,
        updatedAt: new Date()
      }
    });
  }

  for (const item of seedCatalogItems) {
    const category = resolveSeedCategory(item);
    const subtype = normalizeSeedSubtype(item);
    const defaultDisplayUnit = item.defaultUnit;
    const allowedUnits = resolveSeedAllowedUnits(item, category, subtype);
    const measurementDimension = resolveSeedMeasurementDimension(defaultDisplayUnit);
    const completenessLevel = resolveSeedCompleteness(item, category);
    const technicalData = buildSeedTechnicalData(item, category, subtype);
    const [family] = await db.insert(ingredientFamilies).values({
      category,
      subtype,
      canonicalName: item.displayName,
      normalizedCanonicalName: item.normalizedName,
      displayNameRu: null,
      displayNameEn: item.displayName,
      matchPolicy: resolveSeedMatchPolicy(category),
      isActive: true
    }).onConflictDoUpdate({
      target: [ingredientFamilies.category, ingredientFamilies.normalizedCanonicalName],
      set: {
        subtype,
        displayNameEn: item.displayName,
        matchPolicy: resolveSeedMatchPolicy(category),
        updatedAt: new Date()
      }
    }).returning();

    await db.insert(ingredientCatalogItems).values({
      ...item,
      category,
      subtype,
      familyId: family.id,
      aliases: item.aliases ?? [],
      brandName: item.manufacturer ?? null,
      manufacturer: item.manufacturer ?? null,
      country: item.country ?? null,
      harvestYear: item.hopSeason ? Number(item.hopSeason) || null : null,
      status: "active",
      visibility: "public",
      defaultDisplayUnit,
      allowedUnits: [...allowedUnits],
      measurementDimension,
      completenessLevel,
      technicalData
    }).onConflictDoUpdate({
      target: [ingredientCatalogItems.type, ingredientCatalogItems.normalizedName],
      set: {
        category,
        subtype,
        familyId: family.id,
        displayName: item.displayName,
        aliases: item.aliases ?? [],
        brandName: item.manufacturer ?? null,
        manufacturer: item.manufacturer ?? null,
        country: item.country ?? null,
        defaultUnit: item.defaultUnit,
        defaultDisplayUnit,
        allowedUnits: [...allowedUnits],
        measurementDimension,
        completenessLevel,
        technicalData,
        description: item.description ?? null,
        fermentableColorEbc: item.fermentableColorEbc ?? null,
        fermentableExtractYieldPct: item.fermentableExtractYieldPct ?? null,
        hopAlphaAcidPct: item.hopAlphaAcidPct ?? null,
        hopForm: item.hopForm ?? null,
        hopSeason: item.hopSeason ?? null,
        harvestYear: item.hopSeason ? Number(item.hopSeason) || null : null,
        yeastAttenuationPct: item.yeastAttenuationPct ?? null,
        yeastType: item.yeastType ?? null,
        yeastForm: item.yeastForm ?? null,
        yeastMinFermentationTempC: item.yeastMinFermentationTempC ?? null,
        yeastMaxFermentationTempC: item.yeastMaxFermentationTempC ?? null,
        properties: item.properties ?? {},
        status: "active",
        visibility: "public",
        updatedAt: new Date()
      }
    });
  }

  const dbUsers = await db.select().from(users).where(inArray(users.email, seedUsers.map((user) => user.email)));
  const dbCatalogItems = await db.select().from(ingredientCatalogItems).where(inArray(ingredientCatalogItems.normalizedName, seedCatalogItems.map((item) => item.normalizedName)));

  const qaUser = dbUsers.find((user) => user.email === "qa.user@localhost");
  const qaAdmin = dbUsers.find((user) => user.email === "qa.admin@localhost");
  if (!qaUser || !qaAdmin) {
    throw new Error("Failed to load seeded QA users.");
  }

  const catalogByName = new Map(dbCatalogItems.map((item) => [item.normalizedName, item]));
  const pilsnerMalt = catalogByName.get("pilsner malt");
  const paleAleMalt = catalogByName.get("pale ale malt");
  const mosaic = catalogByName.get("mosaic");
  const citra = catalogByName.get("citra");
  const us05 = catalogByName.get("safale us-05");
  const m21 = catalogByName.get("mangrove jacks m21 belgian wit");
  const saaz = catalogByName.get("saaz");
  const dextrose = catalogByName.get("dextrose");
  const honey = catalogByName.get("honey");
  const flakedOats = catalogByName.get("flaked oats");
  const riceHulls = catalogByName.get("rice hulls");
  const irishMoss = catalogByName.get("irish moss");
  const gelatin = catalogByName.get("gelatin");
  const yeastNutrient = catalogByName.get("yeast nutrient");
  const calciumChloride = catalogByName.get("calcium chloride");

  if (
    !pilsnerMalt
    || !paleAleMalt
    || !mosaic
    || !citra
    || !us05
    || !m21
    || !saaz
    || !dextrose
    || !honey
    || !flakedOats
    || !riceHulls
    || !irishMoss
    || !gelatin
    || !yeastNutrient
    || !calciumChloride
  ) {
    throw new Error("Failed to load seeded ingredient catalog items.");
  }

  await db.delete(userIngredients).where(inArray(userIngredients.userId, [qaUser.id, qaAdmin.id]));
  const createInventorySeedRow = (
    userId: string,
    item: typeof ingredientCatalogItems.$inferSelect,
    enteredQuantity: number,
    enteredUnit: string,
    normalizedQuantity: number,
    normalizedUnit: string,
    unitDimension: "weight" | "volume" | "count",
    notes?: string
  ) => ({
    userId,
    ingredientCatalogItemId: item.id,
    ingredientFamilyId: item.familyId,
    ingredientCategory: item.category,
    ingredientSubtype: item.subtype,
    ingredientDisplayNameSnapshot: item.displayName,
    ingredientDefaultDisplayUnitSnapshot: item.defaultDisplayUnit,
    ingredientMeasurementDimension: item.measurementDimension,
    enteredQuantity,
    enteredUnit,
    normalizedQuantity,
    normalizedUnit,
    unitDimension,
    notes: notes ?? null
  });
  await db.insert(userIngredients).values([
    createInventorySeedRow(qaUser.id, pilsnerMalt, 6000, "g", 6000, "g", "weight", "Base malt for lagers and Belgian styles"),
    createInventorySeedRow(qaUser.id, paleAleMalt, 5000, "g", 5000, "g", "weight", "Base malt for pale ale"),
    createInventorySeedRow(qaUser.id, citra, 150, "g", 150, "g", "weight", "Aroma additions"),
    createInventorySeedRow(qaUser.id, mosaic, 100, "g", 100, "g", "weight", "Dry hop sample stock"),
    createInventorySeedRow(qaUser.id, us05, 2, "pack", 2, "pack", "count"),
    createInventorySeedRow(qaUser.id, dextrose, 1000, "g", 1000, "g", "weight", "Priming sugar"),
    createInventorySeedRow(qaUser.id, flakedOats, 750, "g", 750, "g", "weight", "Adjunct for haze and body"),
    createInventorySeedRow(qaUser.id, irishMoss, 50, "g", 50, "g", "weight", "Kettle finings"),
    createInventorySeedRow(qaUser.id, yeastNutrient, 100, "g", 100, "g", "weight", "Fermentation support"),
    createInventorySeedRow(qaUser.id, calciumChloride, 250, "g", 250, "g", "weight", "Water profile adjustment"),
    createInventorySeedRow(qaAdmin.id, m21, 1, "pack", 1, "pack", "count", "Belgian wit QA sample"),
    createInventorySeedRow(qaAdmin.id, saaz, 80, "g", 80, "g", "weight", "Admin QA account stock"),
    createInventorySeedRow(qaAdmin.id, honey, 1500, "g", 1500, "g", "weight", "Special fermentables sample"),
    createInventorySeedRow(qaAdmin.id, riceHulls, 500, "g", 500, "g", "weight", "Lautering adjunct"),
    createInventorySeedRow(qaAdmin.id, gelatin, 100, "g", 100, "g", "weight", "Cold crash finings")
  ]);

  console.log(`QA seed complete: ${dbUsers.length} users, ${dbCatalogItems.length} catalog items, inventory reset for qa.user/qa.admin.`);
};

run()
  .catch((error) => {
    console.error("seed-qa failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
