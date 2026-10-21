import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { BitternessFormula } from "@nb/brewing-core";

import type { CanonicalRecipe, CanonicalRecipeIngredient } from "./canonical";
import { mapRecipeToCanonical } from "./canonical";
import { recipeProcessMetaSchema, recipeWaterPlanMetaSchema, recipeCalculationMetaSchema, RECIPE_IMPORT_MAX_INPUT_BYTES, RECIPE_IMPORT_MAX_RECIPES, type RecipeDetailDto } from "../contracts";
import { equipmentProfileSnapshotSchema } from "../../equipment-profiles/contracts";
import { buildImportedFermentationProfile } from "./process";
import { readUnit } from "./readers";
import { buildRecipeWaterPlanResult } from "../water-plan";
import { buildRecipeWaterPlanFermentables } from "../water-plan-ingredients";
import { calculateEquipmentVolumePlan } from "../../equipment-profiles/volume-plan";
import { lovibondToEbc, toLovibondFromEbc } from "../../ingredients/technical-fields";
import type { CustomHopForm, CustomPhysicalForm, CustomYeastForm } from "../../inventory/custom-ingredient";

const escapeXml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const xmlTag = (
  name: string,
  value: string | number | boolean | null | undefined,
  indent = "    "
) => (
  value == null ? "" : `${indent}<${name}>${escapeXml(String(value))}</${name}>\n`
);

const compactNumber = (value: number | null | undefined, fractionDigits = 3) => (
  typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(fractionDigits))
    : null
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const readRecordValue = (record: Record<string, unknown> | null | undefined, key: string) => (
  record && Object.prototype.hasOwnProperty.call(record, key) ? record[key] : null
);

const readFiniteNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
};

const readStringValue = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const readMetaNumber = (meta: Record<string, unknown> | null | undefined, key: string) => (
  readFiniteNumber(readRecordValue(meta, key))
);

const readMetaString = (meta: Record<string, unknown> | null | undefined, key: string) => (
  readStringValue(readRecordValue(meta, key))
);

const toBeerXmlWeightKg = (amount: number, unit: CanonicalRecipeIngredient["unit"]) => {
  switch (unit) {
    case "kg":
      return amount;
    case "g":
      return amount / 1000;
    case "lb":
      return amount * 0.45359237;
    case "oz":
      return amount * 0.028349523125;
    default:
      return null;
  }
};

const toBeerXmlVolumeL = (amount: number, unit: CanonicalRecipeIngredient["unit"]) => {
  switch (unit) {
    case "l":
      return amount;
    case "ml":
      return amount / 1000;
    case "gal":
      return amount * 3.785411784;
    default:
      return null;
  }
};

const toBeerXmlAmount = (ingredient: CanonicalRecipeIngredient) => {
  const weightKg = toBeerXmlWeightKg(ingredient.amount, ingredient.unit);
  if (weightKg != null) {
    return { amount: compactNumber(weightKg, 6), amountIsWeight: true };
  }

  const volumeL = toBeerXmlVolumeL(ingredient.amount, ingredient.unit);
  if (volumeL != null) {
    return { amount: compactNumber(volumeL, 6), amountIsWeight: false };
  }

  return { amount: compactNumber(ingredient.amount, 6), amountIsWeight: false };
};

const mapHopUseToBeerXml = (ingredient: CanonicalRecipeIngredient) => {
  const useType = readMetaString(ingredient.stepMeta, "useType")?.toLowerCase();
  if (useType === "dry_hop" || ingredient.stage === "fermentation") return "Dry Hop";
  if (useType === "first_wort_hop") return "First Wort";
  if (useType === "whirlpool" || useType === "dip_hop" || ingredient.stage === "whirlpool") return "Aroma";
  if (ingredient.stage === "mash") return "Mash";
  return "Boil";
};

const mapHopFormToBeerXml = (form?: CustomHopForm | null) => {
  if (form === "whole_cone") return "Leaf";
  if (form === "pellet" || form === "cryo" || form === "lupulin" || form === "standard") return "Pellet";
  return null;
};

const mapYeastFormToBeerXml = (form?: CustomYeastForm | null) => {
  if (form === "dry") return "Dry";
  if (form === "liquid") return "Liquid";
  if (form === "slurry") return "Slurry";
  if (form === "culture") return "Culture";
  return null;
};

const mapMiscUseToBeerXml = (stage: CanonicalRecipeIngredient["stage"]) => {
  switch (stage) {
    case "mash":
      return "Mash";
    case "boil":
    case "whirlpool":
      return "Boil";
    case "fermentation":
      return "Primary";
    case "packaging":
      return "Bottling";
    default:
      return "Other";
  }
};

const mapMiscTypeToBeerXml = (ingredient: CanonicalRecipeIngredient) => (
  ingredient.category === "water_treatment" ? "Water Agent" : "Other"
);

