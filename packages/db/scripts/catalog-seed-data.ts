import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { catalogDatasetManifest, catalogSnapshotId } from "./catalog-manifest";

type SeedLegacyType = "fermentable" | "hop" | "yeast" | "sugar" | "adjunct" | "fining" | "misc";
type SeedCategory = "fermentable" | "hop" | "yeast" | "water_prep" | "misc";
type SeedMatchPolicy = "exact_only" | "family_compatible";
type SeedCompletenessLevel = "minimum" | "recommended" | "full";
type SeedDisplayUnit = "g" | "kg" | "oz" | "lb" | "ml" | "l" | "gal" | "item" | "pack";
type SeedMeasurementDimension = "weight" | "volume" | "count";
type SeedHopForm = "pellet" | "whole_cone" | "lupulin" | "cryo" | "standard";
type SeedYeastType = "ale" | "lager" | "wine";
type SeedYeastForm = "dry" | "liquid";
type SeedWaterPrepPhysicalForm = "solid" | "powder" | "crystal" | "liquid" | "solution" | "tablet";
type SeedMiscUsagePhase = "mash" | "boil" | "whirlpool" | "fermentation" | "conditioning" | "packaging" | "water_prep" | "other";

type SeedCatalogFamily = {
  canonicalName: string;
  normalizedCanonicalName: string;
  displayNameRu: string | null;
  displayNameEn: string | null;
  matchPolicy: SeedMatchPolicy;
};

export type SeedCatalogItem = {
  sourceKey: string;
  sourceDataset: string;
  sourceSnapshot: string;
  type: SeedLegacyType;
  category: SeedCategory;
  subtype: string | null;
  family: SeedCatalogFamily;
  displayName: string;
  displayNameRu: string;
  displayNameEn: string | null;
  normalizedName: string;
  aliases: string[];
  searchAliasesNorm: string[];
  searchTextNorm: string;
  brandName: string | null;
  manufacturer: string | null;
  country: string | null;
  harvestYear: number | null;
  description: string | null;
  defaultUnit: SeedDisplayUnit;
  defaultDisplayUnit: SeedDisplayUnit;
  allowedUnits: SeedDisplayUnit[];
  measurementDimension: SeedMeasurementDimension;
  completenessLevel: SeedCompletenessLevel;
  technicalData: Record<string, unknown>;
  fermentableColorEbc: number | null;
  fermentableExtractYieldPct: number | null;
  hopAlphaAcidPct: number | null;
  hopForm: SeedHopForm | null;
  hopSeason: string | null;
  yeastAttenuationPct: number | null;
  yeastType: SeedYeastType | null;
  yeastForm: SeedYeastForm | null;
  yeastMinFermentationTempC: number | null;
  yeastMaxFermentationTempC: number | null;
  properties: Record<string, unknown>;
};

type SeedDraft = Omit<
  SeedCatalogItem,
  "displayName" | "displayNameRu" | "displayNameEn" | "normalizedName" | "aliases" | "searchAliasesNorm" | "searchTextNorm" | "family"
> & {
  baseDisplayName: string;
  displayNameEn: string | null;
  familyDisplayNameRu: string | null;
  familyDisplayNameEn: string | null;
  familyCanonicalName: string;
  rawAliases: string[];
  extraSearchAliasesNorm: string[];
  qualifierParts: string[];
  matchPolicy: SeedMatchPolicy;
};

type MaltCatalogItem = {
  id: string;
  brand?: string | null;
  brand_en?: string | null;
  brand_ru?: string | null;
  brand_name_en?: string | null;
  brand_name_ru?: string | null;
  brand_aliases_ru?: string[] | null;
  brand_aliases_en?: string[] | null;
  brand_display_en?: string | null;
  brand_display_ru?: string | null;
  country_name?: string | null;
  country_name_ru?: string | null;
  name_ru?: string | null;
  name_en?: string | null;
  display_name_ru?: string | null;
  display_name_en?: string | null;
  malt_type?: string | null;
  extract_pct_dry_basis?: number | null;
  color_ebc_min?: number | null;
  color_ebc_max?: number | null;
  color_ebc_is_approx?: boolean | null;
  protein_pct?: number | null;
  max_usage_pct?: number | null;
  aliases_ru?: string[] | null;
  aliases_en?: string[] | null;
  search_aliases?: string[] | null;
  search_aliases_norm?: string[] | null;
  source_label?: string | null;
  source_url?: string | null;
  source_kind?: string | null;
};

type HopCatalogItem = {
  id: string;
  slug?: string | null;
  name_ru?: string | null;
  name_en?: string | null;
  aliases_ru?: string[] | null;
  aliases_en?: string[] | null;
  search_aliases?: string[] | null;
  country_name_ru?: string | null;
  country_name_en?: string | null;
  producer?: string | null;
  producer_group?: string | null;
  producer_aliases_ru?: string[] | null;
  producer_aliases_en?: string[] | null;
  hop_form?: string | null;
  alpha_acid_pct_min?: number | null;
  alpha_acid_pct_max?: number | null;
  alpha_acid_pct_typical?: number | null;
  beta_acid_pct_min?: number | null;
  beta_acid_pct_max?: number | null;
  beta_acid_pct_typical?: number | null;
  oil_ml_100g_min?: number | null;
  oil_ml_100g_max?: number | null;
  oil_ml_100g_typical?: number | null;
  notes?: string | null;
};

type YeastCatalogItem = {
  id: string;
  slug?: string | null;
  brand?: string | null;
  producer_country?: string | null;
  product_code?: string | null;
  name_ru?: string | null;
  name_en?: string | null;
  display_name?: string | null;
  aliases_ru?: string[] | null;
  aliases_en?: string[] | null;
  search_aliases?: string[] | null;
  form?: string | null;
  yeast_family?: string | null;
  attenuation_pct_min?: number | null;
  attenuation_pct_max?: number | null;
  attenuation_pct_typical?: number | null;
  flocculation?: string | null;
  fermentation_temp_c_min?: number | null;
  fermentation_temp_c_max?: number | null;
  alcohol_tolerance_abv_min?: number | null;
  alcohol_tolerance_abv_max?: number | null;
  alcohol_tolerance_abv_typical?: number | null;
  pof?: boolean | null;
  notes?: string | null;
  analog_reference?: string | null;
};

