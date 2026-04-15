import type { WaterProfile } from "@nb/brewing-core";

export type RecipeWaterProfilePreset = {
  id: string;
  name: string;
  description: string;
  profile: WaterProfile;
  kind: "source" | "target";
  isHistoricalExample?: boolean;
};

const profile = (
  ca: number,
  mg: number,
  na: number,
  cl: number,
  so4: number,
  hco3: number,
  ph: number | null = null
): WaterProfile => ({ ca, mg, na, cl, so4, hco3, ph });

export const builtInSourceWaterProfiles = [
  {
    id: "ro_distilled",
    name: "RO / Дистиллят",
    description: "Почти нулевая минерализация как старт для сборки профиля.",
    profile: profile(0, 0, 0, 0, 0, 0, 7),
    kind: "source"
  },
  {
    id: "pilsen_example",
    name: "Pilsen",
    description: "Исторический пример, не заменяет ваш анализ воды.",
    profile: profile(7, 3, 2, 5, 5, 25),
    kind: "source",
    isHistoricalExample: true
  },
  {
    id: "dublin_example",
    name: "Dublin",
    description: "Исторический пример, не заменяет ваш анализ воды.",
    profile: profile(110, 4, 12, 19, 53, 280),
    kind: "source",
    isHistoricalExample: true
  },
  {
    id: "munich_example",
    name: "Munich",
    description: "Исторический пример, не заменяет ваш анализ воды.",
    profile: profile(82, 20, 4, 2, 16, 320),
    kind: "source",
    isHistoricalExample: true
  }
] satisfies RecipeWaterProfilePreset[];

export const builtInTargetWaterProfiles = [
  {
    id: "balanced",
    name: "Balanced",
    description: "Нейтральный старт для большинства светлых и янтарных элей.",
    profile: profile(80, 5, 25, 75, 80, 100),
    kind: "target"
  },
  {
    id: "light_malty",
    name: "Light & Malty",
    description: "Больше хлоридов для мягкого солодового акцента.",
    profile: profile(60, 5, 10, 95, 55, 0),
    kind: "target"
  },
  {
    id: "light_hoppy",
    name: "Light & Hoppy",
    description: "Больше сульфатов для сухого хмелевого акцента.",
    profile: profile(75, 5, 10, 50, 150, 0),
    kind: "target"
  }
] satisfies RecipeWaterProfilePreset[];

export const builtInWaterProfilePresets = [
  ...builtInSourceWaterProfiles,
  ...builtInTargetWaterProfiles
] satisfies RecipeWaterProfilePreset[];

export const findBuiltInSourceWaterProfile = (id: string | null | undefined) => (
  builtInSourceWaterProfiles.find((preset) => preset.id === id) ?? null
);

export const findBuiltInTargetWaterProfile = (id: string | null | undefined) => (
  builtInTargetWaterProfiles.find((preset) => preset.id === id) ?? null
);
