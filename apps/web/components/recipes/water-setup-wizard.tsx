"use client";

import { ChevronRight, Save, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import React from "react";
import { Button, Dialog, DialogCloseButton, DialogHeader } from "@nb/ui";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { NumericInput } from "@/components/shared/numeric-input";
import { parseDecimalInput } from "@/features/forms/numeric-validation";

const useIsWaterWizardMobile = () => {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(media.matches);
    sync();

    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return isMobile;
};


import {
  recipeMashPhModelLabels,
  recipeMashPhModels,
  type RecipeWaterManualSaltAdditionTarget,
  type RecipeWaterPlanMeta,
} from "@/features/recipes/contracts";
import type { EquipmentVolumeLimits } from "@/features/equipment-profiles/volume-plan";
import {
  isRecipeWaterMashPhEnabled,
  recipeWaterAcidPresentation,
  recipeWaterSaltPresentation,
  type RecipeWaterPlanResult,
} from "@/features/recipes/water-plan";
import {
  builtInSourceWaterProfiles,
  findBuiltInSourceWaterProfile,
  type RecipeWaterProfilePreset,
} from "@/features/recipes/water-profiles";
import {
  getAlternativeTargetProfilesForBjcpStyle,
  getWaterTargetProfileBySlug,
  getWaterTargetQuickPickProfiles,
  getWaterTargetStyleDefault,
  resolveWaterTargetBjcpStyleKey,
  searchWaterTargetProfiles,
  type WaterTargetProfileCatalogItem,
} from "@/features/recipes/water-target-profiles";

type WaterProfileMeta = NonNullable<RecipeWaterPlanMeta["sourceProfile"]>;
type WaterVolumeMode = "single" | "split";
export type SavedSourceWaterProfile = {
  id: string;
  name: string;
  profile: WaterProfileMeta;
  createdAt: string;
  updatedAt: string;
};
export type SavedTargetWaterProfile = SavedSourceWaterProfile;

const savedSourceWaterProfilesStorageKey =
  "nb:recipe-water:source-profiles";
const savedTargetWaterProfilesStorageKey =
  "nb:recipe-water:target-profiles";

const emptyProfile: WaterProfileMeta = {
  ca: 0,
  mg: 0,
  na: 0,
  cl: 0,
  so4: 0,
  hco3: 0,
  ph: null,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const coerceSavedProfileNumber = (value: unknown, fallback = 0) => {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : fallback;

  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
};

const coerceSavedProfilePh = (value: unknown) => {
  if (value == null || value === "") {
    return null;
  }

  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 14
    ? numeric
    : null;
};

const normalizeProfileInput = (value: unknown): WaterProfileMeta | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    ca: coerceSavedProfileNumber(value.ca),
    mg: coerceSavedProfileNumber(value.mg),
    na: coerceSavedProfileNumber(value.na),
    cl: coerceSavedProfileNumber(value.cl),
    so4: coerceSavedProfileNumber(value.so4),
    hco3: coerceSavedProfileNumber(value.hco3),
    ph: coerceSavedProfilePh(value.ph),
  };
};

const normalizeSavedSourceWaterProfile = (
  value: unknown,
): SavedSourceWaterProfile | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const profile = normalizeProfileInput(value.profile);

  if (!id || !name || !profile) {
    return null;
  }

  return {
    id: id.slice(0, 120),
    name: name.slice(0, 120),
    profile,
    createdAt:
      typeof value.createdAt === "string" && value.createdAt.trim()
        ? value.createdAt
        : new Date(0).toISOString(),
    updatedAt:
      typeof value.updatedAt === "string" && value.updatedAt.trim()
        ? value.updatedAt
        : new Date(0).toISOString(),
  };
};

export const sanitizeSavedSourceWaterProfiles = (
  value: unknown,
): SavedSourceWaterProfile[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const profiles: SavedSourceWaterProfile[] = [];

  for (const item of value) {
    const profile = normalizeSavedSourceWaterProfile(item);
    if (!profile || seen.has(profile.id)) {
      continue;
    }

    seen.add(profile.id);
    profiles.push(profile);
  }

  return profiles.slice(0, 30);
};

const readStoredSavedSourceWaterProfiles = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(savedSourceWaterProfilesStorageKey);
    return raw ? sanitizeSavedSourceWaterProfiles(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
};

const readStoredSavedTargetWaterProfiles = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(savedTargetWaterProfilesStorageKey);
    return raw ? sanitizeSavedSourceWaterProfiles(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
};

const persistSavedSourceWaterProfiles = (
  profiles: SavedSourceWaterProfile[],
) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      savedSourceWaterProfilesStorageKey,
      JSON.stringify(profiles),
    );
  } catch {
    // Saved profiles are a convenience layer; editing the recipe still works.
  }
};

const persistSavedTargetWaterProfiles = (
  profiles: SavedTargetWaterProfile[],
) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      savedTargetWaterProfilesStorageKey,
      JSON.stringify(profiles),
    );
  } catch {
    // Saved profiles are a convenience layer; editing the recipe still works.
  }
};

// Ф11 (notes/water-wizard-fixes.md): «сохранённые профили воды — в аккаунт».
// localStorage остаётся офлайн-фолбэком (см. read/persist* выше); сервер —
// источник истины при доступности. Флаг ниже защищает от повторной заливки
// localStorage-профилей в аккаунт при каждом монтировании визарда.
const savedWaterProfilesMigratedStorageKey = "nb:recipe-water:migrated";
const waterProfilesApiPath = "/api/recipes/water-profiles";

type ServerSavedWaterProfiles = {
  savedSourceProfiles: SavedSourceWaterProfile[];
  savedTargetProfiles: SavedTargetWaterProfile[];
};

const fetchServerSavedWaterProfiles =
  async (): Promise<ServerSavedWaterProfiles | null> => {
    try {
      const response = await fetch(waterProfilesApiPath, { method: "GET" });
      if (!response.ok) {
        return null;
      }

      const data: unknown = await response.json();
      const record =
        data && typeof data === "object" ? (data as Record<string, unknown>) : {};

      return {
        savedSourceProfiles: sanitizeSavedSourceWaterProfiles(
          record.savedSourceProfiles,
        ),
        savedTargetProfiles: sanitizeSavedSourceWaterProfiles(
          record.savedTargetProfiles,
        ),
      };
    } catch {
      // API недоступен (офлайн, 500 и т.п.) — вызывающий код остаётся на
      // localStorage-фолбэке.
      return null;
    }
  };

// Возвращает успех записи: вызывающий код мигрирующего эффекта должен знать,
// удалось ли донести localStorage-профили до сервера, прежде чем выставлять
// флаг «мигрировано» — иначе неудачная миграция помечается успешной и больше
// никогда не повторяется, а следующий маунт затем затирает localStorage
// пустым ответом сервера (см. эффект ниже).
const putServerSavedWaterProfiles = async (
  savedSourceProfiles: SavedSourceWaterProfile[],
  savedTargetProfiles: SavedTargetWaterProfile[],
): Promise<boolean> => {
  try {
    const response = await fetch(waterProfilesApiPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ savedSourceProfiles, savedTargetProfiles }),
    });
    return response.ok;
  } catch {
    // Saved profiles are a convenience layer; editing the recipe still works
    // off the localStorage fallback if the server write fails.
    return false;
  }
};

export const getNextSavedSourceWaterProfileName = (
  profiles: SavedSourceWaterProfile[],
) => `Сохраненный профиль ${profiles.length + 1}`;

export const getNextSavedTargetWaterProfileName = (
  profiles: SavedTargetWaterProfile[],
) => `Целевой профиль ${profiles.length + 1}`;