const resolveBeerXmlTime = (ingredient: CanonicalRecipeIngredient) => {
  const durationDays = readMetaNumber(ingredient.stepMeta, "durationDays");
  if (durationDays != null && mapHopUseToBeerXml(ingredient) === "Dry Hop") {
    return compactNumber(durationDays * 1440, 0);
  }

  return compactNumber(
    readMetaNumber(ingredient.stepMeta, "timeMinutes")
      ?? ingredient.timeOffset
      ?? 0,
    0
  );
};

const renderIngredientExtension = (ingredient: CanonicalRecipeIngredient) => [
  xmlTag("DISPLAY_AMOUNT", `${ingredient.amount} ${ingredient.unit}`, "        ").trimEnd(),
  xmlTag("NB_INGREDIENT", JSON.stringify({ amount: ingredient.amount, unit: ingredient.unit, stage: ingredient.stage, stepMeta: ingredient.stepMeta ?? null, hopForm: ingredient.hopForm ?? null, yeastForm: ingredient.yeastForm ?? null }), "        ").trimEnd(),
  xmlTag("TEMPERATURE", readMetaNumber(ingredient.stepMeta, "temperatureC"), "        ").trimEnd(),
].filter(Boolean).join("\n");

const renderBeerXmlHop = (ingredient: CanonicalRecipeIngredient) => {
  const amount = toBeerXmlAmount(ingredient).amount;
  return [
    "      <HOP>",
    xmlTag("NAME", ingredient.name, "        ").trimEnd(),
    xmlTag("VERSION", 1, "        ").trimEnd(),
    renderIngredientExtension(ingredient),
    xmlTag("ALPHA", compactNumber(ingredient.hopAlphaAcidPct, 2), "        ").trimEnd(),
    xmlTag("AMOUNT", amount, "        ").trimEnd(),
    xmlTag("USE", mapHopUseToBeerXml(ingredient), "        ").trimEnd(),
    xmlTag("TIME", resolveBeerXmlTime(ingredient), "        ").trimEnd(),
    xmlTag("FORM", mapHopFormToBeerXml(ingredient.hopForm), "        ").trimEnd(),
    "      </HOP>"
  ].filter(Boolean).join("\n");
};

const renderBeerXmlFermentable = (ingredient: CanonicalRecipeIngredient) => {
  const amountKg = toBeerXmlWeightKg(ingredient.amount, ingredient.unit);
  return [
    "      <FERMENTABLE>",
    xmlTag("NAME", ingredient.name, "        ").trimEnd(),
    xmlTag("VERSION", 1, "        ").trimEnd(),
    renderIngredientExtension(ingredient),
    xmlTag("TYPE", ingredient.type === "malt" ? "Grain" : "Sugar", "        ").trimEnd(),
    xmlTag("AMOUNT", compactNumber(amountKg ?? ingredient.amount, 6), "        ").trimEnd(),
    xmlTag("YIELD", compactNumber(ingredient.fermentableExtractYieldPct, 2), "        ").trimEnd(),
    xmlTag("COLOR", toLovibondFromEbc(ingredient.fermentableColorEbc), "        ").trimEnd(),
    xmlTag("ADD_AFTER_BOIL", ingredient.stage === "boil" ? "TRUE" : "FALSE", "        ").trimEnd(),
    "      </FERMENTABLE>"
  ].filter(Boolean).join("\n");
};

const renderBeerXmlYeast = (ingredient: CanonicalRecipeIngredient) => {
  const amount = toBeerXmlAmount(ingredient);
  return [
    "      <YEAST>",
    xmlTag("NAME", ingredient.name, "        ").trimEnd(),
    xmlTag("VERSION", 1, "        ").trimEnd(),
    renderIngredientExtension(ingredient),
    xmlTag("TYPE", "Ale", "        ").trimEnd(),
    xmlTag("FORM", mapYeastFormToBeerXml(ingredient.yeastForm), "        ").trimEnd(),
    xmlTag("AMOUNT", amount.amount, "        ").trimEnd(),
    xmlTag("AMOUNT_IS_WEIGHT", amount.amountIsWeight ? "TRUE" : "FALSE", "        ").trimEnd(),
    xmlTag("ATTENUATION", compactNumber(ingredient.yeastAttenuationPct, 2), "        ").trimEnd(),
    "      </YEAST>"
  ].filter(Boolean).join("\n");
};

