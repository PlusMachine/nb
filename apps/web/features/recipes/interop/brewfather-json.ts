import type { BitternessFormula } from "@nb/brewing-core";

import type { CanonicalRecipe, CanonicalRecipeIngredient } from "./canonical";
import { lovibondToEbc } from "../../ingredients/technical-fields";
import type { CustomHopForm, CustomPhysicalForm, CustomYeastForm } from "../../inventory/custom-ingredient";
import { inventoryUnits, type InventoryUnit } from "../../inventory/units";

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const readNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const readString = (value: unknown) => typeof value === "string" ? value : null;

const readFirstNumber = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = readNumber(record[key]);
    if (value != null) {
      return value;
    }
  }

  return null;
};

const readFirstString = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = readString(record[key]);
    if (value != null) {
      return value;
    }
  }

  return null;
};

const readUnit = (value: unknown, fallback: InventoryUnit): InventoryUnit => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  const singular = normalized.endsWith("s") ? normalized.slice(0, -1) : normalized;
  if ((inventoryUnits as readonly string[]).includes(singular)) {
    return singular as InventoryUnit;
  }
  return fallback;
};

const mapHopUse = (use: string | null): CanonicalRecipeIngredient["stage"] => {
  const normalized = use?.toLowerCase() ?? "";
  if (normalized.includes("dry")) return "fermentation";
  if (normalized.includes("whirlpool") || normalized.includes("hopstand") || normalized.includes("aroma")) return "whirlpool";
  return "boil";
};

const mapHopUseType = (use: string | null, stage: CanonicalRecipeIngredient["stage"]) => {
  const normalized = use?.toLowerCase() ?? "";
  if (stage === "fermentation") return "dry_hop";
  if (stage === "whirlpool") return "whirlpool";
  if (normalized.includes("first")) return "first_wort_hop";
  return "boil";
};

const mapBrewfatherFermentable = (
  rawType: string | null
): Pick<CanonicalRecipeIngredient, "type" | "category"> => {
  const normalized = rawType?.toLowerCase() ?? "";
  if (normalized.includes("grain") || normalized.includes("malt")) {
    return { type: "malt", category: "fermentable" };
  }
  return { type: "fermentable", category: "fermentable" };
};

const mapFermentableStage = (use: string | null): CanonicalRecipeIngredient["stage"] => {
  const normalized = use?.toLowerCase() ?? "";
  if (normalized.includes("boil")) return "boil";
  return "mash";
};

const mapBrewfatherHopForm = (rawForm: string | null): CustomHopForm | null => {
  const normalized = rawForm?.toLowerCase() ?? "";
  if (!normalized) return null;
  if (normalized.includes("pellet")) return "pellet";
  if (normalized.includes("leaf") || normalized.includes("whole")) return "whole_cone";
  if (normalized.includes("cryo")) return "cryo";
  if (normalized.includes("lupulin") || normalized.includes("lupomax")) return "lupulin";
  return "standard";
};

const mapBrewfatherYeastForm = (rawForm: string | null): CustomYeastForm | null => {
  const normalized = rawForm?.toLowerCase() ?? "";
  if (normalized.includes("dry")) return "dry";
  if (normalized.includes("liquid")) return "liquid";
  if (normalized.includes("slurry")) return "slurry";
  if (normalized.includes("culture")) return "culture";
  return null;
};

const mapBrewfatherPhysicalForm = (rawType: string | null, rawName: string | null): CustomPhysicalForm | null => {
  const normalized = `${rawType ?? ""} ${rawName ?? ""}`.toLowerCase();
  if (normalized.includes("tablet")) return "tablet";
  if (normalized.includes("powder")) return "powder";
  if (normalized.includes("crystal")) return "crystal";
  if (normalized.includes("solution")) return "solution";
  if (normalized.includes("liquid")) return "liquid";
  return null;
};

const readBrewfatherTimeMinutes = (item: Record<string, unknown>) => {
  const time = readNumber(item.time);
  if (time == null) return null;
  const unit = readString(item.timeUnit)?.toLowerCase() ?? "";
  if (unit.startsWith("day")) return time * 1440;
  if (unit.startsWith("hour")) return time * 60;
  return time;
};