type NonMaltFermentableItem = {
  id: string;
  source_category_ru?: string | null;
  group?: string | null;
  ingredient_type?: string | null;
  name_ru?: string | null;
  name_en?: string | null;
  display_name?: string | null;
  aliases_ru?: string[] | null;
  aliases_en?: string[] | null;
  search_aliases?: string[] | null;
  producer?: string | null;
  country_name?: string | null;
  extract_pct_dry_basis?: number | null;
  color_ebc_exact?: number | null;
  color_lovibond?: number | null;
  protein_pct?: number | null;
  recommended_max_pct?: number | null;
  source_kind?: string | null;
  source_url?: string | null;
  source_primary?: string | null;
};

type WaterCatalogItem = {
  id: string;
  display_name?: string | null;
  name_ru?: string | null;
  name_en?: string | null;
  aliases_ru?: string[] | null;
  aliases_en?: string[] | null;
  search_aliases?: string[] | null;
  item_kind?: string | null;
  category?: string | null;
  formula?: string | null;
  common_forms?: string[] | null;
  concentration_options?: unknown;
  unit_preferred?: string | null;
  water_calc_role?: string[] | null;
  typical_use_ru?: string | null;
  cautions_ru?: string | null;
  storage_notes_ru?: string | null;
  source_basis?: string[] | null;
};

type ConsumableCatalogItem = {
  id: string;
  display_name?: string | null;
  name_ru?: string | null;
  name_en?: string | null;
  aliases_ru?: string[] | null;
  aliases_en?: string[] | null;
  search_aliases?: string[] | null;
  item_kind?: string | null;
  category?: string | null;
  subcategory?: string | null;
  common_forms?: string[] | null;
  unit_preferred?: string | null;
  inventory_modes_supported?: string[] | null;
  usage_stage?: string[] | null;
  dosage_reference?: {
    common_ratio?: string | null;
    example_reference?: string | null;
  } | null;
  typical_use_ru?: string | null;
  storage_notes_ru?: string | null;
};

const punctuationRegex = /[“”"'`´]/g;
const separatorsRegex = /[_,;:|/\\]+/g;
const whitespaceRegex = /\s+/g;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const ingredientsDir = path.resolve(scriptDir, "../../..", "ingredients");

const weightUnits: SeedDisplayUnit[] = ["g", "kg", "oz", "lb"];
const volumeUnits: SeedDisplayUnit[] = ["ml", "l", "gal"];
const countUnits: SeedDisplayUnit[] = ["item", "pack"];

const normalizeIngredientName = (value: string) => value
  .normalize("NFKC")
  .toLowerCase()
  .replace(punctuationRegex, "")
  .replace(separatorsRegex, " ")
  .replace(whitespaceRegex, " ")
  .trim();

const toDatasetToken = (value: string | null | undefined) => normalizeIngredientName(value ?? "").replace(/\s+/g, "_");

const readJsonFile = <T>(fileName: string): T => {
  const filePath = path.join(ingredientsDir, fileName);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
};

const readText = (...values: unknown[]) => {
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

const readNumber = (...values: unknown[]) => {
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

const averageNumbers = (...values: Array<number | null | undefined>) => {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!finite.length) {
    return null;
  }

  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
};

const roundTo = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const dedupeStrings = (values: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const trimmed = readText(value);
    if (!trimmed) {
      continue;
    }

    const normalized = normalizeIngredientName(trimmed);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    out.push(trimmed);
  }

  return out;
};

const normalizeAliasList = (values: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const trimmed = readText(value);
    if (!trimmed) {
      continue;
    }

    const normalized = normalizeIngredientName(trimmed);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    out.push(normalized);
  }

  return out;
};

const buildSearchTextNorm = (values: Array<string | null | undefined>) => {
  const parts = normalizeAliasList(values);
  return normalizeIngredientName(parts.join(" "));
};

const replaceWithCase = (source: string, pattern: RegExp, replacement: string) => source.replace(pattern, (match) => (
  match[0] === match[0].toUpperCase()
    ? replacement[0].toUpperCase() + replacement.slice(1)
    : replacement
));

const correctRussianDisplaySpelling = (value: string | null | undefined) => {
  const text = readText(value);
  if (!text) {
    return null;
  }

  return [
    [/пильзнер/gi, "пилснер"],
    [/пильснер/gi, "пилснер"],
    [/пильзен/gi, "пилзен"]
  ].reduce((current, [pattern, replacement]) => replaceWithCase(current, pattern, replacement), text);
};

const buildDescription = (...parts: Array<string | null | undefined>) => {
  const lines = dedupeStrings(parts)
    .map((line) => line.replace(whitespaceRegex, " ").trim())
    .filter(Boolean);

  return lines.length ? lines.join("\n\n") : null;
};

const containsToken = (value: string | null | undefined, ...tokens: string[]) => {
  const normalized = normalizeIngredientName(value ?? "");
  return tokens.some((token) => normalized.includes(normalizeIngredientName(token)));
};

const toWeightProfile = (defaultDisplayUnit: SeedDisplayUnit = "g") => ({
  defaultDisplayUnit,
  allowedUnits: [...weightUnits],
  measurementDimension: "weight" as const
});

const toVolumeProfile = (defaultDisplayUnit: SeedDisplayUnit = "ml") => ({
  defaultDisplayUnit,
  allowedUnits: [...volumeUnits],
  measurementDimension: "volume" as const
});

const toCountProfile = (defaultDisplayUnit: SeedDisplayUnit = "item") => ({
  defaultDisplayUnit,
  allowedUnits: [...countUnits],
  measurementDimension: "count" as const
});

const resolveUnitProfile = (unit: string | null | undefined) => {
  const normalized = normalizeIngredientName(unit ?? "");

  if (["g", "gram", "grams", "mg"].includes(normalized)) {
    return toWeightProfile("g");
  }

  if (normalized === "kg") {
    return toWeightProfile("kg");
  }

  if (["ml", "milliliter", "milliliters"].includes(normalized)) {
    return toVolumeProfile("ml");
  }

  if (["l", "liter", "liters"].includes(normalized)) {
    return toVolumeProfile("l");
  }

  if (normalized === "gal") {
    return toVolumeProfile("gal");
  }

  if (["pack", "package", "packages"].includes(normalized)) {
    return toCountProfile("pack");
  }

  if (["pcs", "pc", "piece", "pieces", "tablet", "tablets", "item", "items"].includes(normalized)) {
    return toCountProfile("item");
  }

  return null;
};