const createSavedSourceWaterProfileId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `water-profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const brewfatherDefaultAutoSalts = [
  "gypsum",
  "calcium_chloride",
  "epsom_salt",
];

const waterAdditionTargetLabels: Record<
  RecipeWaterManualSaltAdditionTarget,
  string
> = {
  all: "Весь объём",
  mash: "Затор",
  sparge: "Промывка",
};

const waterWarningLabels: Record<string, string> = {
  water_split_below_batch_volume:
    "Сумма заторной и промывочной воды меньше объёма партии.",
  mash_water_volume_zero:
    "Заторная вода 0 л — задайте объём затора или добавьте засыпь.",
  source_profile_missing_or_zero:
    "Выберите исходную воду или введите профиль вручную.",
  target_profile_missing_or_zero: "Выберите целевой профиль воды.",
  grain_bill_missing_for_mash_ph: "Для расчёта pH нужна засыпь.",
  target_not_reached_within_max_acid:
    "Целевой pH не достигнут в лимите кислоты.",
  calcium_above_practical_range: "Ca выше практического диапазона.",
  magnesium_above_practical_range: "Mg выше практического диапазона.",
  sodium_above_practical_range: "Na выше практического диапазона.",
  chloride_above_practical_range: "Cl выше практического диапазона.",
  sulfate_above_practical_range: "SO4 выше практического диапазона.",
  bicarbonate_above_practical_range: "HCO3 выше практического диапазона.",
  lactic_acid_taste_threshold:
    "Молочной кислоты столько, что лактат будет заметен во вкусе (порог ~400 ppm). Используйте фосфорную кислоту или разбавьте воду осмосом.",
  sparge_acid_capped_at_max_ml: "Доза кислоты в промывку упёрлась в лимит.",
  salt_addition_capped:
    "Подбор солей упёрся в лимит на одну соль — профиль достигнут не полностью.",
};

const formatKg = (value: number) => `${value.toFixed(1).replace(".", ",")} кг`;
const formatL = (value: number) => `${value.toFixed(1).replace(".", ",")} л`;

/**
 * Предупреждения оборудования называют конкретные числа: без них «засыпь не влезает»
 * не подсказывает, что делать. Лимиты — не догма (у одних в корзину влезает больше,
 * чем обещает производитель), поэтому текст зовёт поправить профиль, а не запрещает.
 */
const buildEquipmentWarningLabel = (
  warning: string,
  limits: EquipmentVolumeLimits | null,
): string | null => {
  if (!limits) {
    return null;
  }

  switch (warning) {
    case "grain_bill_limit_exceeded":
      return limits.maxGrainKg != null
        ? `Засыпь ${formatKg(limits.grainKg)} — больше лимита профиля (${formatKg(limits.maxGrainKg)}). Поднимите лимит в профиле оборудования, если у вас влезает больше.`
        : null;
    case "mash_volume_limit_exceeded":
      return limits.maxMashVolumeL != null
        ? `Воды в заторе больше, чем вмещает заторник (${formatL(limits.maxMashVolumeL)}). Часть уйдёт в промывку.`
        : null;
    case "mash_below_min_volume":
      return limits.minMashVolumeL != null
        ? `Воды в заторе меньше минимума профиля (${formatL(limits.minMashVolumeL)}): на пивоварнях с ТЭНом в стенке он может оголиться.`
        : null;
    case "kettle_volume_limit_exceeded":
      return limits.maxKettleVolumeL != null
        ? `Объём до кипячения не помещается в котёл (${formatL(limits.maxKettleVolumeL)}). Уменьшите объём партии.`
        : null;
    default:
      return null;
  }
};

/**
 * Предупреждения, зависящие от расчёта плана воды (а не от лимитов оборудования) —
 * подсказка про дилюцию осмосом (Ф8/Ф9), два кода на два разных триггера: называют
 * конкретный процент, а не абстрактное «разбавьте воду».
 */
const buildWaterPlanResultWarningLabel = (
  warning: string,
  waterPlanResult: RecipeWaterPlanResult,
): string | null => {
  switch (warning) {
    case "dilution_suggested_target":
      return waterPlanResult.dilutionSuggestedPct != null
        ? `Цель по HCO3 недостижима солями — разбавьте воду осмосом примерно на ${waterPlanResult.dilutionSuggestedPct}%.`
        : null;
    case "dilution_suggested_acid":
      return waterPlanResult.dilutionSuggestedPct != null
        ? `Кислоты нужно слишком много — разбавьте воду осмосом примерно на ${waterPlanResult.dilutionSuggestedPct}% или перейдите на фосфорную.`
        : null;
    default:
      return null;
  }
};

const lowPriorityWarnings = new Set([
  "mash_ph_ballpark_estimate",
  "mash_acid_model_practical_approximation",
  "target_already_reached",
]);
const blockingWaterWarnings = new Set([
  "source_profile_missing_or_zero",
  "target_profile_missing_or_zero",
]);

const ionKeys = ["ca", "mg", "na", "cl", "so4", "hco3"] as const;
const ionLabels: Record<(typeof ionKeys)[number], string> = {
  ca: "Ca",
  mg: "Mg",
  na: "Na",
  cl: "Cl",
  so4: "SO4",
  hco3: "HCO3",
};

const defaultSourcePreset = () =>
  findBuiltInSourceWaterProfile("ro_distilled") ??
  builtInSourceWaterProfiles[0];
const selectableSourceWaterProfiles: RecipeWaterProfilePreset[] = [
  "ro_distilled",
  "distilled_water",
].flatMap((id) => {
  const preset = findBuiltInSourceWaterProfile(id);
  return preset ? [preset] : [];
});

// Обёртка над parseDecimalInput (запятая → точка на лету, не только на blur):
// NumericInput разрешает набирать запятую посимвольно, а голый Number("5,5")
// даёт NaN до нормализации на blur — без этого NaN на мгновение улетал бы в
// waterPlanMeta при наборе дробной части.
const toOptionalNumber = (value: string): number | null => {
  const parsed = parseDecimalInput(value);
  return parsed != null && Number.isFinite(parsed) ? parsed : null;
};

const cloneProfile = (profile: WaterProfileMeta): WaterProfileMeta => ({
  ca: profile.ca,
  mg: profile.mg,
  na: profile.na,
  cl: profile.cl,
  so4: profile.so4,
  hco3: profile.hco3,
  ph: profile.ph ?? null,
});

const formatProfile = (profile: WaterProfileMeta) =>
  `Ca ${profile.ca.toFixed(0)} / Mg ${profile.mg.toFixed(0)} / Na ${profile.na.toFixed(0)} / Cl ${profile.cl.toFixed(0)} / SO4 ${profile.so4.toFixed(0)} / HCO3 ${profile.hco3.toFixed(0)}`;

const formatProfileSearchText = (preset: RecipeWaterProfilePreset) =>
  [
    preset.name,
    preset.description,
    preset.badge,
    ...(preset.tags ?? []),
    formatProfile(preset.profile),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export const filterRecipeWaterProfiles = (
  profiles: RecipeWaterProfilePreset[],
  query: string,
) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return profiles;
  }

  return profiles.filter((preset) =>
    formatProfileSearchText(preset).includes(normalized),
  );
};

export const createRecipeWaterPlanResetMeta = (): RecipeWaterPlanMeta => ({
  setupEnabled: false,
  engine: "balanced_default",
  phModel: "hybrid_mash_ph_v1",
  sourceProfileMode: "preset",
  sourceProfilePresetId: null,
  sourceProfileSavedId: null,
  sourceProfileName: null,
  sourceProfile: null,
  targetProfileMode: "catalog",
  targetProfilePresetId: null,
  targetProfileSlug: null,
  targetProfileSavedId: null,
  targetProfileName: null,
  targetProfileSource: null,
  targetProfileIsOverridden: false,
  targetProfileResolvedFromBjcpStyleKey: null,
  targetProfile: null,
  showWaterAdditivesInIngredients: false,
  blendRatio: null,
  mashWaterVolumeL: null,
  spargeWaterVolumeL: null,
  totalWaterVolumeL: null,
  grainAbsorptionLPerKg: null,
  allowedSalts: [],
  allowedAcids: [],
  manualSaltAdditions: [],
  targetMashPh: null,
  spargeAcidificationEnabled: false,
  spargeSourcePh: null,
  targetSpargePh: 5.7,
  selectedAcid: "lactic_acid",
  acidConcentrationPct: null,
  calibrationOffset: null,
});

export const ensureRecipeWaterPlanConfigured = (
  waterPlanMeta: RecipeWaterPlanMeta,
): RecipeWaterPlanMeta => {
  const sourcePreset =
    findBuiltInSourceWaterProfile(
      waterPlanMeta.sourceProfilePresetId ?? "ro_distilled",
    ) ?? defaultSourcePreset();
  const hasSourceProfile = Boolean(waterPlanMeta.sourceProfile);
  const targetProfileSlug =
    waterPlanMeta.targetProfileSlug ?? waterPlanMeta.targetProfilePresetId;
  const targetProfileMode =
    waterPlanMeta.targetProfileMode === "style" ||
    waterPlanMeta.targetProfileMode === "balanced" ||
    waterPlanMeta.targetProfileMode === "malty" ||
    waterPlanMeta.targetProfileMode === "hoppy"
      ? "catalog"
      : waterPlanMeta.targetProfileMode;

  return {
    ...waterPlanMeta,
    setupEnabled: true,
    sourceProfileMode: hasSourceProfile
      ? waterPlanMeta.sourceProfileMode
      : sourcePreset.id === "distilled_water"
        ? "distilled"
        : "ro_distilled",
    sourceProfilePresetId: hasSourceProfile
      ? waterPlanMeta.sourceProfilePresetId
      : sourcePreset.id,
    sourceProfileSavedId: hasSourceProfile
      ? waterPlanMeta.sourceProfileSavedId
      : null,
    sourceProfileName: hasSourceProfile ? waterPlanMeta.sourceProfileName : null,
    sourceProfile: hasSourceProfile
      ? waterPlanMeta.sourceProfile
      : cloneProfile(sourcePreset.profile),
    targetProfileMode,
    targetProfileSlug,
    targetProfilePresetId: targetProfileSlug,
    targetProfileSavedId:
      targetProfileMode === "saved" ? waterPlanMeta.targetProfileSavedId : null,
    targetProfileName: waterPlanMeta.targetProfileName ?? null,
    targetProfileSource: waterPlanMeta.targetProfileSource ?? null,
    targetProfileIsOverridden: waterPlanMeta.targetProfileIsOverridden ?? false,
    targetProfileResolvedFromBjcpStyleKey:
      waterPlanMeta.targetProfileResolvedFromBjcpStyleKey ?? null,
  };
};

export const applyRecipeWaterSourcePreset = (
  waterPlanMeta: RecipeWaterPlanMeta,
  preset: RecipeWaterProfilePreset,
): RecipeWaterPlanMeta => ({
  ...waterPlanMeta,
  setupEnabled: true,
  sourceProfileMode:
    preset.id === "ro_distilled"
      ? "ro_distilled"
      : preset.id === "distilled_water"
        ? "distilled"
        : "preset",
  sourceProfilePresetId: preset.id,
  sourceProfileSavedId: null,
  sourceProfileName: preset.name,
  sourceProfile: cloneProfile(preset.profile),
});

export const applyRecipeWaterSavedSourceProfile = (
  waterPlanMeta: RecipeWaterPlanMeta,
  savedProfile: SavedSourceWaterProfile,
): RecipeWaterPlanMeta => ({
  ...waterPlanMeta,
  setupEnabled: true,
  sourceProfileMode: "saved",
  sourceProfilePresetId: null,
  sourceProfileSavedId: savedProfile.id,
  sourceProfileName: savedProfile.name,
  sourceProfile: cloneProfile(savedProfile.profile),
});

export const setRecipeWaterManualSourceProfile = (
  waterPlanMeta: RecipeWaterPlanMeta,
  profile: WaterProfileMeta,
): RecipeWaterPlanMeta => ({
  ...waterPlanMeta,
  setupEnabled: true,
  sourceProfileMode: "manual",
  sourceProfilePresetId: null,
  sourceProfileSavedId: null,
  sourceProfileName: null,
  sourceProfile: cloneProfile(profile),
});

/**
 * Ф8 UI: доля осмоса (0..90%) → бинарный blendRatio {tap, ro, distilled: 0} —
 * дистиллят как отдельная доля здесь не вводится, только через ручной blendRatio.
 * pct <= 0 или не задан — трактуем как чистую водопроводную воду (blendRatio: null),
 * см. resolveWaterBlendShares в water-plan.ts.
 */
export const setRecipeWaterSourceDilutionPct = (
  waterPlanMeta: RecipeWaterPlanMeta,
  pct: number | null,
): RecipeWaterPlanMeta => ({
  ...waterPlanMeta,
  setupEnabled: true,
  blendRatio:
    pct != null && pct > 0
      ? { tap: 1 - pct / 100, ro: pct / 100, distilled: 0 }
      : null,
});

const resolveWaterSourceDilutionPct = (
  blendRatio: RecipeWaterPlanMeta["blendRatio"],
): number => (blendRatio ? Math.round(Math.max(0, blendRatio.ro ?? 0) * 100) : 0);

export const applyRecipeWaterTargetPreset = (
  waterPlanMeta: RecipeWaterPlanMeta,
  preset: RecipeWaterProfilePreset,
): RecipeWaterPlanMeta => ({
  ...waterPlanMeta,
  setupEnabled: true,
  targetProfileMode: "catalog",
  targetProfilePresetId: preset.id,
  targetProfileSlug: preset.id,
  targetProfileSavedId: null,
  targetProfileName: preset.name,
  targetProfileSource: "user_catalog",
  targetProfileIsOverridden: true,
  targetProfile: cloneProfile(preset.profile),
});

export const applyRecipeWaterCatalogTargetProfile = (
  waterPlanMeta: RecipeWaterPlanMeta,
  profile: WaterTargetProfileCatalogItem,
  source: NonNullable<RecipeWaterPlanMeta["targetProfileSource"]> = "user_catalog",
  resolvedFromBjcpStyleKey: string | null = null,
  overridden = source !== "auto_style",
): RecipeWaterPlanMeta => ({
  ...waterPlanMeta,
  setupEnabled: true,
  targetProfileMode: "catalog",
  targetProfilePresetId: profile.slug,
  targetProfileSlug: profile.slug,
  targetProfileSavedId: null,
  targetProfileName: profile.displayName,
  targetProfileSource: source,
  targetProfileIsOverridden: overridden,
  targetProfileResolvedFromBjcpStyleKey: resolvedFromBjcpStyleKey,
  targetProfile: cloneProfile(profile.profile),
});

export const applyRecipeWaterSavedTargetProfile = (
  waterPlanMeta: RecipeWaterPlanMeta,
  savedProfile: SavedTargetWaterProfile,
): RecipeWaterPlanMeta => ({
  ...waterPlanMeta,
  setupEnabled: true,
  targetProfileMode: "saved",
  targetProfilePresetId: null,
  targetProfileSlug: null,
  targetProfileSavedId: savedProfile.id,
  targetProfileName: savedProfile.name,
  targetProfileSource: "user_saved",
  targetProfileIsOverridden: true,
  targetProfile: cloneProfile(savedProfile.profile),
});

export const setRecipeWaterManualTargetProfile = (
  waterPlanMeta: RecipeWaterPlanMeta,
  profile: WaterProfileMeta,
): RecipeWaterPlanMeta => ({
  ...waterPlanMeta,
  setupEnabled: true,
  targetProfileMode: "manual",
  targetProfilePresetId: null,
  targetProfileSlug: null,
  targetProfileSavedId: null,
  targetProfileName: null,
  targetProfileSource: "manual",
  targetProfileIsOverridden: true,
  targetProfile: cloneProfile(profile),
});

export const setRecipeWaterVolumeMode = (
  waterPlanMeta: RecipeWaterPlanMeta,
  mode: WaterVolumeMode,
  totalWaterL: number,
  suggestedSplit?: {
    mashWaterL: number | null;
    spargeWaterL: number | null;
  },
): RecipeWaterPlanMeta => {
  if (mode === "single") {
    return {
      ...waterPlanMeta,
      setupEnabled: true,
      mashWaterVolumeL: null,
      spargeWaterVolumeL: null,
      totalWaterVolumeL: null,
      manualSaltAdditions: (waterPlanMeta.manualSaltAdditions ?? []).map(
        (addition) => ({
          ...addition,
          target: "all" as RecipeWaterManualSaltAdditionTarget,
        }),
      ),
      spargeAcidificationEnabled: false,
    };
  }

  const suggestedMashWaterL =
    suggestedSplit?.mashWaterL != null && suggestedSplit.mashWaterL >= 0
      ? suggestedSplit.mashWaterL
      : null;
  const suggestedSpargeWaterL =
    suggestedSplit?.spargeWaterL != null && suggestedSplit.spargeWaterL >= 0
      ? suggestedSplit.spargeWaterL
      : null;
  const hasSuggestedSplit =
    suggestedMashWaterL != null &&
    suggestedSpargeWaterL != null &&
    suggestedMashWaterL + suggestedSpargeWaterL > 0;
  const mashWaterL = Number(
    (hasSuggestedSplit
      ? (suggestedMashWaterL ?? 0)
      : Math.max(0, totalWaterL) * 0.65
    ).toFixed(1),
  );
  return {
    ...waterPlanMeta,
    setupEnabled: true,
    mashWaterVolumeL: mashWaterL,
    spargeWaterVolumeL: Number(
      (hasSuggestedSplit
        ? (suggestedSpargeWaterL ?? 0)
        : Math.max(0, totalWaterL - mashWaterL)
      ).toFixed(1),
    ),
    totalWaterVolumeL: null,
  };
};

const autoSaltEngineForTargetMashPh = (
  targetMashPh: RecipeWaterPlanMeta["targetMashPh"],
): RecipeWaterPlanMeta["engine"] =>
  targetMashPh == null ? "profile_only" : "balanced_default";

export const setRecipeWaterTargetMashPh = (
  waterPlanMeta: RecipeWaterPlanMeta,
  targetMashPh: number | null,
): RecipeWaterPlanMeta => ({
  ...waterPlanMeta,
  setupEnabled: true,
  targetMashPh,
  engine:
    waterPlanMeta.engine === "advanced_manual"
      ? "advanced_manual"
      : autoSaltEngineForTargetMashPh(targetMashPh),
});

type RecipeWaterManualSaltAddition =
  NonNullable<RecipeWaterPlanMeta["manualSaltAdditions"]>[number];

const snapshotRecipeWaterResultSaltAdditions = (
  waterPlanResult: RecipeWaterPlanResult,
): RecipeWaterManualSaltAddition[] =>
  (waterPlanResult.waterVolumes.source === "manual_split"
    ? [
        ...waterPlanResult.mashSaltAdditions.map((addition) => ({
          salt: addition.salt,
          grams: addition.grams,
          target: "mash" as RecipeWaterManualSaltAdditionTarget,
        })),
        ...waterPlanResult.spargeSaltAdditions.map((addition) => ({
          salt: addition.salt,
          grams: addition.grams,
          target: "sparge" as RecipeWaterManualSaltAdditionTarget,
        })),
      ]
    : waterPlanResult.totalSaltAdditions.map((addition) => ({
        salt: addition.salt,
        grams: addition.grams,
        target: addition.target,
      }))
  ).filter((addition) => Number.isFinite(addition.grams) && addition.grams > 0);

export const setRecipeWaterSaltCalculationMode = (
  waterPlanMeta: RecipeWaterPlanMeta,
  mode: "auto" | "manual",
  waterPlanResult?: RecipeWaterPlanResult,
): RecipeWaterPlanMeta => ({
  ...waterPlanMeta,
  setupEnabled: true,
  engine:
    mode === "manual"
      ? "advanced_manual"
      : autoSaltEngineForTargetMashPh(waterPlanMeta.targetMashPh),
  manualSaltAdditions:
    mode === "manual" && waterPlanResult
      ? snapshotRecipeWaterResultSaltAdditions(waterPlanResult)
      : waterPlanMeta.manualSaltAdditions ?? [],
});

export const isRecipeWaterAutoBakingSodaEnabled = (
  waterPlanMeta: RecipeWaterPlanMeta,
) => (waterPlanMeta.allowedSalts ?? []).includes("baking_soda");

export const setRecipeWaterAutoBakingSodaEnabled = (
  waterPlanMeta: RecipeWaterPlanMeta,
  enabled: boolean,
): RecipeWaterPlanMeta => ({
  ...waterPlanMeta,
  setupEnabled: true,
  allowedSalts: enabled
    ? [...brewfatherDefaultAutoSalts, "baking_soda"]
    : [],
});

export const removeRecipeWaterManualSaltAddition = (
  waterPlanMeta: RecipeWaterPlanMeta,
  index: number,
): RecipeWaterPlanMeta => ({
  ...waterPlanMeta,
  manualSaltAdditions: (waterPlanMeta.manualSaltAdditions ?? []).filter(
    (_, itemIndex) => itemIndex !== index,
  ),
});

type RecipeWaterCalculatedAdditionRow = {
  key: string;
  target: RecipeWaterManualSaltAdditionTarget;
  title: string;
  formula: string;
  amountText: string;
};

const formatWaterAdditionGrams = (grams: number) => {
  if (!Number.isFinite(grams) || grams <= 0) {
    return "0 г";
  }

  return `${grams.toFixed(grams >= 10 ? 1 : 2)} г`;
};

const formatWaterAdditionMl = (ml: number) => {
  if (!Number.isFinite(ml) || ml <= 0) {
    return "0 мл";
  }

  return `${ml.toFixed(ml >= 10 ? 1 : 2)} мл`;
};

const formatWaterAdditionPercent = (pct: number) => {
  if (!Number.isFinite(pct) || pct <= 0) {
    return "";
  }

  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
};

const buildCalculatedSaltRows = (
  waterPlanResult: RecipeWaterPlanResult,
): RecipeWaterCalculatedAdditionRow[] => {
  if (waterPlanResult.waterVolumes.source === "manual_split") {
    return [
      ...waterPlanResult.mashSaltAdditions.map((addition, index) => ({
        key: `mash-${addition.salt}-${index}`,
        target: "mash" as const,
        title: addition.label,
        formula: addition.formula,
        amountText: formatWaterAdditionGrams(addition.grams),
      })),
      ...waterPlanResult.spargeSaltAdditions.map((addition, index) => ({
        key: `sparge-${addition.salt}-${index}`,
        target: "sparge" as const,
        title: addition.label,
        formula: addition.formula,
        amountText: formatWaterAdditionGrams(addition.grams),
      })),
    ].filter((row) => !row.amountText.startsWith("0 "));
  }

  return waterPlanResult.totalSaltAdditions
    .map((addition, index) => ({
      key: `all-${addition.salt}-${index}`,
      target: "all" as const,
      title:
        recipeWaterSaltPresentation[addition.salt]?.label ??
        addition.label ??
        addition.salt,
      formula:
        recipeWaterSaltPresentation[addition.salt]?.formula ??
        addition.formula ??
        "",
      amountText: formatWaterAdditionGrams(addition.grams),
    }))
    .filter((row) => !row.amountText.startsWith("0 "));
};

const buildCalculatedAcidRows = (
  waterPlanResult: RecipeWaterPlanResult,
): RecipeWaterCalculatedAdditionRow[] => {
  const rows: RecipeWaterCalculatedAdditionRow[] = [];
  const mashAcid = waterPlanResult.mashAcidAddition;
  const spargeAcid = waterPlanResult.spargeAcidAddition;

  if (mashAcid && mashAcid.mashAcidMl > 0) {
    rows.push({
      key: "mash-acid",
      target: "mash",
      title: mashAcid.label,
      formula: formatWaterAdditionPercent(mashAcid.concentrationPct),
      amountText: formatWaterAdditionMl(mashAcid.mashAcidMl),
    });
  }

  if (spargeAcid && spargeAcid.spargeAcidMl > 0) {
    rows.push({
      key: "sparge-acid",
      target: "sparge",
      title: spargeAcid.label,
      formula: formatWaterAdditionPercent(spargeAcid.concentrationPct),
      amountText: formatWaterAdditionMl(spargeAcid.spargeAcidMl),
    });
  }

  return rows;
};

const getSelectedPresetName = (
  presetId: string | null | undefined,
  profiles: RecipeWaterProfilePreset[],
  fallback: string,
) => profiles.find((preset) => preset.id === presetId)?.name ?? fallback;

function TargetCatalogPickerSheet({
  isMobile,
  onClose,
  children,
}: {
  isMobile: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!isMobile) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-card p-3">
        {children}
      </div>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      title="Выбор целевого профиля воды"
      hideTitle
      size="sheet"
    >
      <DialogHeader>
        <h3 className="text-base font-semibold text-foreground">Целевой профиль</h3>
        <DialogCloseButton />
      </DialogHeader>
      <div className="space-y-3 px-4 pb-6 pt-3">
        {children}
      </div>
    </Dialog>
  );
}

const buildWaterSetupSummary = ({
  waterPlanMeta,
  effectiveWaterPlanMeta,
  waterPlanResult,
  sourceName,
  targetName,
  isSplitVolume,
  mashPhEnabled,
}: {
  waterPlanMeta: RecipeWaterPlanMeta;
  effectiveWaterPlanMeta: RecipeWaterPlanMeta;
  waterPlanResult: RecipeWaterPlanResult;
  sourceName: string;
  targetName: string | null;
  isSplitVolume: boolean;
  mashPhEnabled: boolean;
}): string => {
  if (!waterPlanMeta.setupEnabled) {
    return "источник, цель, объёмы и pH";
  }

  const hasTarget = Boolean(effectiveWaterPlanMeta.targetProfile);
  const arrow = hasTarget ? `${sourceName} \u2192 ${targetName ?? "цель не выбрана"}` : sourceName;
  const volumes = isSplitVolume
    ? `${waterPlanResult.waterVolumes.mashWaterL.toFixed(1)} \u002B ${waterPlanResult.waterVolumes.spargeWaterL.toFixed(1)} \u043b`
    : `${waterPlanResult.waterVolumes.totalWaterL.toFixed(1)} \u043b`;
  const ph = mashPhEnabled
    ? `pH ${(waterPlanMeta.targetMashPh ?? 5.35).toFixed(2)}`
    : "без pH";

  return `${arrow} \u00b7 ${volumes} \u00b7 ${ph}`;
};

export const resolveRecipeWaterTargetModeSelection = ({
  hasActiveWaterSetup,
  hasTargetProfile,
  targetCatalogPickerOpen,
  targetProfileMode,
}: {
  hasActiveWaterSetup: boolean;
  hasTargetProfile: boolean;
  targetCatalogPickerOpen: boolean;
  targetProfileMode: RecipeWaterPlanMeta["targetProfileMode"];
}) => ({
  saved:
    !targetCatalogPickerOpen &&
    hasActiveWaterSetup &&
    targetProfileMode === "saved",
  catalog:
    targetCatalogPickerOpen ||
    (!targetCatalogPickerOpen &&
      hasActiveWaterSetup &&
      targetProfileMode === "catalog" &&
      hasTargetProfile),
  manual:
    !targetCatalogPickerOpen &&
    hasActiveWaterSetup &&
    targetProfileMode === "manual",
});

function SourceWaterProfileOption({
  preset,
  selected,
  onSelect,
}: {
  preset: RecipeWaterProfilePreset;
  selected: boolean;
  onSelect: (preset: RecipeWaterProfilePreset) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(preset)}
      className={`flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${selected ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:border-border hover:bg-muted"}`}
    >
      <span className="truncate">{preset.name}</span>
      {preset.badge ? (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${selected ? "bg-background/15 text-background" : "bg-muted text-muted-foreground"}`}>
          {preset.badge}
        </span>
      ) : null}
    </button>
  );
}

function WaterProfileOption({
  preset,
  selected,
  onSelect,
}: {
  preset: RecipeWaterProfilePreset;
  selected: boolean;
  onSelect: (preset: RecipeWaterProfilePreset) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(preset)}
      className={`rounded-lg border px-3 py-2 text-left transition-colors ${selected ? "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200" : "border-border bg-card text-foreground hover:border-border hover:bg-muted"}`}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {preset.name}
        </span>
        {preset.badge ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {preset.badge}
          </span>
        ) : null}
        {preset.isHistoricalExample ? (
          <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-[11px] font-medium text-warning-subtle-foreground">
            пример
          </span>
        ) : null}
      </span>
      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
        {preset.description}
      </span>
      <span className="mt-1 block text-[11px] text-muted-foreground">
        {formatProfile(preset.profile)} ppm
      </span>
    </button>
  );
}

function WaterProfileSelector({
  title,
  selectedName,
  selectedProfile,
  selectedPresetId,
  searchPlaceholder,
  query,
  onQueryChange,
  profiles,
  onSelect,
}: {
  title: string;
  selectedName: string;
  selectedProfile: WaterProfileMeta | null | undefined;
  selectedPresetId: string | null | undefined;
  searchPlaceholder: string;
  query: string;
  onQueryChange: (query: string) => void;
  profiles: RecipeWaterProfilePreset[];
  onSelect: (preset: RecipeWaterProfilePreset) => void;
}) {
  const visibleProfiles = filterRecipeWaterProfiles(profiles, query);

  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">
            {title}
          </div>
          <div className="truncate text-sm font-semibold text-foreground">
            {selectedName}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {selectedProfile
              ? `${formatProfile(selectedProfile)} ppm`
              : "Профиль не выбран"}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>

        <div className="grid gap-2">
          {visibleProfiles.map((preset) => (
            <WaterProfileOption
              key={preset.id}
              preset={preset}
              selected={selectedPresetId === preset.id}
              onSelect={onSelect}
            />
          ))}
        </div>
        {!visibleProfiles.length ? (
          <div className="rounded-lg border border-dashed border-border bg-muted px-3 py-3 text-sm text-muted-foreground">
            Ничего не найдено
          </div>
        ) : null}
      </div>
    </details>
  );
}

function SourceSavedWaterProfileOption({
  profiles,
  selectedId,
  selected,
  showProfileSummary = true,
  savedLabel = "Сохраненный",
  onSelect,
  onDelete,
}: {
  profiles: SavedSourceWaterProfile[];
  selectedId: string | null | undefined;
  selected: boolean;
  showProfileSummary?: boolean;
  savedLabel?: string;
  onSelect: (profile: SavedSourceWaterProfile) => void;
  onDelete: (profileId: string) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedId) ?? profiles[0];
  const isSingleProfile = profiles.length === 1;

  React.useEffect(() => {
    if (profiles.length <= 1) {
      setIsOpen(false);
    }
  }, [profiles.length]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (rootRef.current?.contains(event.target)) {
        return;
      }

      setIsOpen(false);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (rootRef.current?.contains(event.target)) {
        return;
      }

      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!profiles.length) {
    return null;
  }

  if (isSingleProfile) {
    const profile = profiles[0];
    const isCurrent = profile.id === selectedId;

    return (
      <div
        ref={rootRef}
        className={`grid h-10 min-w-0 grid-cols-[minmax(0,1fr)_2.5rem] items-center overflow-hidden rounded-lg border ${selected && isCurrent ? "border-foreground bg-foreground" : "border-border bg-card"}`}
      >
        <button
          type="button"
          aria-pressed={selected && isCurrent}
          onClick={() => onSelect(profile)}
          className={`flex h-full min-w-0 items-center gap-2 px-3 text-left text-sm font-medium transition-colors ${selected && isCurrent ? "text-background" : "text-foreground hover:bg-muted hover:text-foreground"}`}
        >
          <span className="min-w-0 flex-1 truncate">{profile.name}</span>
          {showProfileSummary ? (
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${selected && isCurrent ? "bg-background/10 text-background/70" : "bg-muted text-muted-foreground"}`}>
              {savedLabel}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(profile.id);
          }}
          className={`inline-flex h-full w-10 items-center justify-center border-l transition-colors ${selected && isCurrent ? "border-background/10 text-background/70 hover:bg-background/10 hover:text-background" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          aria-label={`Удалить профиль ${profile.name}`}
          title="Удалить"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((open) => !open)}
        className={`flex h-10 w-full cursor-pointer list-none items-center justify-between gap-2 rounded-lg border px-3 text-sm font-medium transition-colors [&::-webkit-details-marker]:hidden ${selected ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:border-border hover:bg-muted"}`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="block min-w-0 flex-1 truncate">
            {selectedProfile?.name ?? "Сохраненный профиль"}
          </span>
          {showProfileSummary ? (
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${selected ? "bg-background/10 text-background/70" : "bg-muted text-muted-foreground"}`}>
              {savedLabel}
            </span>
          ) : null}
        </span>
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""} ${selected ? "text-background/70" : "text-muted-foreground"}`}
        />
      </button>
      {isOpen ? (
        <div
          role="menu"
          className="absolute left-0 top-11 z-20 w-full min-w-60 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          {profiles.map((profile) => {
            const isCurrent = profile.id === selectedId;

            return (
              <div
                key={profile.id}
                className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-center border-b border-border last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(profile);
                    setIsOpen(false);
                  }}
                  className={`min-w-0 px-3 py-2.5 text-left text-sm transition-colors ${isCurrent ? "bg-muted font-semibold text-foreground" : "text-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="block min-w-0 flex-1 truncate">{profile.name}</span>
                    {showProfileSummary ? (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                        {savedLabel}
                      </span>
                    ) : null}
                  </span>
                  {showProfileSummary ? (
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-muted-foreground">
                      {formatProfile(profile.profile)} ppm
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(profile.id);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={`Удалить профиль ${profile.name}`}
                  title="Удалить"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function TargetModeButton({
  label,
  selected,
  disabled = false,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-10 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted"}`}
    >
      {label}
    </button>
  );
}

function TargetCatalogProfileRow({
  profile,
  selected,
  badgeLabel = null,
  onSelect,
}: {
  profile: WaterTargetProfileCatalogItem;
  selected: boolean;
  badgeLabel?: string | null;
  onSelect: (profile: WaterTargetProfileCatalogItem) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(profile)}
      className={`grid gap-1 rounded-lg border px-3 py-2 text-left transition-colors ${selected ? "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200" : "border-border bg-card text-foreground hover:border-border hover:bg-muted"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {profile.displayName}
        </span>
        {badgeLabel ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${selected ? "bg-white/80 text-sky-700 ring-1 ring-sky-200 dark:bg-background/60 dark:text-sky-300 dark:ring-sky-500/30" : "bg-success-subtle text-success-subtle-foreground ring-1 ring-success/30"}`}>
            {badgeLabel}
          </span>
        ) : null}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">
        {profile.badge} · {formatProfile(profile.profile)} ppm
      </span>
    </button>
  );
}