const readBrewfatherFermentableColorEbc = (item: Record<string, unknown>) => {
  const directEbc = readFirstNumber(item, ["colorEbc", "ebc"]);
  if (directEbc != null) {
    return directEbc;
  }

  return lovibondToEbc(readFirstNumber(item, ["lovibond", "color"]));
};

const buildBrewfatherProcessMeta = (payload: Record<string, unknown>): Record<string, unknown> | null => {
  const mash = isRecord(payload.mash) ? payload.mash : null;
  const rawSteps = mash && Array.isArray(mash.steps) ? mash.steps : [];
  const mashSteps = rawSteps
    .filter(isRecord)
    .map((step, index) => {
      const temperatureC = readFirstNumber(step, ["stepTemp", "temperature", "temperatureC", "temp"]);
      const durationMinutes = readFirstNumber(step, ["stepTime", "duration", "durationMinutes", "time"]);
      if (temperatureC == null || durationMinutes == null || durationMinutes <= 0) {
        return null;
      }

      return {
        id: `imported-mash-step-${index + 1}`,
        name: readFirstString(step, ["name", "type"]) ?? `Mash step ${index + 1}`,
        temperatureC,
        durationMinutes: Math.round(durationMinutes)
      };
    })
    .filter((step): step is NonNullable<typeof step> => step !== null)
    .slice(0, 10);

  return mashSteps.length
    ? { mashProfile: { steps: mashSteps } }
    : null;
};

const mapMiscStage = (use: string | null): CanonicalRecipeIngredient["stage"] => {
  const normalized = use?.toLowerCase() ?? "";
  if (normalized.includes("mash")) return "mash";
  if (normalized.includes("boil")) return "boil";
  if (normalized.includes("ferment")) return "fermentation";
  if (normalized.includes("bott") || normalized.includes("pack")) return "packaging";
  return "other";
};

const mapMiscCategory = (type: string | null, name: string | null): Pick<CanonicalRecipeIngredient, "type" | "category"> => {
  const normalized = `${type ?? ""} ${name ?? ""}`.toLowerCase();
  if (/(water|mineral|salt|acid|gypsum|chloride|epsom|baking soda|chalk|lactic|phosphoric|caco3|cacl|caso4|nacl)/.test(normalized)) {
    return { type: "water_treatment", category: "water_treatment" };
  }
  return { type: "consumable", category: "consumable" };
};

const mapBrewfatherBitternessFormula = (formula: string | null): BitternessFormula | null => {
  const normalized = formula?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? "";
  if (!normalized) return null;
  if (normalized.includes("tinseth")) {
    return normalized.includes("classic") ? "tinseth_classic" : "tinseth_whirlpool_v2";
  }
  if (normalized.includes("rager")) return "rager";
  if (normalized.includes("garetz")) return "garetz";
  if (normalized.includes("noonan")) return "noonan_legacy";
  return null;
};