const renderBeerXmlMisc = (ingredient: CanonicalRecipeIngredient) => {
  const amount = toBeerXmlAmount(ingredient);
  return [
    "      <MISC>",
    xmlTag("NAME", ingredient.name, "        ").trimEnd(),
    xmlTag("VERSION", 1, "        ").trimEnd(),
    renderIngredientExtension(ingredient),
    xmlTag("NB_FROM_WATER_PLAN", ingredient.externalImportMeta?.fromWaterPlan === true ? "TRUE" : null, "        ").trimEnd(),
    xmlTag("TYPE", mapMiscTypeToBeerXml(ingredient), "        ").trimEnd(),
    xmlTag("USE", mapMiscUseToBeerXml(ingredient.stage), "        ").trimEnd(),
    xmlTag("TIME", compactNumber(ingredient.timeOffset ?? 0, 0), "        ").trimEnd(),
    xmlTag("AMOUNT", amount.amount, "        ").trimEnd(),
    xmlTag("AMOUNT_IS_WEIGHT", amount.amountIsWeight ? "TRUE" : "FALSE", "        ").trimEnd(),
    "      </MISC>"
  ].filter(Boolean).join("\n");
};

const renderBeerXmlCollection = (
  wrapperTag: string,
  items: CanonicalRecipeIngredient[],
  renderItem: (ingredient: CanonicalRecipeIngredient) => string
) => (
  items.length
    ? [
      `    <${wrapperTag}>`,
      ...items.map(renderItem),
      `    </${wrapperTag}>`
    ].join("\n")
    : ""
);

const readMashSteps = (processMeta: CanonicalRecipe["processMeta"]) => {
  const mashProfile = isRecord(processMeta) ? processMeta.mashProfile : null;
  const steps = isRecord(mashProfile) && Array.isArray(mashProfile.steps) ? mashProfile.steps : [];
  return steps
    .map((step, index) => {
      if (!isRecord(step)) return null;
      const temperatureC = readFiniteNumber(step.temperatureC, step.stepTemp, step.temp);
      const durationMinutes = readFiniteNumber(step.durationMinutes, step.stepTime, step.timeMinutes);
      if (temperatureC == null || durationMinutes == null) return null;
      return {
        name: readStringValue(step.name) ?? `Mash step ${index + 1}`,
        temperatureC,
        durationMinutes
      };
    })
    .filter((step): step is { name: string; temperatureC: number; durationMinutes: number } => step !== null);
};

const renderBeerXmlMash = (canonical: CanonicalRecipe) => {
  const mashSteps = readMashSteps(canonical.processMeta);
  if (!mashSteps.length) {
    return "";
  }

  return [
    "    <MASH>",
    xmlTag("NAME", `${canonical.title} Mash`, "      ").trimEnd(),
    xmlTag("VERSION", 1, "      ").trimEnd(),
    "      <MASH_STEPS>",
    ...mashSteps.map((step) => [
      "        <MASH_STEP>",
      xmlTag("NAME", step.name, "          ").trimEnd(),
      xmlTag("VERSION", 1, "          ").trimEnd(),
      xmlTag("TYPE", "Infusion", "          ").trimEnd(),
      xmlTag("STEP_TEMP", compactNumber(step.temperatureC, 2), "          ").trimEnd(),
      xmlTag("STEP_TIME", compactNumber(step.durationMinutes, 0), "          ").trimEnd(),
      "        </MASH_STEP>"
    ].filter(Boolean).join("\n")),
    "      </MASH_STEPS>",
    "    </MASH>"
  ].join("\n");
};

const getRecipeImportStats = (recipe: RecipeDetailDto) => {
  const importMeta = isRecord(recipe.importMeta) ? recipe.importMeta : null;
  const importedStats = isRecord(importMeta?.importedStats) ? importMeta.importedStats : null;
  return {
    og: recipe.og ?? readFiniteNumber(importedStats?.og),
    fg: recipe.fg ?? readFiniteNumber(importedStats?.fg),
    ibu: recipe.ibu ?? readFiniteNumber(importedStats?.ibu),
    color: recipe.color ?? readFiniteNumber(importedStats?.color),
    abv: recipe.abv ?? readFiniteNumber(importedStats?.abv)
  };
};

const getRecipeType = (_recipe: RecipeDetailDto) => "All Grain";

const mapBitternessFormulaToBeerXmlMethod = (formula?: string | null) => {
  switch (formula) {
    case "tinseth_whirlpool_v2":
      return "Tinseth Whirlpool v2";
    case "tinseth_classic":
      return "Tinseth";
    case "rager":
      return "Rager";
    case "garetz":
      return "Garetz";
    case "noonan_legacy":
      return "Noonan";
    default:
      return null;
  }
};

const mapBeerXmlIbuMethodToBitternessFormula = (rawMethod: string | null): BitternessFormula | null => {
  const normalized = rawMethod?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? "";
  if (!normalized) return null;
  if (normalized.includes("tinseth") && (normalized.includes("whirlpool") || normalized.includes("v2"))) return "tinseth_whirlpool_v2";
  if (normalized.includes("tinseth")) return "tinseth_classic";
  if (normalized.includes("rager")) return "rager";
  if (normalized.includes("garetz")) return "garetz";
  if (normalized.includes("noonan")) return "noonan_legacy";
  return null;
};