const parseStrengthFromText = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    const text = readText(value);
    if (!text) {
      continue;
    }

    const match = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (!match) {
      continue;
    }

    const parsed = Number(match[1].replace(",", "."));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const mapWaterPhysicalForm = (values: Array<string | null | undefined>): SeedWaterPrepPhysicalForm | null => {
  const normalized = values
    .map((value) => normalizeIngredientName(value ?? ""))
    .filter(Boolean)
    .join(" ");

  if (!normalized) {
    return null;
  }

  if (normalized.includes("tablet")) return "tablet";
  if (normalized.includes("liquid")) return "liquid";
  if (normalized.includes("solution")) return "solution";
  if (normalized.includes("crystal") || normalized.includes("crystals")) return "crystal";
  if (normalized.includes("powder")) return "powder";
  return "solid";
};

const mapMiscUsagePhase = (values: Array<string | null | undefined>): SeedMiscUsagePhase | null => {
  const normalized = values
    .map((value) => normalizeIngredientName(value ?? ""))
    .filter(Boolean)
    .join(" ");

  if (!normalized) {
    return null;
  }

  if (normalized.includes("mash")) return "mash";
  if (normalized.includes("boil")) return "boil";
  if (normalized.includes("whirlpool")) return "whirlpool";
  if (normalized.includes("fermentation")) return "fermentation";
  if (normalized.includes("conditioning")) return "conditioning";
  if (normalized.includes("packaging") || normalized.includes("finished beer")) return "packaging";
  if (normalized.includes("water prep") || normalized.includes("water treatment")) return "water_prep";
  return "other";
};

const mapHopForm = (value: string | null | undefined): SeedHopForm => {
  const normalized = toDatasetToken(value);

  if (normalized === "cryo") return "cryo";
  if (normalized === "lupulin_concentrate" || normalized === "lupomax" || normalized === "lupulin") return "lupulin";
  if (normalized === "whole_cone" || normalized === "leaf" || normalized === "cone") return "whole_cone";
  return "standard";
};

const mapYeastSubtype = (value: string | null | undefined, displayName: string) => {
  const normalized = toDatasetToken(value);
  const name = normalizeIngredientName(displayName);

  if (normalized.includes("kveik") || name.includes("kveik")) return "kveik" as const;
  if (normalized.includes("belgian_wit") || normalized.includes("wheat") || name.includes("wit") || name.includes("weizen")) return "wheat" as const;
  if (normalized.includes("belgian") || normalized.includes("saison") || name.includes("saison")) return "belgian" as const;
  if (normalized.includes("brett") || normalized.includes("sour") || normalized.includes("blend")) return "wild_bacteria" as const;
  if (normalized.includes("lager") || name.includes("lager")) return "lager" as const;
  if (
    normalized.includes("ale")
    || normalized.includes("american")
    || normalized.includes("english")
    || normalized.includes("ipa")
    || normalized.includes("hazy")
    || normalized.includes("hybrid")
    || normalized.includes("neutral")
    || normalized.includes("conditioning")
    || normalized.includes("high_gravity")
    || normalized.includes("low_no_alcohol")
    || name.includes("ale")
  ) {
    return "ale" as const;
  }

  return "other" as const;
};

const mapLegacyYeastType = (subtype: ReturnType<typeof mapYeastSubtype>): SeedYeastType => (
  subtype === "lager" ? "lager" : "ale"
);

const mapYeastFlocculation = (value: string | null | undefined) => {
  const normalized = normalizeIngredientName(value ?? "");

  if (normalized === "very_high" || normalized === "very high") return "very_high" as const;
  if (normalized === "high") return "high" as const;
  if (normalized === "medium") return "medium" as const;
  if (normalized === "low") return "low" as const;
  return null;
};

const mapMaltSubtype = (value: string | null | undefined) => {
  const normalized = toDatasetToken(value);

  if (["base", "wheat"].includes(normalized)) return "base_malt" as const;
  if (normalized === "roasted") return "roasted_malt" as const;
  return "specialty_malt" as const;
};

const pickMaltUsageFlags = (value: string | null | undefined) => {
  const normalized = normalizeIngredientName(value ?? "");

  if (!normalized) {
    return [];
  }

  if (normalized.includes("smoked")) return ["smoked"];
  if (normalized.includes("wheat")) return ["wheat"];
  if (normalized.includes("rye")) return ["rye"];
  if (normalized.includes("alternative_grain")) return ["alternative_grain"];
  return [];
};

const isLiquidExtractLike = (item: NonMaltFermentableItem) => {
  const haystack = [
    item.ingredient_type,
    item.name_ru,
    item.name_en,
    item.display_name
  ].map((value) => normalizeIngredientName(value ?? "")).join(" ");

  return [
    "syrup",
    "molasses",
    "juice",
    "concentrate",
    "extract liquid",
    "liquid",
    "сусло",
    "концентрат",
    "сироп"
  ].some((token) => haystack.includes(token));
};

const classifyNonMaltItem = (item: NonMaltFermentableItem) => {
  const ingredientType = toDatasetToken(item.ingredient_type);
  const name = normalizeIngredientName(readText(item.name_ru, item.display_name, item.name_en) ?? "");

  if (name.includes("rice hull")) {
    return {
      type: "adjunct" as const,
      category: "misc" as const,
      subtype: "process_aid" as const,
      unitProfile: toWeightProfile("g")
    };
  }

  if (["cocoa", "cacao", "peanut", "coconut", "vanilla", "coffee"].some((token) => name.includes(token))) {
    return {
      type: "adjunct" as const,
      category: "misc" as const,
      subtype: "flavoring" as const,
      unitProfile: toWeightProfile("g")
    };
  }

  if (["sugar", "body_builder", "coloring_sugar"].includes(ingredientType)) {
    return {
      type: "sugar" as const,
      category: "fermentable" as const,
      subtype: "sugar" as const,
      unitProfile: toWeightProfile("g")
    };
  }

  if (["syrup", "molasses", "honey"].includes(ingredientType)) {
    return {
      type: "sugar" as const,
      category: "fermentable" as const,
      subtype: "syrup_honey" as const,
      unitProfile: ingredientType === "syrup" || ingredientType === "molasses" ? toVolumeProfile("ml") : toWeightProfile("g")
    };
  }

  if ([
    "fruit_or_vegetable",
    "juice_concentrate",
    "juice",
    "dried_fruit",
    "fruit_puree"
  ].includes(ingredientType)) {
    return {
      type: "adjunct" as const,
      category: "fermentable" as const,
      subtype: "fruit_fermentable" as const,
      unitProfile: ingredientType === "juice" || ingredientType === "juice_concentrate" ? toVolumeProfile("ml") : toWeightProfile("g")
    };
  }

  if ([
    "malt_extract",
    "coloring_extract",
    "extract",
    "kvass_concentrate",
    "malt_corn_concentrate"
  ].includes(ingredientType)) {
    return {
      type: "fermentable" as const,
      category: "fermentable" as const,
      subtype: isLiquidExtractLike(item) ? "extract_liquid" as const : "extract_dry" as const,
      unitProfile: isLiquidExtractLike(item) ? toVolumeProfile("ml") : toWeightProfile("g")
    };
  }

  return {
    type: "adjunct" as const,
    category: "fermentable" as const,
    subtype: "adjunct_grain" as const,
    unitProfile: toWeightProfile("g")
  };
};

