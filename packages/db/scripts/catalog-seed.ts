import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  db,
  inArray,
  ingredientAliases,
  ingredients,
  ingredientPackageVariants,
  ingredientSources
} from "../src";

type CatalogSeedFileSpec = {
  fileName: string;
  type: "hop" | "malt" | "fermentable" | "yeast" | "consumable" | "water_treatment";
};

type PreparedSeedIngredient = {
  ingredient: typeof ingredients.$inferInsert;
  aliases: Array<typeof ingredientAliases.$inferInsert>;
  sources: Array<typeof ingredientSources.$inferInsert>;
  packageVariants: Array<typeof ingredientPackageVariants.$inferInsert>;
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const ingredientsDir = path.resolve(scriptDir, "../../..", "ingredients/new");
const externalCatalogSeedOverrides: Partial<Record<string, string>> = {
  "consumables_v4_patch_proposal.json": "/mnt/data/consumables_v4_patch_proposal.json"
};

export const catalogSeedManifest: readonly CatalogSeedFileSpec[] = [
  { fileName: "hop_catalog_minimal_v2.json", type: "hop" },
  { fileName: "malt_catalog_minimal_v2.json", type: "malt" },
  { fileName: "fermentables_catalog_minimal_v2.normalized.json", type: "fermentable" },
  { fileName: "yeasts_catalog_minimal_v2.json", type: "yeast" },
  { fileName: "consumables_v4_patch_proposal.json", type: "consumable" },
  { fileName: "water_treatment_catalog_minimal_v2.json", type: "water_treatment" }
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const readString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const readNumber = (value: unknown): number | null => (
  typeof value === "number" && Number.isFinite(value) ? value : null
);

const readBoolean = (value: unknown): boolean | null => (
  typeof value === "boolean" ? value : null
);

const readStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value
      .map((item) => readString(item))
      .filter((item): item is string => item != null)
    : []
);

const compactRecord = (value: Record<string, unknown>) => Object.fromEntries(
  Object.entries(value).filter(([, entry]) => (
    entry !== undefined
    && entry !== null
    && !(Array.isArray(entry) && entry.length === 0)
  ))
);

export const normalizeCatalogAlias = (value: string) => value
  .normalize("NFKC")
  .toLowerCase()
  .replaceAll("ё", "е")
  .replace(/[‐‑‒–—―]/g, "-")
  .replace(/[.,;:!?()[\]{}"“”«»'`´]+/g, " ")
  .replace(/[-_/\\|]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const readCatalogFile = (fileName: string): unknown => {
  const externalPath = externalCatalogSeedOverrides[fileName];
  const filePath = externalPath && fs.existsSync(externalPath)
    ? externalPath
    : path.join(ingredientsDir, fileName);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

const autoLocalizedFirstCountryCodes = new Set(["RU", "BY", "UA", "KZ"]);

const countryCodeAliases: Record<string, string> = {
  RUS: "RU",
  BLR: "BY",
  UKR: "UA",
  KAZ: "KZ",
  AUS: "AU",
  ARG: "AR",
  BRA: "BR",
  CHN: "CN",
  DEU: "DE",
  DNK: "DK",
  EGY: "EG",
  FIN: "FI",
  FRA: "FR",
  GBR: "GB",
  GEO: "GE",
  GRC: "GR",
  IDN: "ID",
  IND: "IN",
  IRN: "IR",
  LVA: "LV",
  MAR: "MA",
  NZL: "NZ",
  THA: "TH",
  USA: "US",
  UZB: "UZ",
  VNM: "VN"
};

const countryNameToCode: Record<string, string> = {
  "россия": "RU",
  "russia": "RU",
  "российская федерация": "RU",
  "russian federation": "RU",
  "беларусь": "BY",
  "belarus": "BY",
  "белоруссия": "BY",
  "канада": "CA",
  "canada": "CA",
  "сша": "US",
  "usa": "US",
  "united states": "US",
  "united states of america": "US",
  "германия": "DE",
  "germany": "DE",
  "бельгия": "BE",
  "belgium": "BE",
  "великобритания": "GB",
  "great britain": "GB",
  "united kingdom": "GB",
  "австралия": "AU",
  "australia": "AU",
  "австрия": "AT",
  "austria": "AT",
  "аргентина": "AR",
  "argentina": "AR",
  "бразилия": "BR",
  "brazil": "BR",
  "китай": "CN",
  "china": "CN",
  "дания": "DK",
  "denmark": "DK",
  "египет": "EG",
  "egypt": "EG",
  "финляндия": "FI",
  "finland": "FI",
  "франция": "FR",
  "france": "FR",
  "грузия": "GE",
  "georgia": "GE",
  "греция": "GR",
  "greece": "GR",
  "индонезия": "ID",
  "indonesia": "ID",
  "индия": "IN",
  "india": "IN",
  "иран": "IR",
  "iran": "IR",
  "латвия": "LV",
  "latvia": "LV",
  "марокко": "MA",
  "morocco": "MA",
  "н. зеландия": "NZ",
  "н зеландия": "NZ",
  "новая зеландия": "NZ",
  "new zealand": "NZ",
  "таиланд": "TH",
  "thailand": "TH",
  "украина": "UA",
  "ukraine": "UA",
  "казахстан": "KZ",
  "kazakhstan": "KZ",
  "узбекистан": "UZ",
  "uzbekistan": "UZ",
  "вьетнам": "VN",
  "vietnam": "VN"
};

const normalizeSeedCountryCode = (countryCode: unknown, countryName: unknown) => {
  const normalizedCode = readString(countryCode)?.toUpperCase();
  if (normalizedCode) {
    if (autoLocalizedFirstCountryCodes.has(normalizedCode)) {
      return normalizedCode;
    }

    if (countryCodeAliases[normalizedCode]) {
      return countryCodeAliases[normalizedCode];
    }
  }

  const normalizedName = readString(countryName)?.toLowerCase();
  return normalizedName ? countryNameToCode[normalizedName] ?? null : null;
};

export const loadCatalogSeedItems = (fileName: string): unknown[] => {
  const root = readCatalogFile(fileName);
  if (Array.isArray(root)) {
    return root;
  }

  if (isRecord(root) && Array.isArray(root.items)) {
    return root.items;
  }

  throw new Error(`Unsupported seed root shape for ${fileName}`);
};

const buildAliasRows = (
  ingredientId: string,
  groups: Array<{ locale: "ru" | "en" | "neutral"; values: unknown; source?: string }>
): Array<typeof ingredientAliases.$inferInsert> => {
  const deduped = new Map<string, typeof ingredientAliases.$inferInsert>();

  for (const group of groups) {
    for (const alias of readStringArray(group.values)) {
      const normalized = normalizeCatalogAlias(alias);
      if (!normalized) {
        continue;
      }

      const key = `${group.locale}:${normalized}`;
      if (!deduped.has(key)) {
        deduped.set(key, {
          ingredientId,
          locale: group.locale,
          alias,
          aliasNormalized: normalized,
          source: group.source ?? "seed",
          isEnabled: true
        });
      }
    }
  }

  return Array.from(deduped.values());
};

const readFermentableExtractForm = (value: unknown) => {
  const normalized = readString(value)?.toLowerCase();
  return normalized === "dry" || normalized === "liquid" ? normalized : null;
};

const readFermentableHoppingState = (value: unknown) => {
  const normalized = readString(value)?.toLowerCase();
  return normalized === "hopped"
    || normalized === "unhopped"
    || normalized === "unknown"
    || normalized === "not_applicable"
    ? normalized
    : null;
};

const buildSourceRows = (
  ingredientId: string,
  sources: unknown
): Array<typeof ingredientSources.$inferInsert> => {
  if (!Array.isArray(sources)) {
    return [];
  }

  return sources
    .map((entry, index) => {
      const source = isRecord(entry) ? entry : {};
      return {
        ingredientId,
        kind: readString(source.kind) ?? readString(source.group),
        label: readString(source.label),
        url: readString(source.url),
        sourceBasis: readString(source.source_basis),
        position: index
      } satisfies typeof ingredientSources.$inferInsert;
    });
};

const resolveDisplayModeRu = (
  type: CatalogSeedFileSpec["type"],
  explicitMode: unknown,
  countryCode: unknown,
  countryName: unknown,
  nameRu: unknown
) => {
  const normalizedExplicit = readString(explicitMode);
  if (normalizedExplicit === "auto" || normalizedExplicit === "localized_first" || normalizedExplicit === "source_first") {
    return normalizedExplicit;
  }

  if (type === "hop" || type === "malt" || type === "yeast") {
    return normalizeSeedCountryCode(countryCode, countryName) && readString(nameRu)
      ? "localized_first"
      : "source_first";
  }

  return "localized_first";
};

const prepareHop = (item: unknown): PreparedSeedIngredient => {
  const source = isRecord(item) ? item : {};
  const id = readString(source.id);
  if (!id) {
    throw new Error("Hop item is missing id");
  }

  return {
    ingredient: {
      id,
      type: "hop",
      nameRu: readString(source.name_ru),
      nameEn: readString(source.name_en),
      displayModeRu: resolveDisplayModeRu("hop", null, source.country_code, null, source.name_ru),
      isActive: true,
      countryCode: readString(source.country_code),
      producer: readString(source.producer),
      presentOnBirrf: readBoolean(source.present_on_birrf),
      inventoryEnabled: true,
      attributes: compactRecord({
        alpha_acid_pct_min: readNumber(source.alpha_acid_pct_min),
        alpha_acid_pct_max: readNumber(source.alpha_acid_pct_max),
        alpha_acid_pct_typical: readNumber(source.alpha_acid_pct_typical),
        beta_acid_pct_min: readNumber(source.beta_acid_pct_min),
        beta_acid_pct_max: readNumber(source.beta_acid_pct_max),
        beta_acid_pct_typical: readNumber(source.beta_acid_pct_typical),
        oil_ml_100g_min: readNumber(source.oil_ml_100g_min),
        oil_ml_100g_max: readNumber(source.oil_ml_100g_max),
        oil_ml_100g_typical: readNumber(source.oil_ml_100g_typical),
        cohumulone_pct_min: readNumber(source.cohumulone_pct_min),
        cohumulone_pct_max: readNumber(source.cohumulone_pct_max),
        cohumulone_pct_typical: readNumber(source.cohumulone_pct_typical),
        category_birrf: readString(source.category_birrf),
        category_birrf_ru: readString(source.category_birrf_ru),
        hop_form: readString(source.hop_form),
        is_blend: readBoolean(source.is_blend),
        is_popular_in_russia: readBoolean(source.is_popular_in_russia),
        aroma_descriptors_en: readStringArray(source.aroma_descriptors_en),
        notes: readString(source.notes)
      }),
      quantityDefaults: null
    },
    aliases: buildAliasRows(id, [
      { locale: "ru", values: source.aliases_ru },
      { locale: "en", values: source.aliases_en },
      { locale: "neutral", values: source.producer_aliases }
    ]),
    sources: buildSourceRows(id, source.sources),
    packageVariants: []
  };
};

const prepareMalt = (item: unknown): PreparedSeedIngredient => {
  const source = isRecord(item) ? item : {};
  const id = readString(source.id);
  if (!id) {
    throw new Error("Malt item is missing id");
  }

  return {
    ingredient: {
      id,
      type: "malt",
      nameRu: readString(source.name_ru),
      nameEn: readString(source.name_en),
      displayModeRu: resolveDisplayModeRu("malt", null, source.country_code, null, source.name_ru),
      isActive: true,
      countryCode: readString(source.country_code),
      brand: readString(source.brand),
      presentOnBirrf: readBoolean(source.is_birrf_present),
      inventoryEnabled: true,
      attributes: compactRecord({
        malt_type: readString(source.malt_type),
        extract_pct_dry_basis: readNumber(source.extract_pct_dry_basis),
        color_ebc_min: readNumber(source.color_ebc_min),
        color_ebc_max: readNumber(source.color_ebc_max),
        color_lovibond: readNumber(source.color_lovibond),
        protein_pct: readNumber(source.protein_pct),
        max_usage_pct: readNumber(source.max_usage_pct),
        color_ebc_is_approx: readBoolean(source.color_ebc_is_approx)
      }),
      quantityDefaults: null
    },
    aliases: buildAliasRows(id, [
      { locale: "ru", values: source.aliases_ru },
      { locale: "en", values: source.aliases_en },
      { locale: "neutral", values: source.brand_aliases }
    ]),
    sources: buildSourceRows(id, source.sources),
    packageVariants: []
  };
};

const prepareFermentable = (item: unknown): PreparedSeedIngredient => {
  const source = isRecord(item) ? item : {};
  const id = readString(source.id);
  if (!id) {
    throw new Error("Fermentable item is missing id");
  }
  const extractForm = readFermentableExtractForm(source.extract_form);
  const subtypeKey = readString(source.subtype_key) ?? readString(source.ingredient_type);

  return {
    ingredient: {
      id,
      type: "fermentable",
      nameRu: readString(source.name_ru),
      nameEn: readString(source.name_en),
      displayModeRu: resolveDisplayModeRu("fermentable", null, null, null, source.name_ru),
      isActive: true,
      countryCode: normalizeSeedCountryCode(null, source.country_name),
      countryName: readString(source.country_name),
      producer: readString(source.producer),
      groupName: readString(source.group),
      itemKind: subtypeKey,
      presentOnBirrf: readBoolean(source.present_on_birrf),
      inventoryEnabled: true,
      attributes: compactRecord({
        fermentability_class: readString(source.fermentability_class),
        product_family: readString(source.product_family),
        subtype_key: subtypeKey,
        physical_form: readString(source.physical_form),
        extract_pct_dry_basis: readNumber(source.extract_pct_dry_basis),
        color_lovibond: readNumber(source.color_lovibond),
        recommended_max_pct: readNumber(source.recommended_max_pct),
        is_usable_in_beer_gravity_calculations: readBoolean(source.is_usable_in_beer_gravity_calculations),
        beer_relevance: readString(source.beer_relevance),
        extract_form: extractForm,
        base_material_family: readString(source.base_material_family),
        base_materials: readStringArray(source.base_materials),
        hopping_state: readFermentableHoppingState(source.hopping_state),
        is_hopped_product: readBoolean(source.is_hopped_product),
        functional_role: readString(source.functional_role),
        gravity_calc_mode: readString(source.gravity_calc_mode),
        display_type_ru: readString(source.display_type_ru),
        display_type_en: readString(source.display_type_en)
      }),
      quantityDefaults: null
    },
    aliases: buildAliasRows(id, [
      { locale: "ru", values: source.aliases_ru },
      { locale: "en", values: source.aliases_en }
    ]),
    sources: buildSourceRows(id, source.sources),
    packageVariants: []
  };
};

const prepareYeast = (item: unknown): PreparedSeedIngredient => {
  const source = isRecord(item) ? item : {};
  const id = readString(source.id);
  if (!id) {
    throw new Error("Yeast item is missing id");
  }

  return {
    ingredient: {
      id,
      type: "yeast",
      nameRu: readString(source.name_ru),
      nameEn: readString(source.name_en),
      displayModeRu: resolveDisplayModeRu("yeast", null, null, source.producer_country, source.name_ru),
      isActive: true,
      countryCode: normalizeSeedCountryCode(null, source.producer_country),
      countryName: readString(source.producer_country),
      brand: readString(source.brand),
      productCode: readString(source.product_code),
      presentOnBirrf: readBoolean(source.present_on_birrf),
      inventoryEnabled: true,
      attributes: compactRecord({
        form: readString(source.form),
        yeast_family: readString(source.yeast_family),
        birrf_category: readString(source.birrf_category),
        attenuation_pct_typical: readNumber(source.attenuation_pct_typical),
        flocculation: readString(source.flocculation),
        fermentation_temp_c_min: readNumber(source.fermentation_temp_c_min),
        fermentation_temp_c_max: readNumber(source.fermentation_temp_c_max),
        fermentation_temp_c_optimum: readNumber(source.fermentation_temp_c_optimum),
        alcohol_tolerance_abv_typical: readNumber(source.alcohol_tolerance_abv_typical),
        source_basis: readString(source.source_basis)
      }),
      quantityDefaults: null
    },
    aliases: buildAliasRows(id, [
      { locale: "ru", values: source.aliases_ru },
      { locale: "en", values: source.aliases_en }
    ]),
    sources: [],
    packageVariants: []
  };
};

const prepareConsumable = (item: unknown): PreparedSeedIngredient => {
  const source = isRecord(item) ? item : {};
  const id = readString(source.id);
  if (!id) {
    throw new Error("Consumable item is missing id");
  }

  const packageVariants = Array.isArray(source.package_variants)
    ? source.package_variants
      .filter(isRecord)
      .map((variant, index) => {
        const variantId = readString(variant.id);
        if (!variantId) {
          throw new Error(`Consumable ${id} has package variant without id`);
        }

        const packageInfo = isRecord(variant.package) ? variant.package : {};
        const stockContentInfo = isRecord(variant.stock_content_per_package) ? variant.stock_content_per_package : {};
        const sourceInfo = isRecord(variant.source) ? variant.source : {};

        return {
          id: variantId,
          ingredientId: id,
          brand: readString(variant.brand),
          productNameEn: readString(variant.product_name_en),
          productNameRu: readString(variant.product_name_ru),
          countryNameRu: readString(variant.country_name_ru) ?? readString(variant.country_name_en),
          packageAmount: readNumber(packageInfo.amount),
          packageUnit: readString(packageInfo.unit),
          stockContentAmount: readNumber(stockContentInfo.amount),
          stockContentUnit: readString(stockContentInfo.unit),
          sourceGroup: readString(sourceInfo.group),
          sourceUrl: readString(sourceInfo.url),
          isDefaultForStock: Boolean(variant.is_default_for_stock ?? index === 0),
          position: index
        } satisfies typeof ingredientPackageVariants.$inferInsert;
      })
    : [];

  return {
    ingredient: {
      id,
      type: "consumable",
      nameRu: readString(source.name_ru),
      nameEn: readString(source.name_en),
      displayModeRu: resolveDisplayModeRu("consumable", source.display_mode_ru, null, null, source.name_ru),
      isActive: true,
      category: readString(source.category),
      subcategory: readString(source.subcategory),
      itemKind: readString(source.item_kind),
      inventoryEnabled: true,
      attributes: compactRecord({
        common_forms: readStringArray(source.common_forms),
        usage_stage: readStringArray(source.usage_stage),
        dosage_reference: isRecord(source.dosage_reference) ? source.dosage_reference : null,
        family_key: readString(source.family_key),
        picker_group: readString(source.picker_group) ?? readString(source.category),
        market_names_ru: readStringArray(source.market_names_ru),
        market_names_en: readStringArray(source.market_names_en),
        search_priority_terms_ru: readStringArray(source.search_priority_terms_ru),
        search_priority_terms_en: readStringArray(source.search_priority_terms_en),
        picker_function_ru: readString(source.picker_function_ru),
        picker_usage_ru: readString(source.picker_usage_ru),
        brand_family_mode: readString(source.brand_family_mode)
      }),
      quantityDefaults: isRecord(source.quantity_defaults) ? source.quantity_defaults : null
    },
    aliases: buildAliasRows(id, [
      { locale: "ru", values: source.market_names_ru, source: "seed_market_name" },
      { locale: "en", values: source.market_names_en, source: "seed_market_name" },
      { locale: "ru", values: source.search_priority_terms_ru, source: "seed_priority_term" },
      { locale: "en", values: source.search_priority_terms_en, source: "seed_priority_term" },
      { locale: "ru", values: source.aliases_ru },
      { locale: "en", values: source.aliases_en }
    ]),
    sources: [],
    packageVariants
  };
};

const prepareWaterTreatment = (item: unknown): PreparedSeedIngredient => {
  const source = isRecord(item) ? item : {};
  const id = readString(source.id);
  if (!id) {
    throw new Error("Water treatment item is missing id");
  }

  return {
    ingredient: {
      id,
      type: "water_treatment",
      nameRu: readString(source.name_ru),
      nameEn: readString(source.name_en),
      displayModeRu: resolveDisplayModeRu("water_treatment", source.display_mode_ru, null, null, source.name_ru),
      isActive: true,
      category: readString(source.category),
      itemKind: readString(source.item_kind),
      inventoryEnabled: true,
      attributes: compactRecord({
        formula: readString(source.formula),
        common_forms: readStringArray(source.common_forms),
        unit_preferred: readString(source.unit_preferred),
        typical_use_ru: readString(source.typical_use_ru),
        recommended_for: readStringArray(source.recommended_for),
        water_calc_role: readStringArray(source.water_calc_role),
        pH_effect_direction: readString(source.pH_effect_direction),
        effect_on_ions: isRecord(source.effect_on_ions) ? source.effect_on_ions : null,
        calculation_support: readString(source.calculation_support),
        common_in_homebrewing: readBoolean(source.common_in_homebrewing),
        common_in_pro_brewing: readBoolean(source.common_in_pro_brewing),
        recommendation_level: readString(source.recommendation_level),
        cautions_ru: readString(source.cautions_ru),
        source_basis: Array.isArray(source.source_basis) ? source.source_basis : readString(source.source_basis)
      }),
      quantityDefaults: null
    },
    aliases: buildAliasRows(id, [
      { locale: "ru", values: source.aliases_ru },
      { locale: "en", values: source.aliases_en }
    ]),
    sources: [],
    packageVariants: []
  };
};

const prepareSeedIngredient = (
  spec: CatalogSeedFileSpec,
  item: unknown
): PreparedSeedIngredient => {
  if (spec.type === "hop") return prepareHop(item);
  if (spec.type === "malt") return prepareMalt(item);
  if (spec.type === "fermentable") return prepareFermentable(item);
  if (spec.type === "yeast") return prepareYeast(item);
  if (spec.type === "consumable") return prepareConsumable(item);
  return prepareWaterTreatment(item);
};

export const prepareCatalogSeedFile = (spec: CatalogSeedFileSpec) => (
  loadCatalogSeedItems(spec.fileName).map((item) => prepareSeedIngredient(spec, item))
);

const seedCatalogFile = async (spec: CatalogSeedFileSpec) => {
  const items = prepareCatalogSeedFile(spec);
  const ingredientIds = items.map((item) => item.ingredient.id);

  if (ingredientIds.length === 0) {
    console.log(`${spec.fileName}: processed 0, inserted 0, updated 0`);
    return { processed: 0, inserted: 0, updated: 0 };
  }

  return db.transaction(async (tx) => {
    const existingRows = await tx.select({ id: ingredients.id })
      .from(ingredients)
      .where(inArray(ingredients.id, ingredientIds));

    const existingIds = new Set(existingRows.map((row) => row.id));
    const inserted = ingredientIds.filter((id) => !existingIds.has(id)).length;
    const updated = ingredientIds.length - inserted;

    for (const item of items) {
      await tx.insert(ingredients).values(item.ingredient).onConflictDoUpdate({
        target: [ingredients.id],
        set: {
          ...item.ingredient,
          updatedAt: new Date()
        }
      });
    }

    await tx.delete(ingredientAliases).where(inArray(ingredientAliases.ingredientId, ingredientIds));
    await tx.delete(ingredientSources).where(inArray(ingredientSources.ingredientId, ingredientIds));
    await tx.delete(ingredientPackageVariants).where(inArray(ingredientPackageVariants.ingredientId, ingredientIds));

    const aliases = items.flatMap((item) => item.aliases);
    const sources = items.flatMap((item) => item.sources);
    const packageVariants = items.flatMap((item) => item.packageVariants);

    if (aliases.length) {
      await tx.insert(ingredientAliases).values(aliases);
    }

    if (sources.length) {
      await tx.insert(ingredientSources).values(sources);
    }

    if (packageVariants.length) {
      await tx.insert(ingredientPackageVariants).values(packageVariants);
    }

    console.log(`${spec.fileName}: processed ${items.length}, inserted ${inserted}, updated ${updated}`);
    return {
      processed: items.length,
      inserted,
      updated
    };
  });
};

export const seedCatalogFromSources = async () => {
  let processed = 0;
  let inserted = 0;
  let updated = 0;

  for (const spec of catalogSeedManifest) {
    const result = await seedCatalogFile(spec);
    processed += result.processed;
    inserted += result.inserted;
    updated += result.updated;
  }

  return {
    processed,
    inserted,
    updated
  };
};
