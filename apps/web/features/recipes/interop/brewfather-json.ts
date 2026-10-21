import { RECIPE_IMPORT_MAX_INPUT_BYTES, RECIPE_IMPORT_MAX_RECIPES } from "../contracts";
import type { BitternessFormula } from "@nb/brewing-core";

import type { CanonicalRecipe, CanonicalRecipeIngredient } from "./canonical";
import { lovibondToEbc } from "../../ingredients/technical-fields";
import type { CustomHopForm, CustomPhysicalForm, CustomYeastForm } from "../../inventory/custom-ingredient";
import { isRecord, readNumber, readString, readFirstNumber, readFirstString, readUnit } from "./readers";
import { buildImportedFermentationProfile } from "./process";
import { importBrewfatherEquipment, importBrewfatherWater } from "./brewfather-profiles";
import { RecipeImportError } from "./errors";

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
  if (normalized.includes("boil") || normalized.includes("flame")) return "boil";
  if (/primary|secondary|ferment/.test(normalized)) return "fermentation";
  if (/bott|pack/.test(normalized)) return "packaging";
  return "mash";
};

const mapBrewfatherHopForm = (rawForm: string | null): CustomHopForm | null => {
  const normalized = rawForm?.toLowerCase() ?? "";
  if (!normalized) return null;
  if (normalized.includes("leaf") || normalized.includes("whole")) return "whole_cone";
  if (normalized.includes("cryo")) return "cryo";
  if (normalized.includes("lupulin") || normalized.includes("lupomax")) return "lupulin";
  if (normalized.includes("pellet")) return "pellet";
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

  const lovibond = readNumber(item.lovibond);
  if (lovibond != null) return lovibondToEbc(lovibond);
  const srm = readNumber(item.color);
  return srm == null ? null : srm * 1.97;
};

const readBrewfatherAmount = (item: Record<string, unknown>, fallbackUnit: CanonicalRecipeIngredient["unit"], fallbackAmount: number) => {
  const amount = readNumber(item.amount) ?? readNumber(item.weight) ?? fallbackAmount;
  const unit = readString(item.unit)?.toLowerCase();
  if (unit === "qt" || unit === "pt") return { amount: amount * (unit === "qt" ? 0.946352946 : 0.473176473), unit: "l" as const };
  if (unit === "tsp" || unit === "tbsp" || unit === "cup") return { amount: amount * ({ tsp: 4.928921594, tbsp: 14.78676478, cup: 236.5882365 }[unit]!), unit: "ml" as const };
  return { amount, unit: readUnit(item.unit, fallbackUnit) };
};

const buildBrewfatherProcessMeta = (payload: Record<string, unknown>, warnings: string[]): Record<string, unknown> | null => {
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

  const fermentation = isRecord(payload.fermentation) ? payload.fermentation : null;
  const fermentationSteps = fermentation && Array.isArray(fermentation.steps) ? fermentation.steps.filter(isRecord) : [];
  if (fermentationSteps.some((step) => readNumber(step.pressure) || readNumber(step.ramp))) warnings.push("Давление и плавное изменение температуры брожения сохранены в исходном JSON; настройте их перед варкой.");
  if (rawSteps.some((step) => isRecord(step) && (readNumber(step.rampTime) || readNumber(step.infuseAmount)))) warnings.push("Скорость нагрева и объёмы инфузий сохранены в исходном JSON; проверьте затирание.");
  const profile = buildImportedFermentationProfile(fermentationSteps.map((step, index) => ({
    name: readFirstString(step, ["name", "type"]) ?? `Этап ${index + 1}`,
    temperatureC: readFirstNumber(step, ["stepTemp", "temperatureC", "temperature", "temp"]),
    durationDays: readFirstNumber(step, ["stepTime", "durationDays", "duration", "time"]) || null,
  })), warnings);
  if (rawSteps.length > 10) warnings.push("Перенесены первые 10 шагов затирания. Полный профиль сохранён в исходных данных.");
  return mashSteps.length || profile ? {
    ...(mashSteps.length ? { mashProfile: { steps: mashSteps } } : {}),
    ...(profile ? { fermentationProfile: profile } : {}),
  } : null;
};