const cleanHopFamilyName = (value: string | null | undefined, form: SeedHopForm) => {
  const source = readText(value) ?? "";

  if (!source) {
    return null;
  }

  if (form === "cryo") {
    return source.replace(/\s+крио$/i, "").trim() || source;
  }

  if (form === "lupulin") {
    return source
      .replace(/^лупулин\s+/i, "")
      .replace(/\s+lupomax$/i, "")
      .trim() || source;
  }

  return source;
};

const resolveCompletenessLevel = (input: {
  category: SeedCategory;
  manufacturer?: string | null;
  country?: string | null;
  displayName: string;
  description?: string | null;
  aliases: string[];
  fermentableColorEbc?: number | null;
  fermentableExtractYieldPct?: number | null;
  hopAlphaAcidPct?: number | null;
  hopSeason?: string | null;
  yeastAttenuationPct?: number | null;
  yeastForm?: SeedYeastForm | null;
  technicalData?: Record<string, unknown>;
}) => {
  if (input.category === "fermentable" && input.fermentableColorEbc != null && input.fermentableExtractYieldPct != null) {
    return input.manufacturer && input.country ? "full" as const : "recommended" as const;
  }

  if (input.category === "hop" && input.hopAlphaAcidPct != null) {
    return input.manufacturer && input.country && input.hopSeason ? "full" as const : "recommended" as const;
  }

  if (input.category === "yeast" && input.yeastAttenuationPct != null && input.yeastForm) {
    return input.manufacturer && input.country ? "full" as const : "recommended" as const;
  }

  if (input.description || input.aliases.length || input.manufacturer) {
    return "recommended" as const;
  }

  return "minimum" as const;
};

const finalizeDrafts = (drafts: SeedDraft[]): SeedCatalogItem[] => {
  const grouped = new Map<string, SeedDraft[]>();

  for (const draft of drafts) {
    const key = `${draft.type}:${normalizeIngredientName(draft.baseDisplayName)}`;
    grouped.set(key, [...(grouped.get(key) ?? []), draft]);
  }

  const finalized: SeedCatalogItem[] = [];

  for (const draftsForName of grouped.values()) {
    const usedWithinGroup = new Set<string>();

    for (const draft of draftsForName.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey))) {
      const baseDisplayName = correctRussianDisplaySpelling(draft.baseDisplayName) ?? draft.baseDisplayName;
      const displayNameEn = correctRussianDisplaySpelling(draft.displayNameEn) ?? draft.displayNameEn;
      const familyDisplayNameRu = correctRussianDisplaySpelling(draft.familyDisplayNameRu) ?? draft.familyDisplayNameRu;
      const familyDisplayNameEn = correctRussianDisplaySpelling(draft.familyDisplayNameEn) ?? draft.familyDisplayNameEn;
      const familyCanonicalName = correctRussianDisplaySpelling(draft.familyCanonicalName) ?? draft.familyCanonicalName;
      const qualifiers = draft.qualifierParts.filter((part) => {
        const normalizedPart = normalizeIngredientName(part);
        return normalizedPart && normalizedPart !== normalizeIngredientName(baseDisplayName);
      });

      let displayName = baseDisplayName;

      if (draftsForName.length > 1) {
        let candidate = displayName;

        for (let index = 0; index < qualifiers.length; index += 1) {
          candidate = `${baseDisplayName} (${qualifiers.slice(0, index + 1).join(", ")})`;
          if (!usedWithinGroup.has(normalizeIngredientName(candidate))) {
            displayName = candidate;
            break;
          }
        }

        if (usedWithinGroup.has(normalizeIngredientName(displayName))) {
          displayName = `${baseDisplayName} (${draft.sourceKey})`;
        }
      }

      const aliases = dedupeStrings([
        ...draft.rawAliases,
        baseDisplayName,
        displayNameEn,
        familyDisplayNameRu,
        familyDisplayNameEn,
        ...qualifiers
      ]);
      const searchAliasesNorm = normalizeAliasList([
        ...aliases,
        ...draft.extraSearchAliasesNorm,
        baseDisplayName,
        displayNameEn,
        familyDisplayNameRu,
        familyDisplayNameEn,
        ...qualifiers
      ]);
      const displayNameRu = displayName;
      const finalDisplayNameEn = displayNameEn ?? displayName;

      usedWithinGroup.add(normalizeIngredientName(displayName));

      finalized.push({
        sourceKey: draft.sourceKey,
        sourceDataset: draft.sourceDataset,
        sourceSnapshot: draft.sourceSnapshot,
        type: draft.type,
        category: draft.category,
        subtype: draft.subtype,
        family: {
          canonicalName: familyCanonicalName,
          normalizedCanonicalName: normalizeIngredientName(familyCanonicalName),
          displayNameRu: familyDisplayNameRu,
          displayNameEn: familyDisplayNameEn,
          matchPolicy: draft.matchPolicy
        },
        displayName,
        displayNameRu,
        displayNameEn: finalDisplayNameEn,
        normalizedName: normalizeIngredientName(displayName),
        aliases,
        searchAliasesNorm,
        searchTextNorm: buildSearchTextNorm([
          displayName,
          finalDisplayNameEn,
          ...aliases,
          ...searchAliasesNorm,
          draft.brandName,
          draft.manufacturer,
          draft.country,
          familyCanonicalName,
          familyDisplayNameRu,
          familyDisplayNameEn,
          ...qualifiers
        ]),
        brandName: draft.brandName,
        manufacturer: draft.manufacturer,
        country: draft.country,
        harvestYear: draft.harvestYear,
        description: draft.description,
        defaultUnit: draft.defaultUnit,
        defaultDisplayUnit: draft.defaultDisplayUnit,
        allowedUnits: draft.allowedUnits,
        measurementDimension: draft.measurementDimension,
        completenessLevel: draft.completenessLevel,
        technicalData: draft.technicalData,
        fermentableColorEbc: draft.fermentableColorEbc,
        fermentableExtractYieldPct: draft.fermentableExtractYieldPct,
        hopAlphaAcidPct: draft.hopAlphaAcidPct,
        hopForm: draft.hopForm,
        hopSeason: draft.hopSeason,
        yeastAttenuationPct: draft.yeastAttenuationPct,
        yeastType: draft.yeastType,
        yeastForm: draft.yeastForm,
        yeastMinFermentationTempC: draft.yeastMinFermentationTempC,
        yeastMaxFermentationTempC: draft.yeastMaxFermentationTempC,
        properties: draft.properties
      });
    }
  }

  const uniqueKeys = new Set<string>();
  const deduped: SeedCatalogItem[] = [];

  for (const item of finalized.sort((left, right) => left.displayName.localeCompare(right.displayName, "ru"))) {
    let displayName = item.displayName;
    let normalizedName = item.normalizedName;
    let key = `${item.type}:${normalizedName}`;

    if (uniqueKeys.has(key)) {
      displayName = `${item.displayName} (${item.sourceKey})`;
      normalizedName = normalizeIngredientName(displayName);
      key = `${item.type}:${normalizedName}`;
    }

    uniqueKeys.add(key);
    deduped.push({
      ...item,
      displayName,
      displayNameRu: displayName,
      normalizedName,
      aliases: dedupeStrings([...item.aliases, displayName]),
      searchAliasesNorm: normalizeAliasList([
        ...item.searchAliasesNorm,
        ...item.aliases,
        displayName,
        item.displayNameEn,
        item.family.displayNameRu,
        item.family.displayNameEn,
        item.brandName,
        item.manufacturer,
        item.country
      ]),
      searchTextNorm: buildSearchTextNorm([
        displayName,
        item.displayNameEn,
        ...item.aliases,
        ...item.searchAliasesNorm,
        item.brandName,
        item.manufacturer,
        item.country,
        item.family.canonicalName,
        item.family.displayNameRu,
        item.family.displayNameEn
      ])
    });
  }

  return deduped;
};