const readCanonicalBitternessFormula = (canonical: CanonicalRecipe) => (
  isRecord(canonical.calculationMeta)
    ? readStringValue(canonical.calculationMeta.bitternessFormula)
    : null
);

const getBoilSizeL = (_recipe: RecipeDetailDto, _canonical: CanonicalRecipe) => null;

const renderBeerXmlStyle = (styleId?: string | null) => {
  if (!styleId) return "";
  const code = styleId.match(/^(\d+)([a-z])/i);
  return ["    <STYLE>", xmlTag("NAME", styleId, "      ").trimEnd(), xmlTag("VERSION", 1, "      ").trimEnd(),
    xmlTag("CATEGORY_NUMBER", code?.[1], "      ").trimEnd(), xmlTag("STYLE_LETTER", code?.[2]?.toUpperCase(), "      ").trimEnd(),
    xmlTag("STYLE_GUIDE", "BJCP 2021", "      ").trimEnd(), "    </STYLE>"].filter(Boolean).join("\n");
};
const renderBeerXmlFermentation = (canonical: CanonicalRecipe) => {
  const profile = isRecord(canonical.processMeta?.fermentationProfile) ? canonical.processMeta.fermentationProfile : null;
  if (!profile) return "";
  const extras = Array.isArray(profile.extraSteps) ? profile.extraSteps.filter(isRecord) : [];
  const stages = [{ temperatureC: profile.primaryTemperatureC, durationDays: profile.primaryDurationDays }, ...extras,
    ...[profile.coldCrash, profile.conditioning].filter((value) => isRecord(value) && value.enabled === true)];
  return [xmlTag("FERMENTATION_STAGES", Math.min(3, stages.length)).trimEnd(), ...stages.slice(0, 3).flatMap((step, index) => {
    if (!isRecord(step)) return [];
    const tag = ["PRIMARY", "SECONDARY", "TERTIARY"][index];
    return [xmlTag(`${tag}_TEMP`, readFiniteNumber(step.temperatureC)).trimEnd(), xmlTag(`${tag}_AGE`, readFiniteNumber(step.durationDays)).trimEnd()];
  })].filter(Boolean).join("\n");
};

const waterPlanIngredients = (recipe: RecipeDetailDto): CanonicalRecipeIngredient[] => {
  if (!recipe.waterPlanMeta?.setupEnabled) return [];
  const waterPlanMeta = recipeWaterPlanMetaSchema.parse(recipe.waterPlanMeta);
  const batchSizeL = recipe.batchSizeNormalizedQuantity / 1000;
  const fermentables = buildRecipeWaterPlanFermentables(recipe.ingredients);
  const grainKg = fermentables.reduce((sum, item) => sum + item.weightKg, 0);
  const equipmentVolumePlan = recipe.equipmentProfileSnapshot ? calculateEquipmentVolumePlan({
    ...recipe.equipmentProfileSnapshot, targetBatchVolumeL: batchSizeL,
    grainAbsorptionLPerKg: waterPlanMeta.grainAbsorptionLPerKg ?? recipe.equipmentProfileSnapshot.grainAbsorptionLPerKg,
  }, grainKg, recipe.boilTimeMinutes) : null;
  const result = buildRecipeWaterPlanResult({ waterPlanMeta, fallbackBatchVolumeL: batchSizeL, boilTimeMinutes: recipe.boilTimeMinutes, equipmentVolumePlan, grainKg, fermentables });
  const addition = (name: string, amount: number, unit: "g" | "ml", target: string): CanonicalRecipeIngredient => ({
    name: `${name} (${target})`, amount, unit, type: "water_treatment", category: "water_treatment", stage: "mash",
    stepMeta: { waterTarget: target }, externalImportMeta: { fromWaterPlan: true },
  });
  return [
    ...result.totalSaltAdditions.map((salt) => addition(salt.label, salt.grams, "g", salt.target)),
    ...(result.mashAcidAddition ? [addition(result.mashAcidAddition.label, result.mashAcidAddition.mashAcidMl, "ml", "mash")] : []),
    ...(result.spargeAcidAddition ? [addition(result.spargeAcidAddition.label, result.spargeAcidAddition.spargeAcidMl, "ml", "sparge")] : []),
  ].filter((ingredient) => ingredient.amount > 0);
};

