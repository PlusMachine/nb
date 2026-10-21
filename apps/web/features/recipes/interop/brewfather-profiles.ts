import { type BrewingSaltId } from "@nb/brewing-core";
import type { CanonicalRecipeIngredient } from "./canonical";
import { equipmentProfileSnapshotSchema, type EquipmentProfileSnapshot } from "../../equipment-profiles/contracts";
import { recipeWaterPlanMetaSchema } from "../contracts";
import { isRecord, readNumber, readFirstNumber, readString } from "./readers";

export const importBrewfatherEquipment = (payload: Record<string, unknown>, warnings: string[]): EquipmentProfileSnapshot | null => {
  if (!isRecord(payload.equipment)) return null;
  const equipment = payload.equipment;
  const hopUtilizationPct = readNumber(equipment.hopUtilization);
  const result = equipmentProfileSnapshotSchema.safeParse({
    id: null, snapshotAt: new Date().toISOString(), name: readString(equipment.name) ?? "Оборудование из Brewfather",
    targetBatchVolumeL: readNumber(payload.batchSize) ?? readNumber(equipment.batchSize) ?? 20,
    brewhouseEfficiencyPct: readNumber(payload.efficiency) ?? readNumber(equipment.efficiency) ?? undefined,
    evaporationRateLPerHr: readFirstNumber(equipment, ["boilOffPerHr", "boilOffPerHour", "evaporationRateLPerHr"]) ?? undefined,
    trubChillerLossL: readFirstNumber(equipment, ["trubChillerLoss", "trubChillerLossL"]) ?? undefined,
    fermenterLossL: readFirstNumber(equipment, ["fermenterLoss", "fermenterLossL"]) ?? undefined,
    grainAbsorptionLPerKg: readFirstNumber(equipment, ["grainAbsorptionRate", "grainAbsorption", "grainAbsorptionLPerKg"]) ?? undefined,
    coolingShrinkagePct: readFirstNumber(equipment, ["coolingShrinkage", "coolingShrinkagePct"]) ?? undefined,
    mashThicknessLPerKg: readFirstNumber(equipment, ["waterGrainRatio", "mashThickness", "mashThicknessLPerKg"]) ?? undefined,
    mashTunDeadspaceL: readFirstNumber(equipment, ["mashTunDeadSpace", "mashTunDeadspace", "mashTunDeadspaceL"]) ?? undefined,
    hopUtilizationFactor: hopUtilizationPct == null ? readNumber(equipment.hopUtilizationFactor) ?? undefined : hopUtilizationPct / 100,
    altitudeM: readFirstNumber(equipment, ["altitude", "altitudeM"]) ?? undefined,
    notes: null,
  });
  if (result.success) return result.data;
  warnings.push("Профиль оборудования содержит неподдерживаемые значения. Исходные параметры сохранены; выберите оборудование перед варкой.");
  return null;
};

const readWaterProfile = (value: unknown) => {
  if (!isRecord(value)) return null;
  const ions = { ca: ["ca", "Ca", "calcium"], mg: ["mg", "Mg", "magnesium"], na: ["na", "Na", "sodium"],
    cl: ["cl", "Cl", "chloride"], so4: ["so4", "SO4", "sulfate", "sulphate"], hco3: ["hco3", "HCO3", "bicarbonate"] };
  if (!Object.values(ions).some((keys) => readFirstNumber(value, keys) != null)) return null;
  return { ...Object.fromEntries(Object.entries(ions).map(([key, keys]) => [key, readFirstNumber(value, keys) ?? 0])), ph: readFirstNumber(value, ["ph", "pH"]) };
};

const saltFields: Record<string, BrewingSaltId> = {
  calciumSulfate: "gypsum", calciumChloride: "calcium_chloride", magnesiumSulfate: "epsom_salt",
  sodiumChloride: "table_salt", sodiumBicarbonate: "baking_soda", calciumCarbonate: "chalk", calciumHydroxide: "slaked_lime",
};