const buildMaltDrafts = () => {
  const dataset = catalogDatasetManifest.malt;
  const data = readJsonFile<{ items: MaltCatalogItem[] }>(dataset.fileName);

  return data.items.map((item): SeedDraft => {
    const subtype = mapMaltSubtype(item.malt_type);
    const profile = toWeightProfile("kg");
    const colorEbc = averageNumbers(item.color_ebc_min, item.color_ebc_max);
    const manufacturer = readText(item.brand_ru, item.brand_en, item.brand);
    const brandDisplay = readText(
      item.brand_display_ru,
      item.brand_display_en,
      item.brand_name_ru,
      item.brand_name_en,
      item.brand_ru,
      item.brand_en,
      item.brand
    );
    const country = readText(item.country_name_ru, item.country_name);
    const baseDisplayName = readText(item.display_name_ru, item.name_ru, item.display_name_en, item.name_en) ?? item.id;
    const familyName = readText(item.name_ru, item.name_en, baseDisplayName) ?? baseDisplayName;
    const rawAliases = dedupeStrings([
      ...(item.search_aliases ?? []),
      ...(item.aliases_ru ?? []),
      ...(item.aliases_en ?? []),
      ...(item.brand_aliases_ru ?? []),
      ...(item.brand_aliases_en ?? []),
      item.display_name_ru,
      item.display_name_en,
      item.name_ru,
      item.name_en,
      brandDisplay,
      manufacturer
    ]);
    const technicalData = {
      category: "fermentable" as const,
      subtype,
      colorEbc,
      extractYieldPct: readNumber(item.extract_pct_dry_basis),
      proteinPct: readNumber(item.protein_pct),
      moisturePct: null,
      maxUsagePercent: readNumber(item.max_usage_pct),
      diastaticPowerLintner: null,
      usageFlags: pickMaltUsageFlags(item.malt_type)
    };

    return {
      sourceKey: item.id,
      sourceDataset: dataset.datasetId,
      sourceSnapshot: catalogSnapshotId,
      type: "fermentable",
      category: "fermentable",
      subtype,
      baseDisplayName,
      displayNameEn: readText(item.display_name_en, item.name_en),
      familyDisplayNameRu: readText(item.name_ru, familyName),
      familyDisplayNameEn: readText(item.name_en),
      familyCanonicalName: readText(item.name_ru, item.name_en, familyName) ?? familyName,
      rawAliases,
      extraSearchAliasesNorm: normalizeAliasList(item.search_aliases_norm ?? []),
      qualifierParts: dedupeStrings([manufacturer, country]),
      brandName: brandDisplay,
      manufacturer,
      country,
      harvestYear: null,
      description: null,
      defaultUnit: profile.defaultDisplayUnit,
      defaultDisplayUnit: profile.defaultDisplayUnit,
      allowedUnits: profile.allowedUnits,
      measurementDimension: profile.measurementDimension,
      completenessLevel: resolveCompletenessLevel({
        category: "fermentable",
        manufacturer,
        country,
        displayName: baseDisplayName,
        aliases: rawAliases,
        fermentableColorEbc: colorEbc,
        fermentableExtractYieldPct: readNumber(item.extract_pct_dry_basis)
      }),
      technicalData,
      fermentableColorEbc: colorEbc,
      fermentableExtractYieldPct: readNumber(item.extract_pct_dry_basis),
      hopAlphaAcidPct: null,
      hopForm: null,
      hopSeason: null,
      yeastAttenuationPct: null,
      yeastType: null,
      yeastForm: null,
      yeastMinFermentationTempC: null,
      yeastMaxFermentationTempC: null,
      properties: {
        seedDataset: dataset.datasetId,
        seedSnapshot: catalogSnapshotId,
        seedSourceId: item.id,
        nameRu: item.name_ru ?? null,
        nameEn: item.name_en ?? null,
        sourceLabel: item.source_label ?? null,
        sourceUrl: item.source_url ?? null,
        sourceKind: item.source_kind ?? null,
        maltType: item.malt_type ?? null,
        colorEbcMin: item.color_ebc_min ?? null,
        colorEbcMax: item.color_ebc_max ?? null,
        colorEbcApprox: item.color_ebc_is_approx ?? null
      },
      matchPolicy: "family_compatible"
    };
  });
};