export const exportRecipeToBeerXml = (recipe: RecipeDetailDto) => {
  const canonical = mapRecipeToCanonical(recipe);
  const stats = getRecipeImportStats(recipe);
  const notes = canonical.description;
  const hops = canonical.ingredients.filter((ingredient) => ingredient.category === "hop");
  const fermentables = canonical.ingredients.filter((ingredient) => ingredient.category === "fermentable");
  const yeasts = canonical.ingredients.filter((ingredient) => ingredient.category === "yeast");
  const miscs = [...canonical.ingredients.filter((ingredient) => ingredient.category === "consumable" || ingredient.category === "water_treatment"), ...waterPlanIngredients(recipe)];

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<RECIPES>",
    "  <RECIPE>",
    xmlTag("NAME", canonical.title, "    ").trimEnd(),
    xmlTag("VERSION", 1, "    ").trimEnd(),
    xmlTag("TYPE", getRecipeType(recipe), "    ").trimEnd(),
    xmlTag("NOTES", notes, "    ").trimEnd(),
    renderBeerXmlStyle(canonical.styleId),
    renderBeerXmlFermentation(canonical),
    xmlTag("NB_PROCESS_META", canonical.processMeta ? JSON.stringify(canonical.processMeta) : null).trimEnd(),
    xmlTag("NB_WATER_PLAN", canonical.waterPlanMeta ? JSON.stringify(canonical.waterPlanMeta) : null).trimEnd(),
    xmlTag("NB_CALCULATION_META", canonical.calculationMeta ? JSON.stringify(canonical.calculationMeta) : null).trimEnd(),
    xmlTag("NB_EQUIPMENT_PROFILE", canonical.equipmentProfileSnapshot ? JSON.stringify({ ...canonical.equipmentProfileSnapshot, id: null, notes: null }) : null).trimEnd(),
    xmlTag("BATCH_SIZE", compactNumber(canonical.batchSizeL ?? 20, 3), "    ").trimEnd(),
    xmlTag("BOIL_SIZE", compactNumber(getBoilSizeL(recipe, canonical), 3), "    ").trimEnd(),
    xmlTag("BOIL_TIME", compactNumber(canonical.boilTimeMinutes ?? 60, 0), "    ").trimEnd(),
    xmlTag("EFFICIENCY", compactNumber(canonical.efficiency, 2), "    ").trimEnd(),
    xmlTag("OG", compactNumber(stats.og, 3), "    ").trimEnd(),
    xmlTag("FG", compactNumber(stats.fg, 3), "    ").trimEnd(),
    xmlTag("IBU", compactNumber(stats.ibu, 1), "    ").trimEnd(),
    xmlTag("IBU_METHOD", mapBitternessFormulaToBeerXmlMethod(readCanonicalBitternessFormula(canonical)), "    ").trimEnd(),
    xmlTag("COLOR", compactNumber(stats.color, 1), "    ").trimEnd(),
    xmlTag("ABV", compactNumber(stats.abv, 2), "    ").trimEnd(),
    renderBeerXmlCollection("HOPS", hops, renderBeerXmlHop),
    renderBeerXmlCollection("FERMENTABLES", fermentables, renderBeerXmlFermentable),
    renderBeerXmlCollection("YEASTS", yeasts, renderBeerXmlYeast),
    renderBeerXmlCollection("MISCS", miscs, renderBeerXmlMisc),
    renderBeerXmlMash(canonical),
    "  </RECIPE>",
    "</RECIPES>"
  ].filter(Boolean).join("\n");
};

type XmlNode = Record<string, unknown>;
const readTag = (node: XmlNode, tag: string): string | null => {
  const value = node[tag];
  const text = isRecord(value) ? value["#text"] : value;
  return typeof text === "string" && text.trim() ? text.trim() : null;
};
const readNumberTag = (node: XmlNode, tag: string) => readFiniteNumber(readTag(node, tag));
const readBooleanTag = (node: XmlNode, tag: string) => {
  const value = readTag(node, tag)?.toLowerCase();
  if (["true", "1", "yes"].includes(value ?? "")) return true;
  if (["false", "0", "no"].includes(value ?? "")) return false;
  return null;
};
const readBlocks = (node: XmlNode, tag: string): XmlNode[] => Object.entries(node).flatMap(([key, value]) => {
  const values = Array.isArray(value) ? value : [value];
  return values.filter(isRecord).flatMap((child) => key === tag ? [child] : readBlocks(child, tag));
});
const readExtension = <T>(node: XmlNode, key: string, schema: { safeParse: (value: unknown) => { success: boolean; data?: T } }, warnings: string[]): T | null => {
  const text = readTag(node, key);
  if (!text) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    if (parsed.success && parsed.data) return parsed.data;
  } catch { /* Invalid extensions must not override valid standard fields. */ }
  warnings.push(`Расширение ${key} не распознано; использованы стандартные поля BeerXML.`);
  return null;
};
const restoreIngredient = (node: XmlNode, ingredient: CanonicalRecipeIngredient): CanonicalRecipeIngredient => {
  const extension = readTag(node, "NB_INGREDIENT");
  if (!extension) return ingredient;
  try {
    const data: unknown = JSON.parse(extension);
    if (!isRecord(data) || typeof data.amount !== "number" || !Number.isFinite(data.amount) || data.amount <= 0) throw new Error();
    const unit = readUnit(data.unit, ingredient.unit);
    const stage = ["mash", "boil", "whirlpool", "fermentation", "packaging", "other"].includes(String(data.stage))
      ? data.stage as CanonicalRecipeIngredient["stage"] : ingredient.stage;
    return { ...ingredient, amount: data.amount, unit, stage,
      hopForm: ["pellet", "whole_cone", "cryo", "lupulin", "standard"].includes(String(data.hopForm)) ? data.hopForm as CustomHopForm : ingredient.hopForm,
      yeastForm: ["dry", "liquid", "slurry", "culture"].includes(String(data.yeastForm)) ? data.yeastForm as CustomYeastForm : ingredient.yeastForm,
      stepMeta: isRecord(data.stepMeta) ? data.stepMeta : ingredient.stepMeta };
  } catch { throw new Error("INVALID_BEERXML"); }
};
const readMiscAmount = (node: XmlNode, fallback: number, weight: boolean) => {
  const display = readTag(node, "DISPLAY_AMOUNT")?.match(/^([\d.]+)\s*(pack(?:s|ages?)?|pkg|items?|units?|pcs)$/i);
  if (display) return { amount: Number(display[1]), unit: readUnit(display[2], "item") };
  return { amount: weight ? fallback * 1000 : fallback, unit: weight ? "g" as const : "l" as const };
};