export const importBrewfatherWater = (payload: Record<string, unknown>, warnings: string[], ingredients: CanonicalRecipeIngredient[]) => {
  if (!isRecord(payload.water)) return null;
  const water = payload.water;
  // Brewfather's diluted profile already includes the blend; never apply dilution twice.
  const source = readWaterProfile(water.diluted) ?? readWaterProfile(water.source ?? water.sourceProfile);
  const target = readWaterProfile(water.target ?? water.targetProfile);
  if (!source && !target) {
    warnings.push("Формат профиля воды не распознан: исходные данные сохранены, настройте воду перед варкой.");
    return null;
  }
  const manualSaltAdditions: Array<{ salt: BrewingSaltId; grams: number; target: "mash" | "sparge" | "all" }> = [];
  const scopes = isRecord(water.mashAdjustments) || isRecord(water.spargeAdjustments)
    ? [["mashAdjustments", "mash"], ["spargeAdjustments", "sparge"]] as const
    : [["totalAdjustments", "all"], ["adjustments", "all"]] as const;
  const stagedIngredients: CanonicalRecipeIngredient[] = [];
  for (const [field, scope] of scopes) {
    const adjustments = water[field];
    if (!isRecord(adjustments) || (scope === "sparge" && water.enableSpargeAdjustments === false)) continue;
    for (const [key, value] of Object.entries(adjustments)) {
      const grams = readNumber(value);
      if (grams == null || grams <= 0 || key === "volume") continue;
      const settings = isRecord(water.settings) && isRecord(water.settings[key]) ? water.settings[key] : null;
      const nonStandard = settings && (readNumber(settings.concentration) != null && settings.concentration !== 100 || /liquid|solution/i.test(String(settings.form)));
      if (saltFields[key] && !nonStandard) {
        manualSaltAdditions.push({ salt: saltFields[key]!, grams, target: scope });
      } else {
        warnings.push(`Добавка для воды ${key}: доза ${grams} г сохранена в исходном JSON; проверьте состав и концентрацию вручную.`);
      }
    }
    const acids = Array.isArray(adjustments.acids) ? adjustments.acids.filter(isRecord) : [];
    for (const acid of acids) {
      const amount = readNumber(acid.amount);
      if (amount == null || amount <= 0) continue;
      stagedIngredients.push({ name: `${readString(acid.type) ?? "Acid"} ${readNumber(acid.concentration) ?? ""}% (${scope})`,
        type: "water_treatment", category: "water_treatment", amount, unit: "ml", stage: scope === "sparge" ? "other" : "mash",
        concentration: readNumber(acid.concentration) != null ? `${acid.concentration}%` : null,
        stepMeta: { waterTarget: scope, stageLabel: scope === "sparge" ? "Промывочная вода" : scope === "mash" ? "Заторная вода" : "Вся вода" }, externalImportMeta: { source: "brewfather_json", rawWaterAdjustment: true } });
    }
  }
  if (stagedIngredients.length) warnings.push("Кислоты перенесены как отдельные добавки с исходными дозами. Автоподбор кислот выключен; проверьте pH перед варкой.");
  else warnings.push("Автоподбор кислот выключен, чтобы сохранить исходные дозировки. Его можно включить в настройке воды после проверки pH.");
  // BF may also include the calculated water additions in miscs. Do not duplicate them.
  const hasAdjustments = manualSaltAdditions.length > 0 || stagedIngredients.length > 0;
  const data = isRecord(payload.data) ? payload.data : {};
  const mashWaterVolumeL = readFirstNumber(water, ["mashWaterAmount", "mashWaterVolume", "mashWater", "mash"]) ?? readNumber(data.mashWaterAmount);
  const spargeWaterVolumeL = readFirstNumber(water, ["spargeWaterAmount", "spargeWaterVolume", "spargeWater", "sparge"]) ?? readNumber(data.spargeWaterAmount);
  const result = recipeWaterPlanMetaSchema.safeParse({ setupEnabled: true, engine: manualSaltAdditions.length ? "advanced_manual" : "profile_only", sourceProfileMode: "manual",
    sourceProfile: source, sourceProfileName: isRecord(water.source) ? readString(water.source.name) : null,
    targetProfileMode: "manual", targetProfile: target, manualSaltAdditions, mashAcidificationEnabled: false, spargeAcidificationEnabled: false,
    mashWaterVolumeL, spargeWaterVolumeL,
    totalWaterVolumeL: readNumber(data.totalWaterAmount) ?? (mashWaterVolumeL != null && spargeWaterVolumeL != null ? mashWaterVolumeL + spargeWaterVolumeL : null),
    targetMashPh: isRecord(payload.mash) && (readNumber(payload.mash.ph) ?? 0) >= 4 && (readNumber(payload.mash.ph) ?? 0) <= 7 ? readNumber(payload.mash.ph) : null,
  });
  if (!result.success) { warnings.push("Профиль воды выходит за допустимые диапазоны; исходные параметры сохранены в JSON, настройте воду перед варкой."); return null; }
  if (hasAdjustments) {
    const aliases: Record<BrewingSaltId, RegExp> = {
      gypsum: /gypsum|calcium.?sul[fp]hate|caso4/i, calcium_chloride: /calcium.?chloride|cacl2/i,
      epsom_salt: /epsom|magnesium.?sul[fp]hate|mgso4/i, table_salt: /table.?salt|sodium.?chloride|nacl/i,
      baking_soda: /baking.?soda|sodium.?bicarbonate|nahco3/i, chalk: /chalk|calcium.?carbonate|caco3/i,
      slaked_lime: /slaked.?lime|calcium.?hydroxide/i,
    };
    for (let index = ingredients.length - 1; index >= 0; index--) {
      const ingredient = ingredients[index]!;
      if (ingredient.externalImportMeta?.rawWaterAdjustment !== true) continue;
      const saltDuplicate = manualSaltAdditions.some((salt) => aliases[salt.salt].test(ingredient.name));
      const acidDuplicate = stagedIngredients.some((acid) => ingredient.name.toLowerCase().includes(acid.name.split(" ")[0]!.toLowerCase()));
      if (saltDuplicate || acidDuplicate) ingredients.splice(index, 1);
    }
    ingredients.push(...stagedIngredients);
  }
  return result.data;
};
