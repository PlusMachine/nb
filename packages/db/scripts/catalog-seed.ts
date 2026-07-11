import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
const repoRootDir = path.resolve(scriptDir, "../../..");
const ingredientsDir = path.resolve(repoRootDir, "ingredients/new");
const externalCatalogSeedOverrides: Partial<Record<string, string>> = {
  "consumables_v4_patch_proposal.json": "/mnt/data/consumables_v4_patch_proposal.json"
};

export const catalogSeedManifest: readonly CatalogSeedFileSpec[] = [
  { fileName: "hop_catalog_minimal_v2.json", type: "hop" },
  { fileName: "malt_catalog_minimal_v2.json", type: "malt" },
  { fileName: "fermentables_catalog_minimal_v2.normalized.json", type: "fermentable" },
  { fileName: "yeasts_catalog_minimal_v2.json", type: "yeast" },
  { fileName: "additives_v2_1.json", type: "consumable" },
  { fileName: "consumables_v1.json", type: "consumable" },
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

const legacyAdditiveSourceCatalogFileName = "consumables_v4_patch_proposal.json";

const normalizeSeedTaxonomyKey = (value?: string | null) => (value ?? "")
  .normalize("NFKC")
  .trim()
  .toLowerCase()
  .replaceAll("ё", "е")
  .replace(/[\s,/|+&-]+/g, "_")
  .replace(/[^a-zа-я0-9_]+/g, "")
  .replace(/_+/g, "_")
  .replace(/^_+|_+$/g, "");

const canonicalConsumableSeedGroups: Record<string, string> = {
  tech_additives: "technical_additives",
  technical_additives: "technical_additives",
  technical: "technical_additives",
  process_aid: "technical_additives",
  process_aids: "technical_additives",
  fining: "technical_additives",
  finings: "technical_additives",
  enzyme: "technical_additives",
  enzymes: "technical_additives",
  nutrient: "technical_additives",
  nutrients: "technical_additives",
  antioxidant: "technical_additives",
  antioxidants: "technical_additives",
  defoamer: "technical_additives",
  defoamers: "technical_additives",
  preservative: "technical_additives",
  preservatives: "technical_additives",
  техдобавки: "technical_additives",
  технические_добавки: "technical_additives",
  технологические_добавки: "technical_additives",
  осветление: "technical_additives",
  ферменты: "technical_additives",
  подкормки: "technical_additives",
  антиоксиданты: "technical_additives",
  пеногасители: "technical_additives",
  консерванты: "technical_additives",

  lauter_aid: "lauter_aid",
  lauter_aids: "lauter_aid",
  filter_aid: "lauter_aid",
  filter_aids: "lauter_aid",
  фильтрация_затора: "lauter_aid",
  фильтрующая_добавка: "lauter_aid",

  spice: "spice",
  spices: "spice",
  специи: "spice",

  citrus_zest: "citrus_zest",
  citrus: "citrus_zest",
  zest: "citrus_zest",
  peel: "citrus_zest",
  цедра: "citrus_zest",
  цедра_и_цитрус: "citrus_zest",
  цитрус: "citrus_zest",

  herb_flower: "herb_flower",
  herbs_flowers: "herb_flower",
  herbs_and_flowers: "herb_flower",
  herb: "herb_flower",
  herbs: "herb_flower",
  flower: "herb_flower",
  flowers: "herb_flower",
  травы_и_цветы: "herb_flower",
  травы: "herb_flower",
  цветы: "herb_flower",
  чай: "herb_flower",

  coffee_cacao: "coffee_cacao",
  coffee_cocoa: "coffee_cacao",
  coffee: "coffee_cacao",
  cacao: "coffee_cacao",
  cocoa: "coffee_cacao",
  кофе_какао: "coffee_cacao",
  кофе_какао_и_десертные_добавки: "coffee_cacao",
  кофе: "coffee_cacao",
  какао: "coffee_cacao",

  wood_aging: "wood_aging",
  wood: "wood_aging",
  aging: "wood_aging",
  oak: "wood_aging",
  дерево_выдержка: "wood_aging",
  дерево_и_выдержка: "wood_aging",
  выдержка: "wood_aging",
  древесина: "wood_aging",

  flavoring: "flavoring",
  flavorings: "flavoring",
  flavor: "flavoring",
  flavour: "flavoring",
  extract: "flavoring",
  extracts: "flavoring",
  ароматизаторы: "flavoring",
  ароматизаторы_и_экстракты: "flavoring",
  экстракты: "flavoring",

  sanitizer: "sanitizer",
  sanitizers: "sanitizer",
  санитайзер: "sanitizer",
  санитайзеры: "sanitizer",
  cleaner: "cleaner",
  cleaners: "cleaner",
  мойка: "cleaner",
  packaging: "packaging",
  package: "packaging",
  тара: "packaging",
  тара_укупорка: "packaging",
  тара_и_укупорка: "packaging",
  укупорка: "packaging",
  gas: "gas",
  gases: "gas",
  газы: "gas",
  other: "other",
  другое: "other"
};

const canonicalizeConsumableSeedGroup = (value?: string | null) => {
  const normalized = normalizeSeedTaxonomyKey(value);
  if (!normalized) {
    return null;
  }

  const mapped = canonicalConsumableSeedGroups[normalized];
  if (mapped) {
    return mapped;
  }

  if (normalized.includes("лузг") || normalized.includes("шелух") || normalized.includes("hull") || normalized.includes("husk")) {
    return "lauter_aid";
  }

  if (normalized.includes("цедр") || normalized.includes("цитрус") || normalized.includes("zest") || normalized.includes("peel")) {
    return "citrus_zest";
  }

  if (normalized.includes("спец") || normalized.includes("spice")) {
    return "spice";
  }

  if (normalized.includes("трав") || normalized.includes("цвет") || normalized.includes("herb") || normalized.includes("flower")) {
    return "herb_flower";
  }

  if (normalized.includes("кофе") || normalized.includes("какао") || normalized.includes("coffee") || normalized.includes("cacao") || normalized.includes("cocoa")) {
    return "coffee_cacao";
  }

  if (normalized.includes("дерев") || normalized.includes("дуб") || normalized.includes("wood") || normalized.includes("oak")) {
    return "wood_aging";
  }

  if (normalized.includes("аромат") || normalized.includes("экстракт") || normalized.includes("flavor") || normalized.includes("extract")) {
    return "flavoring";
  }

  if (
    normalized.includes("освет")
    || normalized.includes("фермент")
    || normalized.includes("подкорм")
    || normalized.includes("антиокс")
    || normalized.includes("пено")
    || normalized.includes("консерв")
  ) {
    return "technical_additives";
  }

  return null;
};

const normalizeSeedUseStage = (value?: string | null) => {
  const normalized = normalizeSeedTaxonomyKey(value);
  if (!normalized) {
    return null;
  }

  if (normalized === "mash" || normalized.includes("затор")) return "mash";
  if (normalized === "boil" || normalized.includes("кип")) return "boil";
  if (normalized === "flameout" || normalized === "whirlpool" || normalized.includes("вирпул") || normalized.includes("выключ")) return "whirlpool";
  if (
    normalized === "primary"
    || normalized === "secondary"
    || normalized === "fermentation"
    || normalized.includes("брож")
  ) return "fermentation";
  if (normalized === "bottling" || normalized === "packaging" || normalized.includes("розлив") || normalized.includes("упаков")) return "packaging";

  return "other";
};

const normalizeSeedInventoryUnit = (value?: string | null) => {
  const normalized = normalizeSeedTaxonomyKey(value);
  if (!normalized) {
    return null;
  }

  if (normalized === "pcs" || normalized === "pc" || normalized === "piece" || normalized === "pieces" || normalized === "шт") {
    return "item";
  }

  return ["g", "kg", "oz", "lb", "ml", "l", "gal", "item", "pack"].includes(normalized)
    ? normalized
    : null;
};

const buildConsumableQuantityDefaults = (source: Record<string, unknown>) => {
  if (isRecord(source.quantity_defaults)) {
    return source.quantity_defaults;
  }

  const defaultUnit = normalizeSeedInventoryUnit(readString(source.default_unit));
  const stockUnits = readStringArray(source.stock_units)
    .map((unit) => normalizeSeedInventoryUnit(unit))
    .filter((unit): unit is string => unit != null);
  const uniqueStockUnits = [...new Set(defaultUnit ? [defaultUnit, ...stockUnits] : stockUnits)];
  const stockUnitDefault = defaultUnit ?? uniqueStockUnits[0] ?? null;

  if (!stockUnitDefault && uniqueStockUnits.length === 0) {
    return null;
  }

  return compactRecord({
    recipe_unit_default: defaultUnit,
    stock_unit_default: stockUnitDefault,
    stock_units_supported: uniqueStockUnits
  });
};

export const normalizeCatalogAlias = (value: string) => value
  .normalize("NFKC")
  .toLowerCase()
  .replaceAll("ё", "е")
  .replace(/[‐‑‒–—―]/g, "-")
  .replace(/[.,;:!?()[\]{}"“”«»'`´]+/g, " ")
  .replace(/[-_/\\|]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const readCatalogFileText = (fileName: string) => {
  const externalPath = externalCatalogSeedOverrides[fileName];
  if (externalPath && fs.existsSync(externalPath)) {
    return fs.readFileSync(externalPath, "utf8");
  }

  const filePath = path.join(ingredientsDir, fileName);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf8");
  }

  try {
    const gitBlobPath = path.posix.join("ingredients/new", fileName);
    const lastCommitWithFile = execFileSync("git", [
      "log",
      "--format=%H",
      "--diff-filter=AM",
      "-n",
      "1",
      "--",
      gitBlobPath
    ], {
      cwd: repoRootDir,
      encoding: "utf8"
    }).trim();

    if (!lastCommitWithFile) {
      throw new Error(`No git history found for ${fileName}`);
    }

    return execFileSync("git", ["show", `${lastCommitWithFile}:${gitBlobPath}`], {
      cwd: repoRootDir,
      encoding: "utf8"
    });
  } catch (error) {
    throw new Error(`Catalog seed file not found: ${fileName}`, {
      cause: error
    });
  }
};

const readCatalogFile = (fileName: string): unknown => {
  return JSON.parse(readCatalogFileText(fileName));
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

    // Обычный 2-буквенный ISO-код страны (US, DE, CZ, GB…), не требующий алиаса.
    if (/^[A-Z]{2}$/.test(normalizedCode)) {
      return normalizedCode;
    }
  }

  const normalizedName = readString(countryName)?.toLowerCase();
  return normalizedName ? countryNameToCode[normalizedName] ?? null : null;
};

export const loadCatalogSeedItems = (fileName: string): unknown[] => {
  const readItemsById = (
    sourceFileName: string,
    itemIds: string[],
    trail: string[],
    targetFileName: string
  ) => {
    const sourceItems = readItems(sourceFileName, [...trail, targetFileName]);
    const sourceItemsById = new Map<string, unknown>();

    for (const item of sourceItems) {
      const itemId = isRecord(item) ? readString(item.id) : null;
      if (itemId) {
        sourceItemsById.set(itemId, item);
      }
    }

    const missingItemIds = itemIds.filter((itemId) => !sourceItemsById.has(itemId));
    if (missingItemIds.length > 0) {
      throw new Error(`Split seed manifest ${targetFileName} references missing item ids: ${missingItemIds.join(", ")}`);
    }

    return itemIds.map((itemId) => sourceItemsById.get(itemId)!);
  };

  const readItems = (targetFileName: string, trail: string[]): unknown[] => {
    if (trail.includes(targetFileName)) {
      throw new Error(`Circular seed manifest reference: ${[...trail, targetFileName].join(" -> ")}`);
    }

    const root = readCatalogFile(targetFileName);
    if (Array.isArray(root)) {
      return root;
    }

    if (isRecord(root) && Array.isArray(root.items)) {
      const schemaVersion = readString(root.schema_version);
      const sourceManifestSummary = isRecord(root.source_manifest_summary)
        ? root.source_manifest_summary
        : null;
      const existingItemIds = sourceManifestSummary
        ? readStringArray(sourceManifestSummary.existing_item_ids)
        : [];

      if (schemaVersion?.startsWith("brewing_additives_seed_v2_1") && existingItemIds.length > 0) {
        return [
          ...readItemsById(legacyAdditiveSourceCatalogFileName, existingItemIds, trail, targetFileName),
          ...root.items
        ];
      }

      return root.items;
    }

    if (isRecord(root) && Array.isArray(root.item_ids)) {
      const sourceCatalog = readString(root.source_catalog);
      const sourceCatalogFileName = sourceCatalog?.match(/([A-Za-z0-9_.-]+\.json)/)?.[1] ?? null;
      if (!sourceCatalogFileName) {
        throw new Error(`Split seed manifest ${targetFileName} is missing source_catalog JSON reference`);
      }

      const itemIds = readStringArray(root.item_ids);
      return readItemsById(sourceCatalogFileName, itemIds, trail, targetFileName);
    }

    throw new Error(`Unsupported seed root shape for ${targetFileName}`);
  };

  return readItems(fileName, []);
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
  const rawPickerGroup = readString(source.picker_group)
    ?? readString(source.group_ru)
    ?? readString(source.category)
    ?? readString(source.item_kind);
  const pickerGroup = canonicalizeConsumableSeedGroup(rawPickerGroup) ?? rawPickerGroup;
  const isNewAdditiveSeedItem = Boolean(readString(source.group_ru) || readString(source.beerxml_misc_type));
  const rawUsageStages = readStringArray(source.usage_stage);
  const allowedUses = readStringArray(source.allowed_uses);
  const usageStage = rawUsageStages.length > 0
    ? rawUsageStages
    : [...new Set(
      [readString(source.default_use), ...allowedUses]
        .map((stage) => normalizeSeedUseStage(stage))
        .filter((stage): stage is NonNullable<ReturnType<typeof normalizeSeedUseStage>> => stage != null)
    )];
  const commonForms = readStringArray(source.common_forms);
  const form = readString(source.form);
  const marketNamesRu = readStringArray(source.market_names_ru);
  const marketNamesEn = readStringArray(source.market_names_en);
  const searchBoostTerms = readStringArray(source.search_boost_terms);
  const searchPriorityTermsRu = [
    ...readStringArray(source.search_priority_terms_ru),
    ...searchBoostTerms
  ];
  const searchPriorityTermsEn = [
    ...readStringArray(source.search_priority_terms_en),
    ...readStringArray(source.aliases_en)
  ];
  const additiveGroupRu = readString(source.group_ru);
  const additiveSubcategoryRu = readString(source.subcategory_ru);
  const legacyCategory = readString(source.category);
  const legacySubcategory = readString(source.subcategory);

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
      groupName: additiveGroupRu,
      category: pickerGroup ?? readString(source.category),
      subcategory: isNewAdditiveSeedItem
        ? additiveSubcategoryRu
        : pickerGroup === "technical_additives"
          ? legacyCategory ?? legacySubcategory
          : legacySubcategory ?? legacyCategory,
      itemKind: pickerGroup ?? readString(source.item_kind),
      inventoryEnabled: true,
      attributes: compactRecord({
        common_forms: commonForms.length > 0 ? commonForms : form ? [form] : [],
        usage_stage: usageStage,
        dosage_reference: isRecord(source.dosage_reference)
          ? source.dosage_reference
          : compactRecord({
            hint_ru: readString(source.dosage_hint_ru),
            default_use: readString(source.default_use),
            allowed_uses: allowedUses
          }),
        family_key: readString(source.family_key),
        picker_group: pickerGroup,
        market_names_ru: marketNamesRu,
        market_names_en: marketNamesEn,
        search_priority_terms_ru: searchPriorityTermsRu,
        search_priority_terms_en: searchPriorityTermsEn,
        picker_function_ru: readString(source.picker_function_ru) ?? additiveSubcategoryRu ?? additiveGroupRu,
        picker_usage_ru: readString(source.picker_usage_ru) ?? readString(source.dosage_hint_ru),
        brand_family_mode: readString(source.brand_family_mode),
        beerxml_misc_type: readString(source.beerxml_misc_type),
        additive_group_ru: additiveGroupRu,
        additive_subcategory_ru: additiveSubcategoryRu,
        legacy_subcategory: legacySubcategory,
        default_use: readString(source.default_use),
        allowed_uses: allowedUses,
        stock_units: readStringArray(source.stock_units),
        flavor_tags_ru: readStringArray(source.flavor_tags_ru),
        typical_styles_ru: readStringArray(source.typical_styles_ru),
        gravity_contribution: readString(source.gravity_contribution),
        notes_ru: readString(source.notes_ru)
      }),
      quantityDefaults: buildConsumableQuantityDefaults(source)
    },
    aliases: buildAliasRows(id, [
      { locale: "ru", values: source.market_names_ru, source: "seed_market_name" },
      { locale: "en", values: source.market_names_en, source: "seed_market_name" },
      { locale: "ru", values: searchPriorityTermsRu, source: "seed_priority_term" },
      { locale: "en", values: searchPriorityTermsEn, source: "seed_priority_term" },
      { locale: "neutral", values: source.search_boost_terms, source: "seed_priority_term" },
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
        display_formula: readString(source.display_formula),
        calculation_formula: readString(source.calculation_formula),
        concentration_options: readStringArray(source.concentration_options),
        default_concentration_pct: readNumber(source.default_concentration_pct),
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