const mapBeerXmlFermentableType = (rawType: string | null): Pick<CanonicalRecipeIngredient, "type" | "category"> => {
  const normalized = rawType?.toLowerCase() ?? "";
  if (normalized.includes("grain") || normalized.includes("malt")) {
    return { type: "malt", category: "fermentable" };
  }
  return { type: "fermentable", category: "fermentable" };
};

const mapBeerXmlHopForm = (rawForm: string | null): CustomHopForm | null => {
  const normalized = rawForm?.toLowerCase() ?? "";
  if (!normalized) return null;
  if (normalized.includes("pellet")) return "pellet";
  if (normalized.includes("leaf") || normalized.includes("whole")) return "whole_cone";
  if (normalized.includes("cryo")) return "cryo";
  if (normalized.includes("lupulin") || normalized.includes("lupomax")) return "lupulin";
  return "standard";
};

const mapBeerXmlYeastForm = (rawForm: string | null): CustomYeastForm | null => {
  const normalized = rawForm?.toLowerCase() ?? "";
  if (normalized.includes("dry")) return "dry";
  if (normalized.includes("liquid")) return "liquid";
  if (normalized.includes("slurry")) return "slurry";
  if (normalized.includes("culture")) return "culture";
  return null;
};

const mapBeerXmlPhysicalForm = (rawType: string | null, rawName: string | null): CustomPhysicalForm | null => {
  const normalized = `${rawType ?? ""} ${rawName ?? ""}`.toLowerCase();
  if (normalized.includes("tablet")) return "tablet";
  if (normalized.includes("powder")) return "powder";
  if (normalized.includes("crystal")) return "crystal";
  if (normalized.includes("solution")) return "solution";
  if (normalized.includes("liquid")) return "liquid";
  return null;
};

const mapBeerXmlHopUse = (rawUse: string | null): {
  stage: CanonicalRecipeIngredient["stage"];
  useType: string;
} => {
  const normalized = rawUse?.toLowerCase() ?? "";
  if (normalized.includes("dry")) {
    return { stage: "fermentation", useType: "dry_hop" };
  }
  if (normalized.includes("aroma") || normalized.includes("whirlpool") || normalized.includes("hopstand")) {
    return { stage: "whirlpool", useType: "whirlpool" };
  }
  if (normalized.includes("first")) {
    return { stage: "boil", useType: "first_wort_hop" };
  }
  return { stage: "boil", useType: "boil" };
};

const buildBeerXmlProcessMeta = (recipeBlock: XmlNode, warnings: string[]): Record<string, unknown> | null => {
  const mashSteps = readBlocks(recipeBlock, "MASH_STEP")
    .map((block, index) => {
      const temperatureC = readNumberTag(block, "STEP_TEMP");
      const durationMinutes = readNumberTag(block, "STEP_TIME");
      if (temperatureC == null || durationMinutes == null || durationMinutes <= 0) {
        return null;
      }
      return {
        id: `imported-mash-step-${index + 1}`,
        name: readTag(block, "NAME") ?? `Mash step ${index + 1}`,
        temperatureC,
        durationMinutes: Math.round(durationMinutes)
      };
    })
    .filter((step): step is NonNullable<typeof step> => step !== null)
    .slice(0, 10);

  const fermentationSteps = ["PRIMARY", "SECONDARY", "TERTIARY"].flatMap((stage) => {
    const temperatureC = readNumberTag(recipeBlock, `${stage}_TEMP`);
    const durationDays = readNumberTag(recipeBlock, `${stage}_AGE`);
    return temperatureC == null && durationDays == null ? [] : [{ name: stage, temperatureC, durationDays }];
  });
  const fermentationProfile = buildImportedFermentationProfile(fermentationSteps, warnings);
  if (readBlocks(recipeBlock, "MASH_STEP").length > 10) warnings.push("Перенесены первые 10 шагов затирания.");
  return mashSteps.length || fermentationProfile ? {
    ...(mashSteps.length ? { mashProfile: { steps: mashSteps } } : {}),
    ...(fermentationProfile ? { fermentationProfile } : {}),
  } : null;
};

