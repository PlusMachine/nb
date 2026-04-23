import type { WaterProfile } from "@nb/brewing-core";

export type RecipeWaterProfilePreset = {
  id: string;
  name: string;
  description: string;
  profile: WaterProfile;
  kind: "source" | "target";
  isHistoricalExample?: boolean;
  tags?: string[];
  badge?: string;
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
    name: "Осмос",
    description: "Обратный осмос.",
    profile: profile(0, 0, 0, 0, 0, 0, 7),
    kind: "source"
  },
  {
    id: "distilled_water",
    name: "Дистиллированная вода",
    description: "Дистиллят.",
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
    name: "Balanced Ale",
    description: "Нейтральный старт для большинства светлых и янтарных элей.",
    profile: profile(80, 5, 25, 75, 80, 100),
    kind: "target",
    badge: "универсальный",
    tags: ["balanced", "ale", "amber", "универсальный"]
  },
  {
    id: "neipa",
    name: "NEIPA / Hazy IPA",
    description: "Мягкий хлоридный профиль для сочного хмелевого характера.",
    profile: profile(100, 10, 20, 175, 80, 0),
    kind: "target",
    badge: "hoppy",
    tags: ["neipa", "hazy", "ipa", "хмелевой", "сочный"]
  },
  {
    id: "west_coast_ipa",
    name: "West Coast IPA",
    description: "Сульфатный профиль для сухого, четкого хмелевого акцента.",
    profile: profile(100, 10, 15, 60, 250, 0),
    kind: "target",
    badge: "hoppy",
    tags: ["west coast", "ipa", "сухой", "хмелевой"]
  },
  {
    id: "pilsner",
    name: "Pilsner",
    description: "Чистый светлый профиль с умеренной минерализацией.",
    profile: profile(50, 5, 10, 50, 75, 0),
    kind: "target",
    badge: "lager",
    tags: ["pilsner", "pils", "lager", "лагер"]
  },
  {
    id: "helles",
    name: "Helles",
    description: "Мягкий солодовый лагерный профиль.",
    profile: profile(50, 5, 10, 75, 50, 60),
    kind: "target",
    badge: "malty",
    tags: ["helles", "lager", "malty", "солодовый"]
  },
  {
    id: "dubbel",
    name: "Dubbel",
    description: "Профиль для темных бельгийских элей с умеренной щелочностью.",
    profile: profile(70, 10, 25, 75, 75, 150),
    kind: "target",
    badge: "belgian",
    tags: ["dubbel", "belgian", "dark", "бельгийский"]
  },
  {
    id: "stout",
    name: "Stout",
    description: "Более щелочной профиль для темной засыпи.",
    profile: profile(90, 10, 35, 80, 60, 180),
    kind: "target",
    badge: "dark",
    tags: ["stout", "porter", "dark", "roasted", "темный"]
  },
  {
    id: "light_malty",
    name: "Light & Malty",
    description: "Больше хлоридов для мягкого солодового акцента.",
    profile: profile(60, 5, 10, 95, 55, 0),
    kind: "target",
    badge: "malty",
    tags: ["malty", "light", "chloride", "солодовый"]
  },
  {
    id: "light_hoppy",
    name: "Light & Hoppy",
    description: "Больше сульфатов для сухого хмелевого акцента.",
    profile: profile(75, 5, 10, 50, 150, 0),
    kind: "target",
    badge: "hoppy",
    tags: ["hoppy", "light", "sulfate", "хмелевой"]
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