const buildHopDrafts = () => {
  const dataset = catalogDatasetManifest.hop;
  const data = readJsonFile<HopCatalogItem[]>(dataset.fileName);

  return data.map((item): SeedDraft => {
    const hopForm = mapHopForm(item.hop_form);
    const profile = toWeightProfile("g");
    const manufacturer = readText(item.producer_group, item.producer);
    const country = readText(item.country_name_ru, item.country_name_en);
    const baseDisplayName = readText(item.name_ru, item.name_en, item.slug) ?? item.id;
    const familyDisplayNameRu = cleanHopFamilyName(item.name_ru, hopForm) ?? baseDisplayName;
    const familyDisplayNameEn = cleanHopFamilyName(item.name_en, hopForm);
    const alphaAcidPct = readNumber(item.alpha_acid_pct_typical, averageNumbers(item.alpha_acid_pct_min, item.alpha_acid_pct_max));
    const betaAcidPct = readNumber(item.beta_acid_pct_typical, averageNumbers(item.beta_acid_pct_min, item.beta_acid_pct_max));
    const totalOilMlPer100g = readNumber(item.oil_ml_100g_typical, averageNumbers(item.oil_ml_100g_min, item.oil_ml_100g_max));
    const rawAliases = dedupeStrings([
      ...(item.search_aliases ?? []),
      ...(item.aliases_ru ?? []),
      ...(item.aliases_en ?? []),
      ...(item.producer_aliases_ru ?? []),
      ...(item.producer_aliases_en ?? []),
      item.name_ru,
      item.name_en,
      manufacturer
    ]);
    const technicalData = {
      category: "hop" as const,
      subtype: hopForm,
      alphaAcidPct,
      betaAcidPct,
      totalOilMlPer100g,
      notes: readText(item.notes),
      harvestYear: null
    };

    return {
      sourceKey: item.id,
      sourceDataset: dataset.datasetId,
      sourceSnapshot: catalogSnapshotId,
      type: "hop",
      category: "hop",
      subtype: hopForm,
      baseDisplayName,
      displayNameEn: readText(item.name_en),
      familyDisplayNameRu,
      familyDisplayNameEn,
      familyCanonicalName: readText(familyDisplayNameRu, familyDisplayNameEn, baseDisplayName) ?? baseDisplayName,
      rawAliases,
      extraSearchAliasesNorm: [],
      qualifierParts: dedupeStrings([manufacturer, country]),
      brandName: manufacturer,
      manufacturer,
      country,
      harvestYear: null,
      description: readText(item.notes),
      defaultUnit: profile.defaultDisplayUnit,
      defaultDisplayUnit: profile.defaultDisplayUnit,
      allowedUnits: profile.allowedUnits,
      measurementDimension: profile.measurementDimension,
      completenessLevel: resolveCompletenessLevel({
        category: "hop",
        manufacturer,
        country,
        displayName: baseDisplayName,
        aliases: rawAliases,
        hopAlphaAcidPct: alphaAcidPct,
        hopSeason: null
      }),
      technicalData,
      fermentableColorEbc: null,
      fermentableExtractYieldPct: null,
      hopAlphaAcidPct: alphaAcidPct,
      hopForm,
      hopSeason: null,
      yeastAttenuationPct: null,
      yeastType: null,
      yeastForm: null,
      yeastMinFermentationTempC: null,
      yeastMaxFermentationTempC: null,
      properties: {
        seedDataset: dataset.datasetId,
        seedSnapshot: catalogSnapshotId,
        seedSourceId: item.id,
        nameRu: item.name_ru ?? null,
        nameEn: item.name_en ?? null,
        producer: item.producer ?? null,
        producerGroup: item.producer_group ?? null,
        hopFormSource: item.hop_form ?? null
      },
      matchPolicy: "family_compatible"
    };
  });
};

const buildYeastDrafts = () => {
  const dataset = catalogDatasetManifest.yeast;
  const data = readJsonFile<{ items: YeastCatalogItem[] }>(dataset.fileName);

  return data.items.map((item): SeedDraft => {
    const displayName = readText(item.name_ru, item.display_name, item.name_en, item.product_code) ?? item.id;
    const subtype = mapYeastSubtype(item.yeast_family, displayName);
    const manufacturer = readText(item.brand);
    const attenuationPct = readNumber(
      item.attenuation_pct_typical,
      averageNumbers(item.attenuation_pct_min, item.attenuation_pct_max)
    );
    const alcoholTolerancePct = readNumber(
      item.alcohol_tolerance_abv_typical,
      averageNumbers(item.alcohol_tolerance_abv_min, item.alcohol_tolerance_abv_max)
    );
    const yeastForm = item.form === "liquid" ? "liquid" as const : "dry" as const;
    const rawAliases = dedupeStrings([
      ...(item.search_aliases ?? []),
      ...(item.aliases_ru ?? []),
      ...(item.aliases_en ?? []),
      item.display_name,
      item.name_ru,
      item.name_en,
      item.product_code,
      manufacturer,
      item.analog_reference
    ]);
    const technicalData = {
      category: "yeast" as const,
      subtype,
      form: yeastForm,
      attenuationPct,
      tempMinC: readNumber(item.fermentation_temp_c_min),
      tempMaxC: readNumber(item.fermentation_temp_c_max),
      flocculation: mapYeastFlocculation(item.flocculation),
      alcoholTolerancePct,
      packageSize: null,
      packageUnit: null,
      phenolic: typeof item.pof === "boolean" ? item.pof : null,
      diastaticus: null
    };

    return {
      sourceKey: item.id,
      sourceDataset: dataset.datasetId,
      sourceSnapshot: catalogSnapshotId,
      type: "yeast",
      category: "yeast",
      subtype,
      baseDisplayName: displayName,
      displayNameEn: readText(item.name_en),
      familyDisplayNameRu: readText(item.name_ru, item.product_code, displayName),
      familyDisplayNameEn: readText(item.name_en),
      familyCanonicalName: readText(item.name_ru, item.product_code, item.name_en, displayName) ?? displayName,
      rawAliases,
      extraSearchAliasesNorm: [],
      qualifierParts: dedupeStrings([manufacturer]),
      brandName: manufacturer,
      manufacturer,
      country: readText(item.producer_country),
      harvestYear: null,
      description: buildDescription(item.notes, item.analog_reference),
      defaultUnit: "pack",
      defaultDisplayUnit: "pack",
      allowedUnits: yeastForm === "liquid" ? ["pack", "ml"] : ["pack", "g"],
      measurementDimension: "count",
      completenessLevel: resolveCompletenessLevel({
        category: "yeast",
        manufacturer,
        country: readText(item.producer_country),
        displayName,
        aliases: rawAliases,
        description: buildDescription(item.notes, item.analog_reference),
        yeastAttenuationPct: attenuationPct,
        yeastForm
      }),
      technicalData,
      fermentableColorEbc: null,
      fermentableExtractYieldPct: null,
      hopAlphaAcidPct: null,
      hopForm: null,
      hopSeason: null,
      yeastAttenuationPct: attenuationPct,
      yeastType: mapLegacyYeastType(subtype),
      yeastForm,
      yeastMinFermentationTempC: readNumber(item.fermentation_temp_c_min),
      yeastMaxFermentationTempC: readNumber(item.fermentation_temp_c_max),
      properties: {
        seedDataset: dataset.datasetId,
        seedSnapshot: catalogSnapshotId,
        seedSourceId: item.id,
        nameRu: item.name_ru ?? null,
        nameEn: item.name_en ?? null,
        productCode: item.product_code ?? null,
        yeastFamily: item.yeast_family ?? null,
        analogReference: item.analog_reference ?? null
      },
      matchPolicy: "exact_only"
    };
  });
};

