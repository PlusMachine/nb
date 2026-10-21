import { defaultRecipeProcessMeta, type RecipeProcessMeta } from "../contracts";

export type ImportedFermentationStep = {
  name: string;
  temperatureC: number | null;
  durationDays: number | null;
};

/** Keep chronological order; only move terminal stages to the dedicated controls. */
export const buildImportedFermentationProfile = (steps: ImportedFermentationStep[], warnings: string[]) => {
  if (!steps.length) return null;
  const [primary, ...rest] = steps;
  const profile: RecipeProcessMeta["fermentationProfile"] = {
    ...structuredClone(defaultRecipeProcessMeta.fermentationProfile),
    primaryTemperatureC: primary.temperatureC,
    primaryDurationDays: primary.durationDays,
  };
  const takeLast = (pattern: RegExp, key: "coldCrash" | "conditioning") => {
    const last = rest.at(-1);
    if (last && pattern.test(last.name)) {
      rest.pop();
      profile[key] = { enabled: true, temperatureC: last.temperatureC, durationDays: last.durationDays };
    }
  };
  takeLast(/condition|aging|ageing|выдерж/i, "conditioning");
  takeLast(/cold.?crash|колд|охлажд/i, "coldCrash");
  // A conditioning stage BEFORE dry hop stays in extraSteps, preserving order.
  if (rest.length > 10) warnings.push("В профиле брожения больше 11 этапов: дополнительные этапы сохранены в исходных данных, проверьте план.");
  profile.extraSteps = rest.slice(0, 10).map((step, index) => ({ id: `imported-fermentation-${index + 1}`, ...step }));
  return profile;
};