export const importBrewfatherJsonToCanonicalRecipe = (payload: unknown): CanonicalRecipe => {
  if (!isRecord(payload)) {
    throw new Error("INVALID_BREWFATHER_JSON");
  }

  const fermentables = Array.isArray(payload.fermentables) ? payload.fermentables : [];
  const hops = Array.isArray(payload.hops) ? payload.hops : [];
  const yeasts = Array.isArray(payload.yeasts) ? payload.yeasts : [];
  const miscs = Array.isArray(payload.miscs) ? payload.miscs : [];
  const ingredients: CanonicalRecipeIngredient[] = [];

  if (!fermentables.length && !hops.length && !yeasts.length && !miscs.length && !readString(payload.name) && !readString(payload.title)) {
    throw new Error("INVALID_BREWFATHER_JSON");
  }

  for (const item of fermentables) {
    if (!isRecord(item)) continue;
    const rawType = readString(item.type);
    const colorEbc = readBrewfatherFermentableColorEbc(item);
    const extractYieldPct = readFirstNumber(item, ["yield", "yieldPct", "yieldPercent", "extractYield", "extractPct"]);
    ingredients.push({
      name: readString(item.name) ?? "Imported fermentable",
      ...mapBrewfatherFermentable(rawType),
      amount: readNumber(item.amount) ?? readNumber(item.weight) ?? 0,
      unit: readUnit(item.unit, "kg"),
      stage: mapFermentableStage(readString(item.use)),
      timeOffset: readBrewfatherTimeMinutes(item),
      fermentableColorEbc: colorEbc,
      fermentableExtractYieldPct: extractYieldPct,
      externalImportMeta: {
        source: "brewfather_json",
        rawId: readString(item.id),
        rawType,
        colorEbc,
        extractYieldPct
      }
    });
  }

  for (const item of hops) {
    if (!isRecord(item)) continue;
    const use = readString(item.use);
    const stage = mapHopUse(use);
    const alphaAcidPct = readNumber(item.alpha);
    const hopForm = mapBrewfatherHopForm(readString(item.type) ?? readString(item.form));
    const timeMinutes = readBrewfatherTimeMinutes(item);
    ingredients.push({
      name: readString(item.name) ?? "Imported hop",
      type: "hop",
      category: "hop",
      amount: readNumber(item.amount) ?? 0,
      unit: readUnit(item.unit, "g"),
      stage,
      timeOffset: timeMinutes,
      hopAlphaAcidPct: alphaAcidPct,
      hopForm,
      stepMeta: {
        useType: mapHopUseType(use, stage),
        timeMinutes,
        durationDays: stage === "fermentation" && timeMinutes != null ? timeMinutes / 1440 : null,
        temperatureC: readNumber(item.temp),
        hopForm
      },
      externalImportMeta: {
        source: "brewfather_json",
        rawUse: use,
        rawId: readString(item.id),
        rawType: readString(item.type),
        alphaAcidPct
      }
    });
  }

  for (const item of yeasts) {
    if (!isRecord(item)) continue;
    const rawForm = readString(item.form);
    const attenuationPct = readNumber(item.attenuation);
    ingredients.push({
      name: readString(item.name) ?? "Imported yeast",
      type: "yeast",
      category: "yeast",
      amount: readNumber(item.amount) ?? 1,
      unit: readUnit(item.unit, "pack"),
      stage: "fermentation",
      yeastAttenuationPct: attenuationPct,
      yeastForm: mapBrewfatherYeastForm(rawForm),
      externalImportMeta: { source: "brewfather_json", rawId: readString(item.id), rawForm, attenuationPct }
    });
  }

  for (const item of miscs) {
    if (!isRecord(item)) continue;
    const name = readString(item.name);
    const type = readString(item.type);
    ingredients.push({
      name: name ?? "Imported misc",
      ...mapMiscCategory(type, name),
      amount: readNumber(item.amount) ?? 1,
      unit: readUnit(item.unit, "item"),
      stage: mapMiscStage(readString(item.use)),
      timeOffset: readBrewfatherTimeMinutes(item),
      physicalForm: mapBrewfatherPhysicalForm(type, name),
      externalImportMeta: { source: "brewfather_json", rawId: readString(item.id), rawUse: readString(item.use), rawType: type }
    });
  }

  if (!ingredients.length) {
    throw new Error("IMPORT_RECIPE_EMPTY");
  }

  const importedFormulaPreference = readString(payload.ibuFormula);
  const bitternessFormula = mapBrewfatherBitternessFormula(importedFormulaPreference);

  return {
    title: readString(payload.name) ?? readString(payload.title) ?? "Imported Brewfather recipe",
    batchSizeL: readNumber(payload.batchSize) ?? readNumber(payload.batchSizeL) ?? null,
    boilTimeMinutes: readNumber(payload.boilTime) ?? 60,
    efficiency: readNumber(payload.efficiency),
    description: readString(payload.notes),
    importMeta: {
      source: "brewfather_json_beta",
      importedAt: new Date().toISOString(),
      importedFormulaPreference,
      importedStats: {
        og: readNumber(payload.og),
        fg: readNumber(payload.fg) ?? readNumber(payload.fgEstimated),
        ibu: readNumber(payload.ibu),
        color: readNumber(payload.color),
        abv: readNumber(payload.abv)
      }
    },
    calculationMeta: bitternessFormula
      ? { bitternessFormula, bitternessSettings: {} }
      : null,
    processMeta: buildBrewfatherProcessMeta(payload),
    ingredients
  };
};