const buildNonMaltDrafts = () => {
  const dataset = catalogDatasetManifest.nonMaltFermentable;
  const data = readJsonFile<{ items: NonMaltFermentableItem[] }>(dataset.fileName);

  return data.items.map((item): SeedDraft => {
    const classification = classifyNonMaltItem(item);
    const displayName = readText(item.name_ru, item.display_name, item.name_en) ?? item.id;
    const familyName = readText(item.name_ru, item.name_en, displayName) ?? displayName;
    const manufacturer = readText(item.producer);
    const colorEbc = readNumber(item.color_ebc_exact) ?? (
      readNumber(item.color_lovibond) != null
        ? roundTo((item.color_lovibond as number) * 1.97, 1)
        : null
    );
    const rawAliases = dedupeStrings([
      ...(item.search_aliases ?? []),
      ...(item.aliases_ru ?? []),
      ...(item.aliases_en ?? []),
      item.display_name,
      item.name_ru,
      item.name_en,
      manufacturer
    ]);
    const technicalData = classification.category === "fermentable"
      ? {
          category: "fermentable" as const,
          subtype: classification.subtype,
          colorEbc,
          extractYieldPct: readNumber(item.extract_pct_dry_basis),
          proteinPct: readNumber(item.protein_pct),
          moisturePct: null,
          maxUsagePercent: readNumber(item.recommended_max_pct),
          diastaticPowerLintner: null,
          usageFlags: []
        }
      : {
          category: "misc" as const,
          subtype: classification.subtype,
          usagePhase: containsToken(displayName, "rice hull") ? "mash" as const : "other" as const,
          doseHint: null
        };

    return {
      sourceKey: item.id,
      sourceDataset: dataset.datasetId,
      sourceSnapshot: catalogSnapshotId,
      type: classification.type,
      category: classification.category,
      subtype: classification.subtype,
      baseDisplayName: displayName,
      displayNameEn: readText(item.name_en),
      familyDisplayNameRu: readText(item.name_ru, displayName),
      familyDisplayNameEn: readText(item.name_en),
      familyCanonicalName: familyName,
      rawAliases,
      extraSearchAliasesNorm: [],
      qualifierParts: dedupeStrings([manufacturer]),
      brandName: manufacturer,
      manufacturer,
      country: readText(item.country_name),
      harvestYear: null,
      description: null,
      defaultUnit: classification.unitProfile.defaultDisplayUnit,
      defaultDisplayUnit: classification.unitProfile.defaultDisplayUnit,
      allowedUnits: classification.unitProfile.allowedUnits,
      measurementDimension: classification.unitProfile.measurementDimension,
      completenessLevel: resolveCompletenessLevel({
        category: classification.category,
        manufacturer,
        country: readText(item.country_name),
        displayName,
        aliases: rawAliases,
        fermentableColorEbc: classification.category === "fermentable" ? colorEbc : null,
        fermentableExtractYieldPct: classification.category === "fermentable" ? readNumber(item.extract_pct_dry_basis) : null,
        description: null
      }),
      technicalData,
      fermentableColorEbc: classification.category === "fermentable" ? colorEbc : null,
      fermentableExtractYieldPct: classification.category === "fermentable" ? readNumber(item.extract_pct_dry_basis) : null,
      hopAlphaAcidPct: null,
      hopForm: null,
      hopSeason: null,
      yeastAttenuationPct: null,
      yeastType: null,
      yeastForm: null,
      yeastMinFermentationTempC: null,
      yeastMaxFermentationTempC: null,
      properties: {
        seedDataset: dataset.datasetId,
        seedSnapshot: catalogSnapshotId,
        seedSourceId: item.id,
        nameRu: item.name_ru ?? null,
        nameEn: item.name_en ?? null,
        sourceCategoryRu: item.source_category_ru ?? null,
        group: item.group ?? null,
        ingredientType: item.ingredient_type ?? null,
        sourceKind: item.source_kind ?? null,
        sourceUrl: item.source_url ?? null
      },
      matchPolicy: classification.category === "misc" ? "exact_only" : "family_compatible"
    };
  });
};

