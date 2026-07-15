import React from "react";
import { Droplets } from "lucide-react";

import type {
  RecipeDetailDto,
  RecipeIngredientDto
} from "@/features/recipes/contracts";
import { calculateEquipmentVolumePlan } from "@/features/equipment-profiles/volume-plan";
import {
  buildRecipeWaterPlanResult,
  recipeWaterAcidPresentation,
  type RecipeWaterPlanFermentableInput,
  type RecipeWaterPlanResult
} from "@/features/recipes/water-plan";

const ionLabels: Record<"ca" | "mg" | "na" | "cl" | "so4" | "hco3", string> = {
  ca: "Ca",
  mg: "Mg",
  na: "Na",
  cl: "Cl",
  so4: "SO4",
  hco3: "HCO3"
};

const formatGrams = (grams: number): string => {
  if (!Number.isFinite(grams) || grams <= 0) {
    return "0 г";
  }
  return `${grams.toFixed(grams >= 10 ? 1 : 2)} г`;
};

const formatMl = (ml: number): string => {
  if (!Number.isFinite(ml) || ml <= 0) {
    return "0 мл";
  }
  return `${ml.toFixed(ml >= 10 ? 1 : 2)} мл`;
};

const isFermentableCategory = (ingredient: RecipeIngredientDto): boolean => (
  ingredient.ingredientCategory === "fermentable" || ingredient.type === "malt" || ingredient.type === "fermentable"
);

// Класс/цвет солода для модели pH затора (Ф6/Ф7) несут только "малтовые" технические
// данные (MaltTechnicalData) — у ферментируемых-не-солодов эти поля не заполняются,
// классификатор в этом случае падает на ключевые слова имени.
const resolveMaltFieldsForWaterPlan = (
  technicalData: RecipeIngredientDto["ingredientTechnicalData"]
): Pick<RecipeWaterPlanFermentableInput, "maltType" | "colorEbcMin" | "colorEbcMax"> => {
  if (!technicalData || technicalData.type !== "malt") {
    return { maltType: null, colorEbcMin: null, colorEbcMax: null };
  }

  const malt = technicalData as Extract<
    NonNullable<typeof technicalData>,
    { type: "malt" }
  >;
  return {
    maltType: malt.maltType ?? null,
    colorEbcMin: malt.colorEbcMin ?? null,
    colorEbcMax: malt.colorEbcMax ?? null
  };
};

const buildFermentablesForWaterPlan = (
  ingredients: RecipeIngredientDto[]
): RecipeWaterPlanFermentableInput[] => {
  return ingredients
    .filter(isFermentableCategory)
    .map((ingredient) => {
      const unit = ingredient.amountNormalizedUnit;
      const qty = ingredient.amountNormalizedQuantity;
      let weightKg = 0;
      if (unit === "kg") {
        weightKg = qty;
      } else if (unit === "g") {
        weightKg = qty / 1000;
      }

      return {
        name:
          ingredient.ingredientDisplayName
            ?? ingredient.ingredientDisplayNameRu
            ?? ingredient.ingredientDisplayNameSnapshot
            ?? null,
        subtype: ingredient.ingredientSubtype ?? null,
        weightKg,
        ...resolveMaltFieldsForWaterPlan(ingredient.ingredientTechnicalData)
      };
    });
};

const getBatchVolumeLiters = (
  amount: number,
  unit: RecipeIngredientDto["amountNormalizedUnit"] | string,
): number | null => {
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  if (unit === "l") {
    return amount;
  }
  if (unit === "ml") {
    return amount / 1000;
  }
  return null;
};

const countSaltAdditions = (waterPlanResult: RecipeWaterPlanResult): number => {
  const isSplit = waterPlanResult.waterVolumes.source === "manual_split";
  const saltCount = isSplit
    ? waterPlanResult.mashSaltAdditions.filter((s) => s.grams > 0).length
      + waterPlanResult.spargeSaltAdditions.filter((s) => s.grams > 0).length
    : waterPlanResult.totalSaltAdditions.filter((s) => s.grams > 0).length;
  const acidCount = (waterPlanResult.mashAcidAddition?.mashAcidMl ?? 0) > 0 ? 1 : 0;
  const spargeAcidCount = (waterPlanResult.spargeAcidAddition?.spargeAcidMl ?? 0) > 0 ? 1 : 0;
  return saltCount + acidCount + spargeAcidCount;
};