function TargetCatalogSelectionCard({
  label,
  title,
  profile,
  onChangeClick,
}: {
  label: string;
  title: string;
  profile: WaterProfileMeta;
  onChangeClick: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted px-3 py-3">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <button
          type="button"
          onClick={onChangeClick}
          className="inline-flex shrink-0 items-center text-sm font-medium text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
        >
          Изменить
        </button>
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground sm:text-base">
          {title}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {formatProfile(profile)} ppm
        </div>
      </div>
    </div>
  );
}

function ProfileIonEditor({
  profile,
  targetProfile = null,
  onChange,
  compact = false,
  withPh = false,
}: {
  profile: WaterProfileMeta;
  targetProfile?: WaterProfileMeta | null;
  onChange: (profile: WaterProfileMeta) => void;
  compact?: boolean;
  /** Поле pH источника — честный Ct для кислоты затора и дефолт для «Исходный pH»
   *  промывки вместо жёсткого дефолта 7 (см. Ф-пункт 4, notes/water-wizard-fixes.md). */
  withPh?: boolean;
}) {
  const columnsClassName = withPh ? "md:grid-cols-7" : "md:grid-cols-6";

  return (
    <div className={compact ? `grid grid-cols-2 gap-2 sm:grid-cols-3 ${columnsClassName}` : `grid grid-cols-2 gap-2 rounded-xl bg-muted p-3 sm:grid-cols-3 ${columnsClassName}`}>
      {ionKeys.map((key) => {
        const value = profile[key];
        const target = targetProfile?.[key];
        const showDelta =
          targetProfile != null
          && typeof target === "number"
          && Math.abs(target - value) >= 1;
        const direction = showDelta ? (target! > value ? "up" : "down") : null;
        const deltaText = showDelta ? `${direction === "up" ? "+" : "\u2212"}${Math.round(Math.abs(target! - value))}` : null;

        return (
          <label
            key={key}
            className="text-[11px] font-medium uppercase text-muted-foreground"
          >
            <span className="flex items-center justify-between">
              <span>{ionLabels[key]}</span>
              {deltaText ? (
                <span
                  className={`text-[10px] tabular-nums normal-case ${direction === "up" ? "text-sky-600 dark:text-sky-400" : "text-amber-600 dark:text-amber-400"}`}
                  aria-label={`До цели: ${deltaText}`}
                >
                  {deltaText}
                </span>
              ) : null}
            </span>
            <NumericInput
              min={0}
              value={String(value)}
              onChange={(event) =>
                onChange({
                  ...profile,
                  [key]: toOptionalNumber(event.target.value) ?? 0,
                })
              }
              className={`${compact ? "h-11" : "h-11"} mt-1 w-full rounded-lg border border-border bg-card px-2 text-base text-foreground`}
            />
          </label>
        );
      })}
      {withPh ? (
        <label className="text-[11px] font-medium uppercase text-muted-foreground">
          <span>pH</span>
          <NumericInput
            min={4}
            max={10}
            step={0.01}
            value={profile.ph != null ? String(profile.ph) : ""}
            onChange={(event) =>
              onChange({
                ...profile,
                ph: toOptionalNumber(event.target.value),
              })
            }
            className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-2 text-base text-foreground"
          />
        </label>
      ) : null}
    </div>
  );
}