const buildWaterDrafts = () => {
  const dataset = catalogDatasetManifest.waterPrep;
  const data = readJsonFile<{ items: WaterCatalogItem[] }>(dataset.fileName);

  return data.items
    .filter((item) => !["water_treatment_method", "ph_fermentable"].includes(toDatasetToken(item.category)))
    .map((item): SeedDraft => {
      const categoryKey = toDatasetToken(item.category);
      const subtype = categoryKey === "dilution_water"
        ? "water_source"
        : categoryKey === "dechlorination_agent"
          ? "dechlorination"
          : categoryKey === "acid"
            ? "acid"
            : categoryKey === "alkali"
              ? "base"
              : "salt";
      const profile = resolveUnitProfile(item.unit_preferred) ?? (
        subtype === "water_source" || subtype === "acid"
          ? toVolumeProfile(subtype === "water_source" ? "l" : "ml")
          : toWeightProfile("g")
      );
      const displayName = readText(item.name_ru, item.display_name, item.name_en) ?? item.id;
      const description = buildDescription(item.typical_use_ru, item.cautions_ru, item.storage_notes_ru);
      const physicalForm = mapWaterPhysicalForm(item.common_forms ?? []);
      const technicalData = {
        category: "water_prep" as const,
        subtype,
        compound: subtype === "acid" ? null : readText(item.name_en, item.formula, displayName),
        acidType: subtype === "acid"
          ? (
              containsToken(displayName, "молоч") ? "lactic"
                : containsToken(displayName, "лимон") ? "citric"
                  : containsToken(displayName, "фосфор") ? "phosphoric"
                    : readText(item.name_en, displayName)
            )
          : null,
        strengthPct: parseStrengthFromText(
          displayName,
          typeof item.concentration_options === "string" ? item.concentration_options : null,
          JSON.stringify(item.concentration_options ?? null)
        ),
        purityPct: null,
        physicalForm
      };
      const rawAliases = dedupeStrings([
        ...(item.search_aliases ?? []),
        ...(item.aliases_ru ?? []),
        ...(item.aliases_en ?? []),
        item.display_name,
        item.name_ru,
        item.name_en,
        item.formula
      ]);

      return {
        sourceKey: item.id,
        sourceDataset: dataset.datasetId,
        sourceSnapshot: catalogSnapshotId,
        type: "misc",
        category: "water_prep",
        subtype,
        baseDisplayName: displayName,
        displayNameEn: readText(item.name_en),
        familyDisplayNameRu: readText(item.name_ru, displayName),
        familyDisplayNameEn: readText(item.name_en),
        familyCanonicalName: readText(item.name_ru, item.name_en, displayName) ?? displayName,
        rawAliases,
        extraSearchAliasesNorm: [],
        qualifierParts: [],
        brandName: null,
        manufacturer: null,
        country: null,
        harvestYear: null,
        description,
        defaultUnit: profile.defaultDisplayUnit,
        defaultDisplayUnit: profile.defaultDisplayUnit,
        allowedUnits: profile.allowedUnits,
        measurementDimension: profile.measurementDimension,
        completenessLevel: resolveCompletenessLevel({
          category: "water_prep",
          displayName,
          aliases: rawAliases,
          description,
          technicalData
        }),
        technicalData,
        fermentableColorEbc: null,
        fermentableExtractYieldPct: null,
        hopAlphaAcidPct: null,
        hopForm: null,
        hopSeason: null,
        yeastAttenuationPct: null,
        yeastType: null,
        yeastForm: null,
        yeastMinFermentationTempC: null,
        yeastMaxFermentationTempC: null,
        properties: {
          seedDataset: dataset.datasetId,
          seedSnapshot: catalogSnapshotId,
          seedSourceId: item.id,
          nameRu: item.name_ru ?? null,
          nameEn: item.name_en ?? null,
          sourceCategory: item.category ?? null,
          itemKind: item.item_kind ?? null,
          formula: item.formula ?? null,
          sourceBasis: item.source_basis ?? []
        },
        matchPolicy: "family_compatible"
      };
    });
};

const buildConsumableDrafts = () => {
  const dataset = catalogDatasetManifest.consumable;
  const data = readJsonFile<{ master_items: ConsumableCatalogItem[] }>(dataset.fileName);

  return data.master_items.map((item): SeedDraft => {
    const categoryToken = toDatasetToken(item.category);
    const subtype = categoryToken === "fining"
      ? "fining"
      : categoryToken === "antioxidant"
        ? "antioxidant"
        : categoryToken === "nutrient"
          ? "nutrient"
          : categoryToken === "enzyme"
            ? "enzyme"
            : categoryToken === "cleaner"
              ? "cleaner"
              : categoryToken === "sanitizer"
                ? "sanitizer"
                : categoryToken === "gas"
                  ? "gas"
                  : categoryToken === "preservative"
                    ? "preservative"
                    : "process_aid";
    const profile = resolveUnitProfile(item.unit_preferred) ?? toCountProfile("item");
    const displayName = readText(item.name_ru, item.display_name, item.name_en) ?? item.id;
    const description = buildDescription(
      item.typical_use_ru,
      item.storage_notes_ru,
      item.dosage_reference?.common_ratio ?? null,
      item.dosage_reference?.example_reference ?? null
    );
    const usagePhase = mapMiscUsagePhase(item.usage_stage ?? []);
    const rawAliases = dedupeStrings([
      ...(item.search_aliases ?? []),
      ...(item.aliases_ru ?? []),
      ...(item.aliases_en ?? []),
      item.display_name,
      item.name_ru,
      item.name_en
    ]);

    return {
      sourceKey: item.id,
      sourceDataset: dataset.datasetId,
      sourceSnapshot: catalogSnapshotId,
      type: subtype === "fining" ? "fining" : "misc",
      category: "misc",
      subtype,
      baseDisplayName: displayName,
      displayNameEn: readText(item.name_en),
      familyDisplayNameRu: readText(item.name_ru, displayName),
      familyDisplayNameEn: readText(item.name_en),
      familyCanonicalName: readText(item.name_ru, item.name_en, displayName) ?? displayName,
      rawAliases,
      extraSearchAliasesNorm: [],
      qualifierParts: [],
      brandName: null,
      manufacturer: null,
      country: null,
      harvestYear: null,
      description,
      defaultUnit: profile.defaultDisplayUnit,
      defaultDisplayUnit: profile.defaultDisplayUnit,
      allowedUnits: profile.allowedUnits,
      measurementDimension: profile.measurementDimension,
      completenessLevel: resolveCompletenessLevel({
        category: "misc",
        displayName,
        aliases: rawAliases,
        description
      }),
      technicalData: {
        category: "misc" as const,
        subtype,
        usagePhase,
        doseHint: readText(item.dosage_reference?.common_ratio, item.dosage_reference?.example_reference)
      },
      fermentableColorEbc: null,
      fermentableExtractYieldPct: null,
      hopAlphaAcidPct: null,
      hopForm: null,
      hopSeason: null,
      yeastAttenuationPct: null,
      yeastType: null,
      yeastForm: null,
      yeastMinFermentationTempC: null,
      yeastMaxFermentationTempC: null,
      properties: {
        seedDataset: dataset.datasetId,
        seedSnapshot: catalogSnapshotId,
        seedSourceId: item.id,
        nameRu: item.name_ru ?? null,
        nameEn: item.name_en ?? null,
        itemKind: item.item_kind ?? null,
        category: item.category ?? null,
        subcategory: item.subcategory ?? null,
        inventoryModesSupported: item.inventory_modes_supported ?? []
      },
      matchPolicy: "exact_only"
    };
  });
};

const buildSeedCatalogItems = () => finalizeDrafts([
  ...buildMaltDrafts(),
  ...buildHopDrafts(),
  ...buildYeastDrafts(),
  ...buildNonMaltDrafts(),
  ...buildWaterDrafts(),
  ...buildConsumableDrafts()
]);

export const seedCatalogItems = buildSeedCatalogItems();