export function PublicRecipeWaterSection({ recipe }: { recipe: RecipeDetailDto }) {
  const waterPlanMeta = recipe.waterPlanMeta;
  if (!waterPlanMeta?.setupEnabled) {
    return null;
  }

  const fermentables = buildFermentablesForWaterPlan(recipe.ingredients);
  const grainKg = fermentables.reduce((acc, item) => acc + (item.weightKg ?? 0), 0);
  const batchVolumeL = getBatchVolumeLiters(
    recipe.batchSizeNormalizedQuantity,
    recipe.batchSizeNormalizedUnit,
  );
  const equipmentVolumePlan = recipe.equipmentProfileSnapshot
    ? (() => {
        const effectiveEquipmentProfile = {
          ...recipe.equipmentProfileSnapshot,
          targetBatchVolumeL:
            batchVolumeL ?? recipe.equipmentProfileSnapshot.targetBatchVolumeL,
          grainAbsorptionLPerKg:
            waterPlanMeta.grainAbsorptionLPerKg ??
            recipe.equipmentProfileSnapshot.grainAbsorptionLPerKg,
        };

        return {
          ...calculateEquipmentVolumePlan(
            effectiveEquipmentProfile,
            grainKg,
            recipe.boilTimeMinutes,
          ),
          grainAbsorptionLPerKg:
            effectiveEquipmentProfile.grainAbsorptionLPerKg,
        };
      })()
    : null;

  const waterPlanResult = buildRecipeWaterPlanResult({
    waterPlanMeta,
    fallbackBatchVolumeL: batchVolumeL,
    boilTimeMinutes: recipe.boilTimeMinutes,
    equipmentVolumePlan,
    grainKg,
    beerSrm: recipe.color ?? null,
    fermentables,
  });

  const totalAdditions = countSaltAdditions(waterPlanResult);
  const targetName = waterPlanMeta.targetProfileName?.trim() || null;
  const isSplit = waterPlanResult.waterVolumes.source === "manual_split";
  const finalProfile = waterPlanResult.finalProfile;
  const predictedPh = waterPlanResult.predictedMashPhAfterAcid20C;

  if (totalAdditions === 0 && !targetName) {
    return null;
  }

  const saltRows = isSplit
    ? [
        ...waterPlanResult.mashSaltAdditions.filter((s) => s.grams > 0).map((s, idx) => ({ ...s, key: `mash-${idx}`, label: s.label, target: "затор" })),
        ...waterPlanResult.spargeSaltAdditions.filter((s) => s.grams > 0).map((s, idx) => ({ ...s, key: `sparge-${idx}`, label: s.label, target: "промывку" })),
      ]
    : waterPlanResult.totalSaltAdditions
        .filter((s) => s.grams > 0)
        .map((s, idx) => ({ ...s, key: `total-${idx}`, label: s.label, target: null }));

  const acidRows: Array<{ key: string; label: string; ml: number; target: string | null }> = [];
  if (waterPlanResult.mashAcidAddition && waterPlanResult.mashAcidAddition.mashAcidMl > 0) {
    const presentation = recipeWaterAcidPresentation[waterPlanResult.mashAcidAddition.acid];
    acidRows.push({
      key: "acid-mash",
      label: presentation?.label ?? waterPlanResult.mashAcidAddition.label,
      ml: waterPlanResult.mashAcidAddition.mashAcidMl,
      target: isSplit ? "затор" : null,
    });
  }
  if (waterPlanResult.spargeAcidAddition && waterPlanResult.spargeAcidAddition.spargeAcidMl > 0) {
    const presentation = recipeWaterAcidPresentation[waterPlanResult.spargeAcidAddition.acid];
    acidRows.push({
      key: "acid-sparge",
      label: presentation?.label ?? waterPlanResult.spargeAcidAddition.label,
      ml: waterPlanResult.spargeAcidAddition.spargeAcidMl,
      target: "промывка",
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 dark:bg-sky-500/15">
          <Droplets className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Вода</h2>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        {targetName ? (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Целевой профиль</div>
            <div className="mt-0.5 truncate font-semibold text-foreground">{targetName}</div>
          </div>
        ) : null}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {isSplit ? "Объёмы воды" : "Всего воды"}
          </div>
          <div className="mt-0.5 font-semibold text-foreground">
            {isSplit
              ? `${waterPlanResult.waterVolumes.mashWaterL.toFixed(1)} + ${waterPlanResult.waterVolumes.spargeWaterL.toFixed(1)} л`
              : `${waterPlanResult.waterVolumes.totalWaterL.toFixed(1)} л`}
          </div>
        </div>
        {predictedPh != null ? (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Mash pH 20°C</div>
            <div className="mt-0.5 font-semibold text-foreground">{predictedPh.toFixed(2)}</div>
          </div>
        ) : null}
      </div>

      {(saltRows.length || acidRows.length) ? (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Добавки</div>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {saltRows.map((row) => (
              <li
                key={row.key}
                className="flex items-baseline justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-foreground">
                  {row.label}
                  {row.target ? <span className="text-muted-foreground"> · {row.target}</span> : null}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {formatGrams(row.grams)}
                </span>
              </li>
            ))}
            {acidRows.map((row) => (
              <li
                key={row.key}
                className="flex items-baseline justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-foreground">
                  {row.label}
                  {row.target ? <span className="text-muted-foreground"> · {row.target}</span> : null}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {formatMl(row.ml)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {(["ca", "mg", "na", "cl", "so4", "hco3"] as const).map((key) => (
          <div key={key} className="rounded-lg bg-muted px-2 py-2 text-center">
            <div className="text-[11px] font-medium uppercase text-muted-foreground">{ionLabels[key]}</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
              {Math.round(finalProfile[key])}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