const importRecipeBlock = (recipeBlock: XmlNode): CanonicalRecipe => {
  const warnings: string[] = [];
  const waterPlanMeta = readExtension(recipeBlock, "NB_WATER_PLAN", recipeWaterPlanMetaSchema, warnings);
  const hops = readBlocks(recipeBlock, "HOP").map((block): CanonicalRecipeIngredient => {
    const rawUse = readTag(block, "USE");
    const rawForm = readTag(block, "FORM");
    const hopUse = mapBeerXmlHopUse(rawUse);
    const timeMinutes = readNumberTag(block, "TIME") ?? null;
    const alphaAcidPct = readNumberTag(block, "ALPHA");
    const hopForm = mapBeerXmlHopForm(rawForm);
    return restoreIngredient(block, {
      name: readTag(block, "NAME") ?? "Imported hop",
      type: "hop",
      category: "hop",
      amount: (readNumberTag(block, "AMOUNT") ?? 0) * 1000,
      unit: "g",
      stage: hopUse.stage,
      timeOffset: timeMinutes == null ? null : Math.round(timeMinutes),
      hopAlphaAcidPct: alphaAcidPct,
      hopForm,
      stepMeta: {
        useType: hopUse.useType,
        timeMinutes,
        durationDays: hopUse.stage === "fermentation" && timeMinutes != null ? timeMinutes / 1440 : null,
        temperatureC: readNumberTag(block, "TEMPERATURE") ?? readNumberTag(block, "HOP_TEMP"),
        hopForm
      },
      externalImportMeta: { source: "beerxml", rawUse, rawForm, alphaAcidPct }
    });
  });
  const fermentables = readBlocks(recipeBlock, "FERMENTABLE").map((block): CanonicalRecipeIngredient => {
    const rawType = readTag(block, "TYPE");
    const colorLovibond = readNumberTag(block, "COLOR");
    const yieldPct = readNumberTag(block, "YIELD");
    return restoreIngredient(block, {
      name: readTag(block, "NAME") ?? "Imported fermentable",
      ...mapBeerXmlFermentableType(rawType),
      amount: readNumberTag(block, "AMOUNT") ?? 0,
      unit: "kg",
      stage: readBooleanTag(block, "ADD_AFTER_BOIL") ? "boil" : "mash",
      fermentableColorEbc: lovibondToEbc(colorLovibond),
      fermentableExtractYieldPct: yieldPct,
      externalImportMeta: { source: "beerxml", rawType, colorLovibond, yieldPct }
    });
  });
  const yeasts = readBlocks(recipeBlock, "YEAST").map((block): CanonicalRecipeIngredient => {
    const amount = readNumberTag(block, "AMOUNT") ?? 0;
    const amountIsWeight = readBooleanTag(block, "AMOUNT_IS_WEIGHT") ?? false;
    const rawForm = readTag(block, "FORM");
    const attenuationPct = readNumberTag(block, "ATTENUATION");
    return restoreIngredient(block, {
      name: readTag(block, "NAME") ?? "Imported yeast",
      type: "yeast",
      category: "yeast",
      ...readMiscAmount(block, amount, amountIsWeight),
      stage: "fermentation",
      yeastAttenuationPct: attenuationPct,
      yeastForm: mapBeerXmlYeastForm(rawForm),
      externalImportMeta: { source: "beerxml", rawForm, attenuationPct }
    });
  });
  const miscs = readBlocks(recipeBlock, "MISC").filter((block) => !waterPlanMeta || readTag(block, "NB_FROM_WATER_PLAN") !== "TRUE").map((block): CanonicalRecipeIngredient => {
    const use = readTag(block, "USE")?.toLowerCase() ?? "other";
    const rawType = readTag(block, "TYPE");
    const name = readTag(block, "NAME") ?? "Imported misc";
    const amount = readNumberTag(block, "AMOUNT") ?? 0;
    const amountIsWeight = readBooleanTag(block, "AMOUNT_IS_WEIGHT") ?? true;
    const waterAgent = rawType?.toLowerCase() === "water agent";
    return restoreIngredient(block, {
      name,
      type: waterAgent ? "water_treatment" : "consumable",
      category: waterAgent ? "water_treatment" : "consumable",
      ...readMiscAmount(block, amount, amountIsWeight),
      stage: use.includes("boil") ? "boil" : use.includes("mash") ? "mash" : use.includes("primary") || use.includes("secondary") ? "fermentation" : use.includes("bott") || use.includes("pack") ? "packaging" : "other",
      timeOffset: readNumberTag(block, "TIME"),
      physicalForm: mapBeerXmlPhysicalForm(rawType, name),
      externalImportMeta: { source: "beerxml", rawUse: readTag(block, "USE"), rawType }
    });
  });
  const ingredients = [...fermentables, ...hops, ...yeasts, ...miscs];
  if (!ingredients.length) {
    throw new Error("IMPORT_RECIPE_EMPTY");
  }

  const rawIbuMethod = readTag(recipeBlock, "IBU_METHOD");
  const importedFormulaPreference = mapBeerXmlIbuMethodToBitternessFormula(rawIbuMethod) ?? "tinseth_whirlpool_v2";

  const styleBlock = readBlocks(recipeBlock, "STYLE")[0] ?? null;
  const styleHint = styleBlock
    ? (() => {
        const name = readTag(styleBlock, "NAME");
        const categoryNumber = readTag(styleBlock, "CATEGORY_NUMBER");
        const styleLetter = readTag(styleBlock, "STYLE_LETTER");
        return name || categoryNumber ? { name, categoryNumber, styleLetter } : null;
      })()
    : null;

  return {
    title: readTag(recipeBlock, "NAME") ?? "Imported BeerXML recipe",
    batchSizeL: readNumberTag(recipeBlock, "BATCH_SIZE") ?? 20,
    boilTimeMinutes: readNumberTag(recipeBlock, "BOIL_TIME") ?? 60,
    efficiency: readNumberTag(recipeBlock, "EFFICIENCY"),
    description: readTag(recipeBlock, "NOTES"),
    processMeta: readExtension(recipeBlock, "NB_PROCESS_META", recipeProcessMetaSchema, warnings) as unknown as Record<string, unknown> ?? buildBeerXmlProcessMeta(recipeBlock, warnings),
    waterPlanMeta: waterPlanMeta as unknown as Record<string, unknown> | null,
    equipmentProfileSnapshot: readExtension(recipeBlock, "NB_EQUIPMENT_PROFILE", equipmentProfileSnapshotSchema, warnings),
    calculationMeta: readExtension(recipeBlock, "NB_CALCULATION_META", recipeCalculationMetaSchema, warnings) as unknown as Record<string, unknown> ?? {
      bitternessFormula: importedFormulaPreference,
      bitternessSettings: {}
    },
    importMeta: {
      source: "beerxml",
      warnings,
      importedAt: new Date().toISOString(),
      importedFormulaPreference,
      styleHint,
      rawIbuMethod,
      importedStats: {
        og: readNumberTag(recipeBlock, "OG"),
        fg: readNumberTag(recipeBlock, "FG"),
        ibu: readNumberTag(recipeBlock, "IBU"),
        color: readNumberTag(recipeBlock, "COLOR"),
        abv: readNumberTag(recipeBlock, "ABV")
      }
    },
    ingredients
  };
};