const mapMiscStage = (use: string | null): CanonicalRecipeIngredient["stage"] => {
  const normalized = use?.toLowerCase() ?? "";
  if (/mash|steep|sparge/.test(normalized)) return "mash";
  if (normalized.includes("boil")) return "boil";
  if (/ferment|primary|secondary/.test(normalized)) return "fermentation";
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

const readBrewfatherStyleHint = (style: unknown) => {
  if (!isRecord(style)) {
    return null;
  }
  const name = readString(style.name);
  const categoryNumber = readString(style.categoryNumber);
  const styleLetter = readString(style.styleLetter);
  if (!name && !categoryNumber) {
    return null;
  }
  return { name, categoryNumber, styleLetter };
};

const importBrewfatherRecipe = (payload: unknown): CanonicalRecipe => {
  if (!isRecord(payload)) {
    throw new Error("INVALID_BREWFATHER_JSON");
  }

  const readIngredients = (key: string): Record<string, unknown>[] => {
    const value = payload[key];
    if (value == null) return [];
    if (!Array.isArray(value) || !value.every(isRecord)) throw new Error("INVALID_BREWFATHER_JSON");
    return value;
  };
  const fermentables = readIngredients("fermentables");
  const hops = readIngredients("hops");
  const yeasts = readIngredients("yeasts");
  const miscs = readIngredients("miscs");
  const ingredients: CanonicalRecipeIngredient[] = [];
  const warnings: string[] = ["OG, FG, IBU и цвет пересчитываются в NB и могут отличаться от Brewfather. Исходные значения показаны в сводке и сохранены в исходном JSON."];

  if (!fermentables.length && !hops.length && !yeasts.length && !miscs.length && !readString(payload.name) && !readString(payload.title)) {
    throw new Error("INVALID_BREWFATHER_JSON");
  }
  if (!readString(payload.name) && !readString(payload.title)) throw new Error("INVALID_IMPORT_RECIPE");

  for (const item of fermentables) {
    if (!isRecord(item)) continue;
    const rawType = readString(item.type);
    const colorEbc = readBrewfatherFermentableColorEbc(item);
    const potential = readNumber(item.potential);
    const extractYieldPct = readFirstNumber(item, ["yield", "yieldPct", "yieldPercent", "extractYield", "extractPct"])
      ?? (potential != null && potential > 1 ? Math.round((potential - 1) * 1000 / 46.214 * 10000) / 100 : null);
    ingredients.push({
      name: readString(item.name) ?? "Imported fermentable",
      ...mapBrewfatherFermentable(rawType),
      ...readBrewfatherAmount(item, "kg", 0),
      stage: mapFermentableStage(readString(item.use)),
      stepMeta: { use: /steep/i.test(readString(item.use) ?? "") ? "steep" : mapFermentableStage(readString(item.use)) },
      timeOffset: readBrewfatherTimeMinutes(item) == null ? null : Math.round(readBrewfatherTimeMinutes(item)!),
      fermentableColorEbc: colorEbc,
      fermentableExtractYieldPct: extractYieldPct,
      externalImportMeta: {
        source: "brewfather_json",
        rawId: readString(item._id) ?? readString(item.id),
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
    const hopTiming = stage === "fermentation" && !readString(item.timeUnit) ? { ...item, timeUnit: "day" } : item;
    if (stage === "fermentation" && !readString(item.timeUnit) && readNumber(item.time) != null) warnings.push(`«${readString(item.name) ?? "Хмель"}»: для сухого охмеления без указания единицы времени длительность считается в днях; проверьте длительность.`);
    const timeMinutes = readBrewfatherTimeMinutes(hopTiming);
    ingredients.push({
      name: readString(item.name) ?? "Imported hop",
      type: "hop",
      category: "hop",
      ...readBrewfatherAmount(item, "g", 0),
      stage,
      timeOffset: timeMinutes == null ? null : Math.round(timeMinutes),
      hopAlphaAcidPct: alphaAcidPct,
      hopForm,
      stepMeta: {
        useType: mapHopUseType(use, stage),
        timeMinutes,
        durationDays: stage === "fermentation" && timeMinutes != null ? timeMinutes / 1440 : null,
        temperatureC: readFirstNumber(item, ["temp", "temperature", "hopstandTemperature"]) ?? (stage === "whirlpool" && isRecord(payload.equipment) ? readNumber(payload.equipment.hopstandTemperature) : null),
        hopForm
      },
      externalImportMeta: {
        source: "brewfather_json",
        rawUse: use,
        rawId: readString(item._id) ?? readString(item.id),
        rawType: readString(item.type),
        alphaAcidPct
      }
    });
  }

  for (const item of yeasts) {
    if (!isRecord(item)) continue;
    const rawForm = readString(item.form);
    const attenuationPct = readNumber(item.attenuation);
    const unit = readUnit(item.unit, "pack");
    const defaultAmount = unit === "pack" ? 1 : 0;
    if (readNumber(item.amount) == null && defaultAmount === 1) warnings.push(`«${readString(item.name) ?? "Дрожжи"}»: количество не указано, установлена 1 упаковка. Проверьте дозировку.`);
    ingredients.push({
      name: readString(item.name) ?? "Imported yeast",
      type: "yeast",
      category: "yeast",
      ...readBrewfatherAmount(item, "pack", defaultAmount),
      stage: "fermentation",
      yeastAttenuationPct: attenuationPct,
      yeastForm: mapBrewfatherYeastForm(rawForm),
      externalImportMeta: { source: "brewfather_json", rawId: readString(item._id) ?? readString(item.id), rawForm, attenuationPct }
    });
  }

  for (const item of miscs) {
    if (!isRecord(item)) continue;
    const name = readString(item.name);
    const type = readString(item.type);
    ingredients.push({
      name: name ?? "Imported misc",
      ...mapMiscCategory(type, name),
      ...readBrewfatherAmount(item, "item", 0),
      stage: mapMiscStage(readString(item.use)),
      timeOffset: readBrewfatherTimeMinutes(item) == null ? null : Math.round(readBrewfatherTimeMinutes(item)!),
      physicalForm: mapBrewfatherPhysicalForm(type, name),
      externalImportMeta: { source: "brewfather_json", rawId: readString(item._id) ?? readString(item.id), rawUse: readString(item.use), rawType: type, rawWaterAdjustment: item.waterAdjustment === true }
    });
  }

  if (!ingredients.length) {
    throw new Error("IMPORT_RECIPE_EMPTY");
  }

  const importedFormulaPreference = readString(payload.ibuFormula);
  const bitternessFormula = mapBrewfatherBitternessFormula(importedFormulaPreference);
  const styleHint = readBrewfatherStyleHint(payload.style);

  const processMeta = buildBrewfatherProcessMeta(payload, warnings);
  const equipmentProfileSnapshot = importBrewfatherEquipment(payload, warnings);
  const waterPlanMeta = importBrewfatherWater(payload, warnings, ingredients);
  if (ingredients.some((ingredient) => !Number.isFinite(ingredient.amount) || ingredient.amount <= 0)) throw new Error("INVALID_IMPORT_INGREDIENT_AMOUNT");
  if (Array.isArray(payload.tags) && payload.tags.length || readString(payload.path) && payload.path !== "/") warnings.push("Папки и метки Brewfather сохранены в исходном JSON.");
  if (payload.img_url || payload.attachmentCount) warnings.push("Фотографии и вложения не переносятся автоматически.");
  if (payload.carbonation != null) warnings.push("Целевая карбонизация сохранена в исходных данных; проверьте её при розливе.");
  return {
    title: readString(payload.name) ?? readString(payload.title) ?? "Imported Brewfather recipe",
    batchSizeL: readNumber(payload.batchSize) ?? readNumber(payload.batchSizeL) ?? null,
    boilTimeMinutes: readNumber(payload.boilTime) ?? 60,
    efficiency: readNumber(payload.efficiency),
    description: readString(payload.notes),
    importMeta: {
      source: "brewfather_json_beta",
      warnings,
      originalRecipe: payload,
      importedAt: new Date().toISOString(),
      importedFormulaPreference,
      styleHint,
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
    processMeta,
    equipmentProfileSnapshot,
    waterPlanMeta,
    ingredients
  };
};

/** Single recipe, API array, or the recipes section of a full data backup. */
export const importBrewfatherJsonToCanonicalRecipes = (input: unknown): CanonicalRecipe[] => {
  if (new TextEncoder().encode(JSON.stringify(input ?? null)).length > RECIPE_IMPORT_MAX_INPUT_BYTES) throw new Error("IMPORT_INPUT_TOO_LARGE");
  const root = isRecord(input) && isRecord(input.data) && input.data.recipes != null ? input.data : input;
  const collection = isRecord(root) && root.recipes != null ? root.recipes : root;
  const items = Array.isArray(collection) ? collection
    : isRecord(root) && root.recipes != null && isRecord(collection) ? Object.values(collection) : [collection];
  if (!items.length) throw new Error("IMPORT_RECIPE_EMPTY");
  if (items.length > RECIPE_IMPORT_MAX_RECIPES) throw new Error("IMPORT_TOO_MANY_RECIPES");
  return items.map((item, index) => {
    try {
      const isBatch = isRecord(item) && isRecord(item.recipe);
      const canonical = importBrewfatherRecipe(isBatch ? item.recipe : item);
      const warnings = canonical.importMeta!.warnings as string[];
      if (isBatch) warnings.push("Переносится рецепт из варки; журнал, замеры и история варки не импортируются.");
      if (isRecord(root) && root.recipes != null && (root.batches || root.inventory || root.settings)) warnings.push("Из резервной копии импортируются рецепты. Склад, настройки и история варок не импортируются.");
      return canonical;
    } catch (error) {
      if (items.length === 1) throw error;
      throw new RecipeImportError(index + 1, isRecord(item) ? readString(item.name) ?? "Без названия" : "Без названия", error);
    }
  });
};
export const importBrewfatherJsonToCanonicalRecipe = (payload: unknown): CanonicalRecipe => {
  const recipes = importBrewfatherJsonToCanonicalRecipes(payload);
  if (recipes.length !== 1) throw new Error("IMPORT_MULTIPLE_RECIPES");
  return recipes[0]!;
};