function MashPhCorrectionCard({
  value,
  onChange,
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
}) {
  const enabled = value != null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onChange(event.target.checked ? 5.35 : null)}
          className="h-4 w-4 rounded border-border"
        />
        Корректировать pH затора
      </label>
      {enabled ? (
        <label className="mt-3 block text-xs font-medium text-muted-foreground">
          Целевой pH затора
          <NumericInput
            min={4}
            max={7}
            step={0.01}
            value={value != null ? String(value) : "5.35"}
            onChange={(event) =>
              onChange(toOptionalNumber(event.target.value) ?? 5.35)
            }
            className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-2 text-base text-foreground"
          />
        </label>
      ) : null}
    </div>
  );
}

function SpargeAcidificationCard({
  enabled,
  sourcePh,
  targetPh,
  onEnabledChange,
  onSourcePhChange,
  onTargetPhChange,
}: {
  enabled: boolean;
  sourcePh: number;
  targetPh: number;
  onEnabledChange: (enabled: boolean) => void;
  onSourcePhChange: (value: number | null) => void;
  onTargetPhChange: (value: number) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        Подкислить промывочную воду
      </label>
      {enabled ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-muted-foreground">
            Исходный pH
            <NumericInput
              min={0}
              max={14}
              step={0.01}
              value={String(sourcePh)}
              onChange={(event) => onSourcePhChange(toOptionalNumber(event.target.value))}
              className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-2 text-base text-foreground"
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Целевой pH промывки
            <NumericInput
              min={4}
              max={7}
              step={0.01}
              value={String(targetPh)}
              onChange={(event) =>
                onTargetPhChange(toOptionalNumber(event.target.value) ?? 5.7)
              }
              className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-2 text-base text-foreground"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

export function WaterSetupWizard({
  waterPlanMeta,
  waterPlanResult,
  calculatedWaterPlanResult,
  styleId = null,
  onChange,
  isOpen: controlledIsOpen,
  onIsOpenChange,
  variant = "card",
}: {
  waterPlanMeta: RecipeWaterPlanMeta;
  waterPlanResult: RecipeWaterPlanResult;
  calculatedWaterPlanResult?: RecipeWaterPlanResult;
  styleId?: string | null;
  onChange: (next: RecipeWaterPlanMeta) => void;
  isOpen?: boolean;
  onIsOpenChange?: (open: boolean) => void;
  /**
   * `card` — standalone block (legacy). `embedded` — render inside another section,
   * without the outer card chrome (border/padding/header/reset).
   */
  variant?: "card" | "embedded";
}) {
  const [internalIsOpen, setInternalIsOpen] = React.useState(false);
  const isControlledOpen = controlledIsOpen != null;
  const isOpen = isControlledOpen ? controlledIsOpen : internalIsOpen;
  const setIsOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlledOpen) {
        setInternalIsOpen(next);
      }
      onIsOpenChange?.(next);
    },
    [isControlledOpen, onIsOpenChange],
  );
  const [targetQuery, setTargetQuery] = React.useState("");
  const [savedSourceProfiles, setSavedSourceProfiles] = React.useState<
    SavedSourceWaterProfile[]
  >([]);
  const [savedTargetProfiles, setSavedTargetProfiles] = React.useState<
    SavedTargetWaterProfile[]
  >([]);
  const [manualProfileName, setManualProfileName] = React.useState(
    getNextSavedSourceWaterProfileName([]),
  );
  const [manualProfileNameTouched, setManualProfileNameTouched] =
    React.useState(false);
  const [manualProfileSaveOpen, setManualProfileSaveOpen] =
    React.useState(false);
  const [sourceProfileSaveMessage, setSourceProfileSaveMessage] =
    React.useState<string | null>(null);
  const [targetProfileName, setTargetProfileName] = React.useState(
    getNextSavedTargetWaterProfileName([]),
  );
  const [targetProfileNameTouched, setTargetProfileNameTouched] =
    React.useState(false);
  const [targetProfileSaveOpen, setTargetProfileSaveOpen] =
    React.useState(false);
  const [targetProfileSaveMessage, setTargetProfileSaveMessage] =
    React.useState<string | null>(null);
  const [targetCatalogPickerOpen, setTargetCatalogPickerOpen] =
    React.useState(false);
  const [showAllTargetProfiles, setShowAllTargetProfiles] =
    React.useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = React.useState(false);
  const isMobile = useIsWaterWizardMobile();
  const effectiveWaterPlanMeta = React.useMemo(
    () =>
      waterPlanMeta.setupEnabled
        ? waterPlanMeta
        : ensureRecipeWaterPlanConfigured(waterPlanMeta),
    [waterPlanMeta],
  );
  const proposalWaterPlanResult = calculatedWaterPlanResult ?? waterPlanResult;
  const source = effectiveWaterPlanMeta.sourceProfile ?? emptyProfile;
  const target = effectiveWaterPlanMeta.targetProfile ?? emptyProfile;
  const hasActiveWaterSetup = waterPlanMeta.setupEnabled;
  const selectedAcid = effectiveWaterPlanMeta.selectedAcid ?? "lactic_acid";
  const mashPhEnabled = isRecipeWaterMashPhEnabled(effectiveWaterPlanMeta);
  const spargeAcidificationEnabled =
    Boolean(effectiveWaterPlanMeta.spargeAcidificationEnabled) &&
    waterPlanResult.waterVolumes.spargeWaterL > 0;
  const acidCalculationEnabled = mashPhEnabled || spargeAcidificationEnabled;
  const saltCalculationMode =
    effectiveWaterPlanMeta.engine === "advanced_manual" ? "manual" : "auto";
  const hasAdvancedSettings =
    saltCalculationMode === "auto" || mashPhEnabled || acidCalculationEnabled;
  const isSplitVolume = waterPlanResult.waterVolumes.source === "manual_split";
  const grainAbsorptionLPerKg =
    waterPlanResult.waterVolumes.grainAbsorptionLPerKg ?? 0.8;
  const grainAbsorptionLossL =
    waterPlanResult.waterVolumes.grainAbsorptionLossL ?? null;
  const visibleWarnings = waterPlanResult.warnings
    .filter(
      (warning) =>
        !lowPriorityWarnings.has(warning) &&
        !(
          warning === "target_profile_missing_or_zero" &&
          waterPlanResult.engine === "advanced_manual"
        ),
    )
    .slice(0, 3);
  const hasBlockingWarning = visibleWarnings.some(
    (warning) =>
      warning === "source_profile_missing_or_zero" ||
      (warning === "target_profile_missing_or_zero" &&
        waterPlanResult.engine !== "advanced_manual"),
  );
  const secondaryVisibleWarnings = visibleWarnings.filter(
    (warning) => !blockingWaterWarnings.has(warning),
  );
  const selectedSavedSourceProfile = savedSourceProfiles.find(
    (profile) => profile.id === effectiveWaterPlanMeta.sourceProfileSavedId,
  );
  const selectedSavedTargetProfile = savedTargetProfiles.find(
    (profile) => profile.id === effectiveWaterPlanMeta.targetProfileSavedId,
  );
  const targetStyleKey = resolveWaterTargetBjcpStyleKey(styleId);
  const targetStyleDefault = getWaterTargetStyleDefault(targetStyleKey);
  const selectedCatalogTarget = getWaterTargetProfileBySlug(
    effectiveWaterPlanMeta.targetProfileSlug ??
      effectiveWaterPlanMeta.targetProfilePresetId,
  );
  const targetQueryTrimmed = targetQuery.trim();
  const targetQuickPicks = React.useMemo(
    () => getWaterTargetQuickPickProfiles(6),
    [],
  );
  const targetStyleAlternatives = React.useMemo(
    () => getAlternativeTargetProfilesForBjcpStyle(targetStyleKey).slice(0, 3),
    [targetStyleKey],
  );
  const targetFeaturedSlugs = React.useMemo(() => {
    const slugs = targetStyleDefault?.defaultProfile
      ? [
          targetStyleDefault.defaultProfile.slug,
          ...targetStyleAlternatives.map((profile) => profile.slug),
        ]
      : targetQuickPicks.map((profile) => profile.slug);

    return Array.from(new Set(slugs));
  }, [targetQuickPicks, targetStyleAlternatives, targetStyleDefault]);
  const targetVisibleCatalogResults = React.useMemo(
    () => {
      if (targetQueryTrimmed) {
        return searchWaterTargetProfiles(targetQueryTrimmed, {
          limit: showAllTargetProfiles ? undefined : 12,
        });
      }

      return showAllTargetProfiles
        ? searchWaterTargetProfiles("", { excludeSlugs: targetFeaturedSlugs })
        : [];
    },
    [showAllTargetProfiles, targetFeaturedSlugs, targetQueryTrimmed],
  );
  const targetCatalogTotalResults = React.useMemo(
    () =>
      targetQueryTrimmed
        ? searchWaterTargetProfiles(targetQueryTrimmed).length
        : searchWaterTargetProfiles("", {
            excludeSlugs: targetFeaturedSlugs,
          }).length,
    [targetFeaturedSlugs, targetQueryTrimmed],
  );
  const targetSuggestedEntries = React.useMemo(() => {
    if (targetQueryTrimmed) {
      return [] as Array<{
        profile: WaterTargetProfileCatalogItem;
        badgeLabel: string | null;
      }>;
    }

    if (targetStyleDefault?.defaultProfile) {
      return [
        {
          profile: targetStyleDefault.defaultProfile,
          badgeLabel: "Подходит по стилю",
        },
        ...targetStyleAlternatives.map((profile) => ({
          profile,
          badgeLabel: "Подходит по стилю",
        })),
      ];
    }

    return targetQuickPicks.map((profile) => ({
      profile,
      badgeLabel: "Быстрый выбор",
    }));
  }, [
    targetQueryTrimmed,
    targetQuickPicks,
    targetStyleAlternatives,
    targetStyleDefault,
  ]);
  const canShowMoreTargetProfiles =
    targetCatalogTotalResults > targetVisibleCatalogResults.length;
  const showTargetStyleChangedNotice =
    hasActiveWaterSetup &&
    Boolean(targetStyleDefault?.defaultProfile) &&
    Boolean(effectiveWaterPlanMeta.targetProfile) &&
    Boolean(effectiveWaterPlanMeta.targetProfileResolvedFromBjcpStyleKey) &&
    effectiveWaterPlanMeta.targetProfileResolvedFromBjcpStyleKey !==
      targetStyleKey;
  const sourceName =
    !hasActiveWaterSetup
      ? "Исходная вода"
      : effectiveWaterPlanMeta.sourceProfileMode === "manual"
      ? "Ручной профиль"
      : effectiveWaterPlanMeta.sourceProfileMode === "saved"
        ? effectiveWaterPlanMeta.sourceProfileName ??
          selectedSavedSourceProfile?.name ??
          "Сохраненный профиль"
      : getSelectedPresetName(
          effectiveWaterPlanMeta.sourceProfilePresetId,
          builtInSourceWaterProfiles,
          "Профиль из рецепта",
        );
  const targetName =
    !hasActiveWaterSetup
      ? "Целевой профиль"
      : effectiveWaterPlanMeta.targetProfileMode === "manual"
      ? "Ручной целевой профиль"
      : effectiveWaterPlanMeta.targetProfileMode === "saved"
        ? effectiveWaterPlanMeta.targetProfileName ??
          selectedSavedTargetProfile?.name ??
          "Сохраненный профиль"
        : effectiveWaterPlanMeta.targetProfileName ??
          selectedCatalogTarget?.displayName ??
          (effectiveWaterPlanMeta.targetProfile ? "Профиль из рецепта" : null) ??
          "Целевой профиль";
  const targetSelectionLabel =
    effectiveWaterPlanMeta.targetProfileSource === "auto_style"
      ? "Подходит по стилю"
      : "Выбрано из каталога";
  const showTargetCatalogPicker = targetCatalogPickerOpen;
  const targetModeSelection = resolveRecipeWaterTargetModeSelection({
    hasActiveWaterSetup,
    hasTargetProfile: Boolean(effectiveWaterPlanMeta.targetProfile),
    targetCatalogPickerOpen: showTargetCatalogPicker,
    targetProfileMode: effectiveWaterPlanMeta.targetProfileMode,
  });
  const calculatedAdditionRows = React.useMemo(
    () => [
      ...buildCalculatedSaltRows(proposalWaterPlanResult),
      ...buildCalculatedAcidRows(proposalWaterPlanResult),
    ],
    [proposalWaterPlanResult],
  );
  const calculatedAdditionGroups = React.useMemo(
    () =>
      (["all", "mash", "sparge"] as const)
        .map((targetKey) => ({
          key: targetKey,
          label: waterAdditionTargetLabels[targetKey],
          rows: calculatedAdditionRows.filter((row) => row.target === targetKey),
        }))
        .filter((group) => group.rows.length > 0),
    [calculatedAdditionRows],
  );
  const hasCalculatedAdditions = calculatedAdditionRows.length > 0;
  const hasAppliedWaterPlan = waterPlanMeta.engine === "advanced_manual";

  // Ф9 (notes/water-wizard-fixes.md): «pH затора» / RA / SO4:Cl из расчёта — раньше
  // predictedMashPhAfterAcid20C был виден только на публичной странице рецепта.
  const proposalMashPhEstimateValue =
    proposalWaterPlanResult.mashPhEstimate?.predictedMashPh20C ?? null;
  const proposalMashAcidMl = proposalWaterPlanResult.mashAcidAddition?.mashAcidMl ?? 0;
  const mashPhTileText =
    proposalMashPhEstimateValue == null
      ? null
      : proposalMashAcidMl > 0 &&
          proposalWaterPlanResult.predictedMashPhAfterAcid20C != null
        ? `${proposalMashPhEstimateValue.toFixed(2)} → ${proposalWaterPlanResult.predictedMashPhAfterAcid20C.toFixed(2)}`
        : (
            proposalWaterPlanResult.predictedMashPhAfterAcid20C ??
            proposalMashPhEstimateValue
          ).toFixed(2);
  const sulfateChlorideRatioValue = proposalWaterPlanResult.sulfateChlorideRatio;
  const sulfateChlorideCharacter =
    sulfateChlorideRatioValue == null
      ? null
      : sulfateChlorideRatioValue < 0.8
        ? "солодовый"
        : sulfateChlorideRatioValue <= 1.5
          ? "баланс"
          : "хмелевой";
  const sulfateChlorideTileText =
    sulfateChlorideRatioValue != null && sulfateChlorideCharacter != null
      ? `${sulfateChlorideRatioValue.toFixed(2)} · ${sulfateChlorideCharacter}`
      : "—";

  React.useEffect(() => {
    let cancelled = false;
    const localSourceProfiles = readStoredSavedSourceWaterProfiles();
    const localTargetProfiles = readStoredSavedTargetWaterProfiles();
    setSavedSourceProfiles(localSourceProfiles);
    setSavedTargetProfiles(localTargetProfiles);

    void (async () => {
      const server = await fetchServerSavedWaterProfiles();
      if (cancelled || !server) {
        return;
      }

      const hasServerProfiles =
        server.savedSourceProfiles.length > 0 ||
        server.savedTargetProfiles.length > 0;
      const hasLocalProfiles =
        localSourceProfiles.length > 0 || localTargetProfiles.length > 0;
      const alreadyMigrated =
        typeof window !== "undefined" &&
        window.localStorage.getItem(savedWaterProfilesMigratedStorageKey) ===
          "1";

      if (!hasServerProfiles && hasLocalProfiles && !alreadyMigrated) {
        // Одноразовая миграция: локальные профили ещё не были в аккаунте.
        // Флаг ставим только при успешной записи — иначе при следующем
        // маунте так и не мигрированные данные примут за «уже в аккаунте»,
        // и localStorage перезатрётся пустым ответом сервера ниже.
        const migrated = await putServerSavedWaterProfiles(
          localSourceProfiles,
          localTargetProfiles,
        );
        if (migrated && typeof window !== "undefined") {
          window.localStorage.setItem(
            savedWaterProfilesMigratedStorageKey,
            "1",
          );
        }
        return;
      }

      if (cancelled) {
        return;
      }

      setSavedSourceProfiles(server.savedSourceProfiles);
      setSavedTargetProfiles(server.savedTargetProfiles);
      persistSavedSourceWaterProfiles(server.savedSourceProfiles);
      persistSavedTargetWaterProfiles(server.savedTargetProfiles);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!manualProfileNameTouched) {
      setManualProfileName(
        getNextSavedSourceWaterProfileName(savedSourceProfiles),
      );
    }
  }, [manualProfileNameTouched, savedSourceProfiles]);

  React.useEffect(() => {
    if (!targetProfileNameTouched) {
      setTargetProfileName(
        getNextSavedTargetWaterProfileName(savedTargetProfiles),
      );
    }
  }, [savedTargetProfiles, targetProfileNameTouched]);

  const updateSplitVolume = (
    key: "mashWaterVolumeL" | "spargeWaterVolumeL",
    value: string,
  ) => {
    onChange({
      ...effectiveWaterPlanMeta,
      setupEnabled: true,
      totalWaterVolumeL: null,
      [key]: toOptionalNumber(value),
    });
  };

  const updateGrainAbsorption = (value: string) => {
    onChange({
      ...effectiveWaterPlanMeta,
      setupEnabled: true,
      grainAbsorptionLPerKg: toOptionalNumber(value),
    });
  };

  const updateSavedSourceProfiles = (
    profiles: SavedSourceWaterProfile[],
  ) => {
    setSavedSourceProfiles(profiles);
    persistSavedSourceWaterProfiles(profiles);
    void putServerSavedWaterProfiles(profiles, savedTargetProfiles);
  };

  const updateSavedTargetProfiles = (
    profiles: SavedTargetWaterProfile[],
  ) => {
    setSavedTargetProfiles(profiles);
    persistSavedTargetWaterProfiles(profiles);
    void putServerSavedWaterProfiles(savedSourceProfiles, profiles);
  };

  const handleSaveManualSourceProfile = () => {
    const fallbackName =
      getNextSavedSourceWaterProfileName(savedSourceProfiles);
    const name = (manualProfileName.trim() || fallbackName).slice(0, 120);
    const now = new Date().toISOString();
    const savedProfile: SavedSourceWaterProfile = {
      id: createSavedSourceWaterProfileId(),
      name,
      profile: cloneProfile(source),
      createdAt: now,
      updatedAt: now,
    };
    const nextProfiles = [savedProfile, ...savedSourceProfiles].slice(0, 30);

    updateSavedSourceProfiles(nextProfiles);
    setManualProfileNameTouched(false);
    setManualProfileSaveOpen(false);
    setSourceProfileSaveMessage(`${name} сохранен`);
    onChange(
      applyRecipeWaterSavedSourceProfile(effectiveWaterPlanMeta, savedProfile),
    );
  };

  const handleDeleteSavedSourceProfile = (profileId: string) => {
    const nextProfiles = savedSourceProfiles.filter(
      (profile) => profile.id !== profileId,
    );
    updateSavedSourceProfiles(nextProfiles);

    if (effectiveWaterPlanMeta.sourceProfileSavedId === profileId) {
      onChange(applyRecipeWaterSourcePreset(
        effectiveWaterPlanMeta,
        defaultSourcePreset(),
      ));
    }
  };

  const handleSaveManualTargetProfile = () => {
    const fallbackName =
      getNextSavedTargetWaterProfileName(savedTargetProfiles);
    const name = (targetProfileName.trim() || fallbackName).slice(0, 120);
    const now = new Date().toISOString();
    const savedProfile: SavedTargetWaterProfile = {
      id: createSavedSourceWaterProfileId(),
      name,
      profile: cloneProfile(target),
      createdAt: now,
      updatedAt: now,
    };
    const nextProfiles = [savedProfile, ...savedTargetProfiles].slice(0, 30);

    updateSavedTargetProfiles(nextProfiles);
    setTargetProfileNameTouched(false);
    setTargetProfileSaveOpen(false);
    setTargetProfileSaveMessage(`${name} сохранен`);
    onChange(
      applyRecipeWaterSavedTargetProfile(effectiveWaterPlanMeta, savedProfile),
    );
  };

  const handleDeleteSavedTargetProfile = (profileId: string) => {
    const nextProfiles = savedTargetProfiles.filter(
      (profile) => profile.id !== profileId,
    );
    updateSavedTargetProfiles(nextProfiles);

    if (effectiveWaterPlanMeta.targetProfileSavedId === profileId) {
      onChange({
        ...effectiveWaterPlanMeta,
        targetProfileMode: "catalog",
        targetProfileSavedId: null,
        targetProfileSource: null,
        targetProfileName: null,
        targetProfile: null,
      });
    }
  };

  const isEmbedded = variant === "embedded";
  const wrapperClassName = isEmbedded
    ? ""
    : "rounded-2xl border border-border bg-card p-5 shadow-sm";
  const detailsWrapperClassName = isEmbedded
    ? "group rounded-xl border border-border bg-muted/40"
    : "group mt-4 rounded-xl border border-border bg-muted/40";

  return (
    <section className={wrapperClassName}>
      {isEmbedded ? null : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-50 text-xs font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
              H2O
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">Вода</h2>
              </div>
            </div>
          </div>
          {waterPlanMeta.setupEnabled ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setResetConfirmOpen(true)}
            >
              Сбросить воду
            </Button>
          ) : null}
        </div>
      )}

      <ConfirmActionDialog
        open={resetConfirmOpen}
        title="Сбросить настройку воды?"
        description="Сбросятся источник, цель, объёмы и pH. Действие нельзя отменить."
        confirmLabel="Сбросить"
        cancelLabel="Отмена"
        onConfirm={() => {
          onChange(createRecipeWaterPlanResetMeta());
          setResetConfirmOpen(false);
        }}
        onClose={() => setResetConfirmOpen(false)}
      />

      {waterPlanMeta.setupEnabled && secondaryVisibleWarnings.length ? (
        <div className={`grid gap-2 ${isEmbedded ? "mb-3" : "mt-3"}`}>
          {secondaryVisibleWarnings.map((warning) => (
            <div
              key={warning}
              className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground"
            >
              {waterWarningLabels[warning]
                ?? buildEquipmentWarningLabel(warning, waterPlanResult.equipmentLimits)
                ?? buildWaterPlanResultWarningLabel(warning, waterPlanResult)
                ?? warning}
            </div>
          ))}
        </div>
      ) : null}

      <details
        open={isOpen}
        onToggle={(event) => {
          const nextOpen = event.currentTarget.open;
          setIsOpen(nextOpen);
          if (!nextOpen) {
            setTargetCatalogPickerOpen(false);
            setShowAllTargetProfiles(false);
          }
        }}
        className={detailsWrapperClassName}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-sm font-semibold text-foreground">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block">Настройка воды</span>
            <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
              {buildWaterSetupSummary({
                waterPlanMeta,
                effectiveWaterPlanMeta,
                waterPlanResult,
                sourceName,
                targetName,
                isSplitVolume,
                mashPhEnabled,
              })}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>

        <div className="space-y-4 border-t border-border bg-card p-4">
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              1. Исходная вода
            </h3>
            <span className="truncate text-xs text-muted-foreground">{sourceName}</span>
          </div>
          <div className={`grid gap-2 ${savedSourceProfiles.length ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
            <SourceSavedWaterProfileOption
              profiles={savedSourceProfiles}
              selectedId={effectiveWaterPlanMeta.sourceProfileSavedId}
              selected={
                hasActiveWaterSetup &&
                effectiveWaterPlanMeta.sourceProfileMode === "saved"
              }
              onSelect={(profile) => {
                setSourceProfileSaveMessage(null);
                setManualProfileSaveOpen(false);
                onChange(
                  applyRecipeWaterSavedSourceProfile(
                    effectiveWaterPlanMeta,
                    profile,
                  ),
                );
              }}
              onDelete={handleDeleteSavedSourceProfile}
              showProfileSummary
              savedLabel="Сохраненный"
            />
            {selectableSourceWaterProfiles.map((preset) => (
              <SourceWaterProfileOption
                key={preset.id}
                preset={preset}
                selected={
                  hasActiveWaterSetup &&
                  effectiveWaterPlanMeta.sourceProfilePresetId === preset.id
                }
                onSelect={(selectedPreset) => {
                  setSourceProfileSaveMessage(null);
                  setManualProfileSaveOpen(false);
                  onChange(
                    applyRecipeWaterSourcePreset(
                      effectiveWaterPlanMeta,
                      selectedPreset,
                    ),
                  );
                }}
              />
            ))}
            <button
              type="button"
              onClick={() => {
                setSourceProfileSaveMessage(null);
                onChange(
                  setRecipeWaterManualSourceProfile(
                    effectiveWaterPlanMeta,
                    source,
                  ),
                );
              }}
              className={`flex h-10 items-center justify-center rounded-lg border px-3 text-sm font-medium ${hasActiveWaterSetup && effectiveWaterPlanMeta.sourceProfileMode === "manual" ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted"}`}
            >
              Ввести вручную
            </button>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground">
            Разбавление осмосом
            <span className="relative">
              <NumericInput
                integer
                min={0}
                max={90}
                step={5}
                value={String(
                  resolveWaterSourceDilutionPct(effectiveWaterPlanMeta.blendRatio),
                )}
                onChange={(event) => {
                  const pct = toOptionalNumber(event.target.value);
                  onChange(
                    setRecipeWaterSourceDilutionPct(
                      effectiveWaterPlanMeta,
                      pct != null ? Math.min(90, Math.max(0, pct)) : null,
                    ),
                  );
                }}
                className="h-9 w-20 rounded-lg border border-border bg-muted px-2 pr-6 text-right text-base text-foreground"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                %
              </span>
            </span>
          </label>

          <div className="space-y-2 rounded-xl bg-muted p-3">
            <ProfileIonEditor
              profile={source}
              targetProfile={effectiveWaterPlanMeta.targetProfile ?? null}
              compact
              withPh
              onChange={(profile) => {
                setSourceProfileSaveMessage(null);
                onChange(
                  setRecipeWaterManualSourceProfile(
                    effectiveWaterPlanMeta,
                    profile,
                  ),
                );
              }}
            />
            {effectiveWaterPlanMeta.sourceProfileMode === "manual" ? (
              <div className="flex flex-wrap items-center gap-2">
                {manualProfileSaveOpen ? (
                  <>
                    <input
                      type="text"
                      aria-label="Название профиля"
                      value={manualProfileName}
                      onChange={(event) => {
                        setManualProfileNameTouched(true);
                        setManualProfileName(event.target.value);
                      }}
                      maxLength={120}
                      className="h-8 w-52 rounded-lg border border-border bg-card px-2 text-sm text-foreground"
                      placeholder={getNextSavedSourceWaterProfileName(savedSourceProfiles)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveManualSourceProfile}
                    >
                      ОК
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setManualProfileSaveOpen(false)}
                    >
                      Отмена
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSourceProfileSaveMessage(null);
                      setManualProfileSaveOpen(true);
                    }}
                  >
                    <Save className="h-3.5 w-3.5" />
                    Сохранить исходный профиль
                  </Button>
                )}
                {sourceProfileSaveMessage ? (
                  <span className="text-xs text-success">
                    {sourceProfileSaveMessage}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            2. Целевой профиль
          </h3>

          <div className={`grid gap-2 ${savedTargetProfiles.length ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {savedTargetProfiles.length ? (
              <SourceSavedWaterProfileOption
                profiles={savedTargetProfiles}
                selectedId={effectiveWaterPlanMeta.targetProfileSavedId}
                selected={targetModeSelection.saved}
                showProfileSummary
                savedLabel="Сохраненный"
                onSelect={(profile) => {
                  setTargetProfileSaveMessage(null);
                  setTargetCatalogPickerOpen(false);
                  setShowAllTargetProfiles(false);
                  onChange(
                    applyRecipeWaterSavedTargetProfile(
                      effectiveWaterPlanMeta,
                      profile,
                    ),
                  );
                }}
                onDelete={handleDeleteSavedTargetProfile}
              />
            ) : null}
            <TargetModeButton
              label="Из каталога"
              selected={targetModeSelection.catalog}
              onClick={() => {
                setTargetProfileSaveMessage(null);
                setTargetCatalogPickerOpen(true);
              }}
            />
            <TargetModeButton
              label="Ионы вручную"
              selected={targetModeSelection.manual}
              onClick={() => {
                setTargetProfileSaveMessage(null);
                setTargetCatalogPickerOpen(false);
                onChange(
                  setRecipeWaterManualTargetProfile(
                    effectiveWaterPlanMeta,
                    target,
                  ),
                );
              }}
            />
          </div>

          {hasActiveWaterSetup &&
          effectiveWaterPlanMeta.targetProfileMode === "catalog" &&
          !showTargetCatalogPicker &&
          effectiveWaterPlanMeta.targetProfile ? (
            <TargetCatalogSelectionCard
              label={targetSelectionLabel}
              title={
                selectedCatalogTarget?.displayName ??
                effectiveWaterPlanMeta.targetProfileName ??
                "Выбранный профиль"
              }
              profile={target}
              onChangeClick={() => {
                setShowAllTargetProfiles(false);
                setTargetCatalogPickerOpen(true);
              }}
            />
          ) : null}

          {showTargetCatalogPicker ? (
            <TargetCatalogPickerSheet
              isMobile={isMobile}
              onClose={() => {
                setTargetCatalogPickerOpen(false);
                setShowAllTargetProfiles(false);
              }}
            >
              <label className="flex h-12 items-center gap-2 rounded-lg border border-border bg-muted px-3 text-base text-muted-foreground">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="search"
                  value={targetQuery}
                  onChange={(event) => {
                    setTargetQuery(event.target.value);
                    setShowAllTargetProfiles(false);
                  }}
                  placeholder="IPA, lager, blanche, стаут..."
                  aria-label="IPA, lager, blanche, стаут..."
                  className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
                />
              </label>

              <div className={`grid gap-2 ${isMobile ? "" : showAllTargetProfiles ? "max-h-96 overflow-y-auto pr-1" : ""}`}>
                {targetSuggestedEntries.map(({ profile, badgeLabel }) => (
                  <TargetCatalogProfileRow
                    key={`${profile.slug}:${badgeLabel ?? "default"}`}
                    profile={profile}
                    badgeLabel={badgeLabel}
                    selected={
                      hasActiveWaterSetup &&
                      effectiveWaterPlanMeta.targetProfileSlug === profile.slug
                    }
                    onSelect={(selectedProfile) => {
                      setTargetCatalogPickerOpen(false);
                      setShowAllTargetProfiles(false);
                      onChange(
                        applyRecipeWaterCatalogTargetProfile(
                          effectiveWaterPlanMeta,
                          selectedProfile,
                          "user_catalog",
                          targetStyleKey,
                        ),
                      );
                    }}
                  />
                ))}
                {targetVisibleCatalogResults.map((profile) => (
                  <TargetCatalogProfileRow
                    key={profile.slug}
                    profile={profile}
                    selected={
                      hasActiveWaterSetup &&
                      effectiveWaterPlanMeta.targetProfileSlug === profile.slug
                    }
                    onSelect={(selectedProfile) => {
                      setTargetCatalogPickerOpen(false);
                      setShowAllTargetProfiles(false);
                      onChange(
                        applyRecipeWaterCatalogTargetProfile(
                          effectiveWaterPlanMeta,
                          selectedProfile,
                          "user_catalog",
                          targetStyleKey,
                        ),
                      );
                    }}
                  />
                ))}
              </div>
              {canShowMoreTargetProfiles ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllTargetProfiles(true)}
                >
                  {targetQueryTrimmed
                    ? `Показать все результаты (${targetCatalogTotalResults})`
                    : `Показать все профили (${targetCatalogTotalResults})`}
                </Button>
              ) : null}
              {!targetSuggestedEntries.length && !targetVisibleCatalogResults.length ? (
                <div className="rounded-lg border border-dashed border-border bg-muted px-3 py-3 text-sm text-muted-foreground">
                  Ничего не найдено
                </div>
              ) : null}
            </TargetCatalogPickerSheet>
          ) : null}

          {showTargetStyleChangedNotice ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground">
              <span>Стиль изменился. Профиль воды остался прежним.</span>
              {targetStyleDefault?.defaultProfile ? (
                <button
                  type="button"
                  onClick={() => {
                    onChange(
                      applyRecipeWaterCatalogTargetProfile(
                        effectiveWaterPlanMeta,
                        targetStyleDefault.defaultProfile!,
                        "auto_style",
                        targetStyleKey,
                        false,
                      ),
                    );
                    setTargetCatalogPickerOpen(false);
                  }}
                  className="inline-flex h-8 shrink-0 items-center rounded-lg border border-warning/30 bg-card px-3 text-xs font-medium text-warning-subtle-foreground hover:bg-warning-subtle"
                >
                  Подобрать под новый стиль
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2 rounded-xl bg-muted p-3">
            <ProfileIonEditor
              profile={target}
              compact
              onChange={(profile) => {
                setTargetProfileSaveMessage(null);
                setTargetCatalogPickerOpen(false);
                setShowAllTargetProfiles(false);
                onChange(
                  setRecipeWaterManualTargetProfile(
                    effectiveWaterPlanMeta,
                    profile,
                  ),
                );
              }}
            />
            {effectiveWaterPlanMeta.targetProfileMode === "manual" ? (
              <div className="flex flex-wrap items-center gap-2">
                {targetProfileSaveOpen ? (
                  <>
                    <input
                      type="text"
                      aria-label="Название целевого профиля"
                      value={targetProfileName}
                      onChange={(event) => {
                        setTargetProfileNameTouched(true);
                        setTargetProfileName(event.target.value);
                      }}
                      maxLength={120}
                      className="h-8 w-52 rounded-lg border border-border bg-card px-2 text-sm text-foreground"
                      placeholder={getNextSavedTargetWaterProfileName(savedTargetProfiles)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveManualTargetProfile}
                    >
                      ОК
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setTargetProfileSaveOpen(false)}
                    >
                      Отмена
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTargetProfileSaveMessage(null);
                      setTargetProfileSaveOpen(true);
                    }}
                  >
                    <Save className="h-3.5 w-3.5" />
                    Сохранить целевой профиль
                  </Button>
                )}
                {targetProfileSaveMessage ? (
                  <span className="text-xs text-success">
                    {targetProfileSaveMessage}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        {waterPlanMeta.setupEnabled ? (
          <>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                3. Объём воды
              </h3>
              <label className="block text-xs font-medium text-muted-foreground">
                Водопоглощение дробиной, л/кг
                <NumericInput
                  min={0}
                  max={5}
                  step={0.05}
                  value={
                    effectiveWaterPlanMeta.grainAbsorptionLPerKg != null
                      ? String(effectiveWaterPlanMeta.grainAbsorptionLPerKg)
                      : ""
                  }
                  placeholder={grainAbsorptionLPerKg.toFixed(2)}
                  onChange={(event) =>
                    updateGrainAbsorption(event.target.value)
                  }
                  className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-2 text-base text-foreground"
                />
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  Сейчас: {grainAbsorptionLPerKg.toFixed(2)} л/кг
                  {grainAbsorptionLossL != null
                    ? ` · ${grainAbsorptionLossL.toFixed(1)} л`
                    : ""}
                </span>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      setRecipeWaterVolumeMode(
                        waterPlanMeta,
                        "single",
                        waterPlanResult.waterVolumes.totalWaterL,
                      ),
                    )
                  }
                  className={`rounded-xl border px-4 py-3 text-left text-sm ${!isSplitVolume ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted"}`}
                >
                  <span className="block font-semibold">
                    Считать одним объёмом
                  </span>
                  <span
                    className={`mt-1 block text-xs ${!isSplitVolume ? "text-background" : "text-muted-foreground"}`}
                  >
                    {waterPlanResult.waterVolumes.totalWaterL.toFixed(1)} л
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      setRecipeWaterVolumeMode(
                        waterPlanMeta,
                        "split",
                        waterPlanResult.waterVolumes.totalWaterL,
                        {
                          mashWaterL:
                            waterPlanResult.waterVolumes.suggestedMashWaterL,
                          spargeWaterL:
                            waterPlanResult.waterVolumes.suggestedSpargeWaterL,
                        },
                      ),
                    )
                  }
                  className={`rounded-xl border px-4 py-3 text-left text-sm ${isSplitVolume ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted"}`}
                >
                  <span className="block font-semibold">
                    Разделить на затор и промывку
                  </span>
                  <span
                    className={`mt-1 block text-xs ${isSplitVolume ? "text-background" : "text-muted-foreground"}`}
                  >
                    {[
                      waterPlanResult.waterVolumes.suggestedMashWaterL,
                      waterPlanResult.waterVolumes.suggestedSpargeWaterL,
                    ].every((value) => value != null)
                      ? `${waterPlanResult.waterVolumes.suggestedMashWaterL?.toFixed(1)} + ${waterPlanResult.waterVolumes.suggestedSpargeWaterL?.toFixed(1)} л`
                      : `${waterPlanResult.waterVolumes.totalWaterL.toFixed(1)} л`}
                  </span>
                </button>
              </div>

              {isSplitVolume ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Заторная вода, л
                    <NumericInput
                      min={0}
                      step={0.1}
                      value={
                        waterPlanMeta.mashWaterVolumeL != null
                          ? String(waterPlanMeta.mashWaterVolumeL)
                          : ""
                      }
                      onChange={(event) =>
                        updateSplitVolume(
                          "mashWaterVolumeL",
                          event.target.value,
                        )
                      }
                      className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-2 text-base text-foreground"
                    />
                  </label>
                  <label className="text-xs font-medium text-muted-foreground">
                    Промывочная вода, л
                    <NumericInput
                      min={0}
                      step={0.1}
                      value={
                        waterPlanMeta.spargeWaterVolumeL != null
                          ? String(waterPlanMeta.spargeWaterVolumeL)
                          : ""
                      }
                      onChange={(event) =>
                        updateSplitVolume(
                          "spargeWaterVolumeL",
                          event.target.value,
                        )
                      }
                      className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-2 text-base text-foreground"
                    />
                  </label>
                </div>
              ) : null}

            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                4. pH и подкисление
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                <MashPhCorrectionCard
                  value={mashPhEnabled ? waterPlanMeta.targetMashPh : null}
                  onChange={(value) =>
                    onChange(setRecipeWaterTargetMashPh(waterPlanMeta, value))
                  }
                />
                {isSplitVolume && waterPlanResult.waterVolumes.spargeWaterL > 0 ? (
                  <SpargeAcidificationCard
                    enabled={Boolean(waterPlanMeta.spargeAcidificationEnabled)}
                    sourcePh={waterPlanMeta.spargeSourcePh ?? source.ph ?? 7}
                    targetPh={waterPlanMeta.targetSpargePh ?? 5.7}
                    onEnabledChange={(enabled) =>
                      onChange({
                        ...waterPlanMeta,
                        setupEnabled: true,
                        spargeAcidificationEnabled: enabled,
                      })
                    }
                    onSourcePhChange={(value) =>
                      onChange({
                        ...waterPlanMeta,
                        setupEnabled: true,
                        spargeSourcePh: value,
                      })
                    }
                    onTargetPhChange={(value) =>
                      onChange({
                        ...waterPlanMeta,
                        setupEnabled: true,
                        targetSpargePh: value,
                      })
                    }
                  />
                ) : null}
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/40 p-3 dark:border-sky-500/30 dark:bg-sky-500/10">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">
                    Расчёт
                  </h3>
                </div>
                <Button
                  type="button"
                  size="md"
                  disabled={!hasCalculatedAdditions}
                  onClick={() =>
                    onChange(
                      setRecipeWaterSaltCalculationMode(
                        effectiveWaterPlanMeta,
                        "manual",
                        proposalWaterPlanResult,
                      ),
                    )
                  }
                >
                  {hasAppliedWaterPlan
                    ? "Заменить добавки"
                    : "Применить расчёт"}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {mashPhEnabled && mashPhTileText != null ? (
                  <div className="rounded-lg bg-card p-2 ring-1 ring-sky-100 dark:ring-sky-500/20">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      pH затора
                    </div>
                    <div className="mt-0.5 font-semibold tabular-nums text-foreground">
                      {mashPhTileText}
                    </div>
                  </div>
                ) : null}
                <div className="rounded-lg bg-card p-2 ring-1 ring-sky-100 dark:ring-sky-500/20">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    RA
                  </div>
                  <div className="mt-0.5 font-semibold tabular-nums text-foreground">
                    {Math.round(proposalWaterPlanResult.residualAlkalinityAsCaCO3)} ppm CaCO3
                  </div>
                </div>
                <div className="rounded-lg bg-card p-2 ring-1 ring-sky-100 dark:ring-sky-500/20">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    SO4:Cl
                  </div>
                  <div className="mt-0.5 font-semibold tabular-nums text-foreground">
                    {sulfateChlorideTileText}
                  </div>
                </div>
              </div>

              {hasCalculatedAdditions ? (
                <div className="grid gap-2">
                  {calculatedAdditionGroups.map((group) => (
                    <div key={group.key} className="rounded-lg bg-card p-2 ring-1 ring-sky-100 dark:ring-sky-500/20">
                      <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
                        {group.label}
                      </div>
                      <ul className="space-y-1">
                        {group.rows.map((row) => (
                          <li
                            key={row.key}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="min-w-0">
                              <span className="font-medium text-foreground">
                                {row.title}
                              </span>
                              {row.formula ? (
                                <span className="ml-1 text-muted-foreground">
                                  {row.formula}
                                </span>
                              ) : null}
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-foreground">
                              {row.amountText}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-sky-200 bg-card/70 px-3 py-3 text-sm text-muted-foreground dark:border-sky-500/30">
                  Нет рассчитанных добавок
                </div>
              )}
            </section>

            {hasAdvancedSettings ? (
            <details className="group rounded-xl border border-border bg-card p-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                Расширенные настройки
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {saltCalculationMode === "auto" ? (
                  <label className="flex min-h-10 items-center gap-2 self-end rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={isRecipeWaterAutoBakingSodaEnabled(
                        effectiveWaterPlanMeta,
                      )}
                      onChange={(event) =>
                        onChange(
                          setRecipeWaterAutoBakingSodaEnabled(
                            waterPlanMeta,
                            event.target.checked,
                          ),
                        )
                      }
                      className="h-4 w-4 rounded border-border"
                    />
                    Считать пищевую соду (NaHCO3) в авторасчёте
                  </label>
                ) : null}
                {mashPhEnabled ? (
                  <label className="text-xs font-medium text-muted-foreground">
                    Модель pH
                    <select
                      value={waterPlanMeta.phModel}
                      onChange={(event) =>
                        onChange({
                          ...waterPlanMeta,
                          setupEnabled: true,
                          phModel: event.target
                            .value as RecipeWaterPlanMeta["phModel"],
                        })
                      }
                      className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground"
                    >
                      {recipeMashPhModels.map((model) => (
                        <option key={model} value={model}>
                          {recipeMashPhModelLabels[model]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {acidCalculationEnabled ? (
                  <>
                    <label className="text-xs font-medium text-muted-foreground">
                      Кислота
                      <select
                        value={selectedAcid}
                        onChange={(event) =>
                          onChange({
                            ...waterPlanMeta,
                            setupEnabled: true,
                            selectedAcid: event.target
                              .value as RecipeWaterPlanMeta["selectedAcid"],
                          })
                        }
                        className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground"
                      >
                        {Object.entries(recipeWaterAcidPresentation).map(
                          ([value, acid]) => (
                            <option key={value} value={value}>
                              {acid.label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </>
                ) : null}
                {mashPhEnabled ? (
                  <label className="text-xs font-medium text-muted-foreground">
                    Калибровка pH
                    <NumericInput
                      min={-2}
                      max={2}
                      step={0.01}
                      value={
                        waterPlanMeta.calibrationOffset != null
                          ? String(waterPlanMeta.calibrationOffset)
                          : ""
                      }
                      onChange={(event) =>
                        onChange({
                          ...waterPlanMeta,
                          setupEnabled: true,
                          calibrationOffset: toOptionalNumber(
                            event.target.value,
                          ),
                        })
                      }
                      className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground"
                      placeholder="0.00"
                    />
                  </label>
                ) : null}
                {acidCalculationEnabled ? (
                  <>
                    <label className="text-xs font-medium text-muted-foreground">
                      Концентрация кислоты, %
                      <NumericInput
                        min={1}
                        max={100}
                        step={0.1}
                        value={
                          waterPlanMeta.acidConcentrationPct != null
                            ? String(waterPlanMeta.acidConcentrationPct)
                            : ""
                        }
                        onChange={(event) =>
                          onChange({
                            ...waterPlanMeta,
                            setupEnabled: true,
                            acidConcentrationPct: toOptionalNumber(
                              event.target.value,
                            ),
                          })
                        }
                        className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground"
                        placeholder={
                          selectedAcid === "lactic_acid" ? "88" : "85"
                        }
                      />
                    </label>
                  </>
                ) : null}
              </div>
            </details>
            ) : null}
          </>
        ) : null}
        </div>
      </details>
    </section>
  );
}