export const importBeerXmlToCanonicalRecipes = (xml: string): CanonicalRecipe[] => {
  if (!xml.trim()) throw new Error("EMPTY_BEERXML");
  if (new TextEncoder().encode(xml).length > RECIPE_IMPORT_MAX_INPUT_BYTES) throw new Error("IMPORT_INPUT_TOO_LARGE");
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error("INVALID_BEERXML");
  const tree: unknown = new XMLParser({ parseTagValue: false, parseAttributeValue: false, trimValues: false, processEntities: true, htmlEntities: true, transformTagName: (name) => name.toUpperCase(), ignoreDeclaration: true }).parse(xml);
  if (!isRecord(tree)) throw new Error("INVALID_BEERXML");
  const roots = Object.keys(tree).filter((key) => !key.startsWith("?"));
  if (roots.length !== 1 || !["RECIPES", "RECIPE"].includes(roots[0]!)) throw new Error("INVALID_BEERXML");
  // Only direct recipe children belong to this collection; nested recipes are invalid.
  const container = roots[0] === "RECIPES" ? tree.RECIPES : tree;
  if (!isRecord(container)) throw new Error("INVALID_BEERXML");
  const value = container.RECIPE;
  const blocks = Array.isArray(value) ? value : value ? [value] : [];
  if (!blocks.length || !blocks.every(isRecord)) throw new Error("INVALID_BEERXML");
  if (blocks.length > RECIPE_IMPORT_MAX_RECIPES) throw new Error("IMPORT_TOO_MANY_RECIPES");
  return blocks.map(importRecipeBlock);
};
export const importBeerXmlToCanonicalRecipe = (xml: string): CanonicalRecipe => {
  const recipes = importBeerXmlToCanonicalRecipes(xml);
  if (recipes.length !== 1) throw new Error("IMPORT_MULTIPLE_RECIPES");
  return recipes[0]!;
};
