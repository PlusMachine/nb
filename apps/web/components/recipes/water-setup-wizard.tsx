"use client";

import { ChevronRight, Save, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import React from "react";

import {
  recipeMashPhModelLabels,
  recipeMashPhModels,
  type RecipeWaterPlanMeta,
} from "@/features/recipes/contracts";
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
  getDefaultTargetProfileForBjcpStyle,
  getWaterTargetProfileBySlug,
  getWaterTargetQuickPickProfiles,
  getWaterTargetStyleDefault,
  resolveWaterTargetBjcpStyleKey,
  searchWaterTargetProfiles,
  type WaterTargetProfileCatalogItem,
} from "@/features/recipes/water-target-profiles";

import { WaterSummaryCard } from "./water-summary-card";

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

const saltCalculationModeLabels = {
  auto: "Авторасчет солей",
  manual: "Ручные добавки солей",
};

const waterWarningLabels: Record<string, string> = {
  water_split_sum_differs_from_batch_volume:
    "Сумма заторной и промывочной воды отличается от объема партии.",
  source_profile_missing_or_zero:
    "Выберите исходную воду или введите профиль вручную.",
  target_profile_missing_or_zero: "Выберите целевой профиль воды.",
  grain_bill_missing_for_mash_ph: "Для расчета pH нужна засыпь.",
  target_not_reached_within_max_acid:
    "Целевой pH не достигнут в лимите кислоты.",
  calcium_above_practical_range: "Ca выше практического диапазона.",
  magnesium_above_practical_range: "Mg выше практического диапазона.",
  sodium_above_practical_range: "Na выше практического диапазона.",
  chloride_above_practical_range: "Cl выше практического диапазона.",
  sulfate_above_practical_range: "SO4 выше практического диапазона.",
  bicarbonate_above_practical_range: "HCO3 выше практического диапазона.",
};

const lowPriorityWarnings = new Set([
  "mash_ph_ballpark_estimate",
  "mash_acid_model_practical_approximation",
  "target_already_reached",
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

const saltOptionGroups = [
  {
    label: "Основные",
    options: ["gypsum", "calcium_chloride", "epsom_salt"],
  },
  {
    label: "Опционально",
    options: ["baking_soda", "table_salt"],
  },
  {
    label: "Только для опытных сценариев",
    options: ["chalk", "slaked_lime"],
  },
] as const;

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

const toOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
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

const formatSaltOptionLabel = (
  salt: keyof typeof recipeWaterSaltPresentation,
) => {
  const presentation = recipeWaterSaltPresentation[salt];
  return `${presentation.label} · ${presentation.formula}`;
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
  allowedSalts: [],
  allowedAcids: [],
  manualSaltAdditions: [],
  targetMashPh: 5.35,
  spargeAcidificationEnabled: false,
  spargeSourcePh: null,
  targetSpargePh: 5.7,
  targetSpargeAlkalinity: null,
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
): RecipeWaterPlanMeta => {
  if (mode === "single") {
    return {
      ...waterPlanMeta,
      setupEnabled: true,
      mashWaterVolumeL: null,
      spargeWaterVolumeL: null,
      totalWaterVolumeL: null,
      spargeAcidificationEnabled: false,
    };
  }

  const mashWaterL = Number((Math.max(0, totalWaterL) * 0.65).toFixed(1));
  return {
    ...waterPlanMeta,
    setupEnabled: true,
    mashWaterVolumeL: mashWaterL,
    spargeWaterVolumeL: Number(
      Math.max(0, totalWaterL - mashWaterL).toFixed(1),
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
  spargeAcidificationEnabled:
    targetMashPh == null ? false : waterPlanMeta.spargeAcidificationEnabled,
});

export const setRecipeWaterSaltCalculationMode = (
  waterPlanMeta: RecipeWaterPlanMeta,
  mode: "auto" | "manual",
): RecipeWaterPlanMeta => ({
  ...waterPlanMeta,
  setupEnabled: true,
  engine:
    mode === "manual"
      ? "advanced_manual"
      : autoSaltEngineForTargetMashPh(waterPlanMeta.targetMashPh),
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

const getSelectedPresetName = (
  presetId: string | null | undefined,
  profiles: RecipeWaterProfilePreset[],
  fallback: string,
) => profiles.find((preset) => preset.id === presetId)?.name ?? fallback;

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
      className={`flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${selected ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"}`}
    >
      <span className="truncate">{preset.name}</span>
      {preset.badge ? (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${selected ? "bg-white/15 text-white" : "bg-zinc-100 text-zinc-500"}`}>
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
      className={`rounded-lg border px-3 py-2 text-left transition-colors ${selected ? "border-sky-300 bg-sky-50 text-sky-950" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"}`}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {preset.name}
        </span>
        {preset.badge ? (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
            {preset.badge}
          </span>
        ) : null}
        {preset.isHistoricalExample ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            пример
          </span>
        ) : null}
      </span>
      <span className="mt-1 block text-xs leading-5 text-zinc-500">
        {preset.description}
      </span>
      <span className="mt-1 block text-[11px] text-zinc-400">
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
    <details className="group rounded-xl border border-zinc-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase text-zinc-400">
            {title}
          </div>
          <div className="truncate text-sm font-semibold text-zinc-900">
            {selectedName}
          </div>
          <div className="mt-0.5 truncate text-xs text-zinc-500">
            {selectedProfile
              ? `${formatProfile(selectedProfile)} ppm`
              : "Профиль не выбран"}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90" />
      </summary>
      <div className="space-y-3 border-t border-zinc-100 p-3">
        <label className="flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-600">
          <Search className="h-4 w-4 shrink-0 text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
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
          <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-500">
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
  showProfileSummary = false,
  onSelect,
  onDelete,
}: {
  profiles: SavedSourceWaterProfile[];
  selectedId: string | null | undefined;
  selected: boolean;
  showProfileSummary?: boolean;
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
        className={`grid ${showProfileSummary ? "min-h-12" : "h-10"} min-w-0 grid-cols-[minmax(0,1fr)_2.5rem] items-center overflow-hidden rounded-lg border ${selected && isCurrent ? "border-zinc-900 bg-zinc-900" : "border-zinc-200 bg-white"}`}
      >
        <button
          type="button"
          aria-pressed={selected && isCurrent}
          onClick={() => onSelect(profile)}
          className={`flex h-full min-w-0 ${showProfileSummary ? "flex-col items-start justify-center py-1.5" : "items-center"} px-3 text-left text-sm font-medium transition-colors ${selected && isCurrent ? "text-white" : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950"}`}
        >
          <span className="max-w-full truncate">{profile.name}</span>
          {showProfileSummary ? (
            <span className={`mt-0.5 max-w-full truncate text-[11px] font-normal ${selected && isCurrent ? "text-white/70" : "text-zinc-400"}`}>
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
          className={`inline-flex h-full w-10 items-center justify-center border-l transition-colors ${selected && isCurrent ? "border-white/10 text-white/70 hover:bg-white/10 hover:text-white" : "border-zinc-200 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-800"}`}
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
        className={`flex h-10 w-full cursor-pointer list-none items-center justify-between gap-2 rounded-lg border px-3 text-sm font-medium transition-colors [&::-webkit-details-marker]:hidden ${selected ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"}`}
      >
        <span className="min-w-0 truncate">
          {selectedProfile?.name ?? "Сохраненный профиль"}
        </span>
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""} ${selected ? "text-white/70" : "text-zinc-400"}`}
        />
      </button>
      {isOpen ? (
        <div
          role="menu"
          className="absolute left-0 top-11 z-20 w-full min-w-60 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg"
        >
          {profiles.map((profile) => {
            const isCurrent = profile.id === selectedId;

            return (
              <div
                key={profile.id}
                className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-center border-b border-zinc-100 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(profile);
                    setIsOpen(false);
                  }}
                  className={`min-w-0 px-3 py-2.5 text-left text-sm transition-colors ${isCurrent ? "bg-zinc-50 font-semibold text-zinc-950" : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950"}`}
                >
                  <span className="block truncate">{profile.name}</span>
                  {showProfileSummary ? (
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-zinc-400">
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
                  className="inline-flex h-9 w-9 items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-800"
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
      className={`flex h-10 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
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
      className={`grid gap-1 rounded-lg border px-3 py-2 text-left transition-colors ${selected ? "border-sky-300 bg-sky-50 text-sky-950" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {profile.displayName}
        </span>
        {badgeLabel ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${selected ? "bg-white/80 text-sky-700 ring-1 ring-sky-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"}`}>
            {badgeLabel}
          </span>
        ) : null}
      </span>
      <span className="truncate text-[11px] text-zinc-500">
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
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-zinc-500">{label}</div>
        <button
          type="button"
          onClick={onChangeClick}
          className="inline-flex shrink-0 items-center text-sm font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-zinc-950"
        >
          Изменить
        </button>
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-zinc-950 sm:text-base">
          {title}
        </div>
        <div className="mt-0.5 truncate text-xs text-zinc-500">
          {formatProfile(profile)} ppm
        </div>
      </div>
    </div>
  );
}

function ProfileIonEditor({
  profile,
  onChange,
  compact = false,
}: {
  profile: WaterProfileMeta;
  onChange: (profile: WaterProfileMeta) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "grid grid-cols-3 gap-2 md:grid-cols-6" : "grid grid-cols-3 gap-2 rounded-xl bg-zinc-50 p-3 md:grid-cols-6"}>
      {ionKeys.map((key) => (
        <label
          key={key}
          className="text-[11px] font-medium uppercase text-zinc-500"
        >
          {ionLabels[key]}
          <input
            type="number"
            min={0}
            value={profile[key]}
            onChange={(event) =>
              onChange({
                ...profile,
                [key]: event.target.value.trim()
                  ? Number(event.target.value)
                  : 0,
              })
            }
            className={`${compact ? "h-8" : "h-9"} mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900`}
          />
        </label>
      ))}
    </div>
  );
}

const getAcidMl = (
  addition:
    | RecipeWaterPlanResult["mashAcidAddition"]
    | RecipeWaterPlanResult["spargeAcidAddition"],
) => {
  if (!addition) {
    return null;
  }

  return "spargeAcidMl" in addition
    ? addition.spargeAcidMl
    : addition.mashAcidMl;
};

function WaterAdditionsCard({
  title,
  volumeLabel,
  saltAdditions,
  acidAddition,
  showAcid,
  headerControl,
  children,
}: {
  title: string;
  volumeLabel: string;
  saltAdditions: RecipeWaterPlanResult["mashSaltAdditions"];
  acidAddition?:
    | RecipeWaterPlanResult["mashAcidAddition"]
    | RecipeWaterPlanResult["spargeAcidAddition"];
  showAcid?: boolean;
  headerControl?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const acidMl = getAcidMl(acidAddition ?? null);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-zinc-950">{title}</h4>
          <p className="mt-0.5 text-xs text-zinc-500">{volumeLabel}</p>
        </div>
      </div>

      {headerControl ? <div className="mt-3">{headerControl}</div> : null}

      <div className="mt-3 space-y-2">
        {saltAdditions.length ? (
          saltAdditions.map((item) => (
            <div
              key={`${item.salt}-${item.grams}`}
              className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm"
            >
              <span>
                <span className="block font-medium text-zinc-700">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  {item.formula}
                </span>
              </span>
              <span className="tabular-nums text-zinc-950">
                {item.grams.toFixed(2)} г
              </span>
            </div>
          ))
        ) : (
          <div className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
            Соли не нужны
          </div>
        )}

        {showAcid ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm">
            <span className="font-medium text-zinc-700">
              {acidAddition?.label ?? "Кислота"}
            </span>
            <span className="tabular-nums text-zinc-950">
              {acidMl == null
                ? "pH не рассчитан"
                : acidMl > 0
                  ? `${acidMl.toFixed(2)} мл`
                  : "не нужна"}
            </span>
          </div>
        ) : null}
      </div>

      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function TargetMashPhField({
  value,
  onChange,
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
}) {
  const enabled = value != null;

  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
      <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onChange(event.target.checked ? 5.35 : null)}
          className="h-4 w-4 rounded border-zinc-300"
        />
        Рассчитывать pH затора
      </label>
      {enabled ? (
        <label className="mt-2 block text-xs font-medium text-zinc-600">
          Целевой pH затора
          <input
            type="number"
            min={4}
            max={7}
            step={0.01}
            value={value ?? 5.35}
            onChange={(event) =>
              onChange(toOptionalNumber(event.target.value) ?? 5.35)
            }
            className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
          />
        </label>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">
          pH затора не рассчитывается.
        </p>
      )}
    </div>
  );
}

export function WaterSetupWizard({
  waterPlanMeta,
  waterPlanResult,
  styleId = null,
  onChange,
}: {
  waterPlanMeta: RecipeWaterPlanMeta;
  waterPlanResult: RecipeWaterPlanResult;
  styleId?: string | null;
  onChange: (next: RecipeWaterPlanMeta) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
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
  const effectiveWaterPlanMeta = React.useMemo(
    () =>
      waterPlanMeta.setupEnabled
        ? waterPlanMeta
        : ensureRecipeWaterPlanConfigured(waterPlanMeta),
    [waterPlanMeta],
  );
  const source = effectiveWaterPlanMeta.sourceProfile ?? emptyProfile;
  const target = effectiveWaterPlanMeta.targetProfile ?? emptyProfile;
  const selectedAcid = effectiveWaterPlanMeta.selectedAcid ?? "lactic_acid";
  const mashPhEnabled = isRecipeWaterMashPhEnabled(effectiveWaterPlanMeta);
  const saltCalculationMode =
    effectiveWaterPlanMeta.engine === "advanced_manual" ? "manual" : "auto";
  const isSplitVolume = waterPlanResult.waterVolumes.source === "manual_split";
  const visibleWarnings = waterPlanResult.warnings
    .filter((warning) => !lowPriorityWarnings.has(warning))
    .slice(0, 3);
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
    Boolean(targetStyleDefault?.defaultProfile) &&
    Boolean(effectiveWaterPlanMeta.targetProfileIsOverridden) &&
    Boolean(effectiveWaterPlanMeta.targetProfileResolvedFromBjcpStyleKey) &&
    effectiveWaterPlanMeta.targetProfileResolvedFromBjcpStyleKey !==
      targetStyleKey;
  const sourceName =
    effectiveWaterPlanMeta.sourceProfileMode === "manual"
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
    effectiveWaterPlanMeta.targetProfileMode === "manual"
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

  React.useEffect(() => {
    setSavedSourceProfiles(readStoredSavedSourceWaterProfiles());
    setSavedTargetProfiles(readStoredSavedTargetWaterProfiles());
  }, []);

  React.useEffect(() => {
    const defaultProfile = getDefaultTargetProfileForBjcpStyle(targetStyleKey);
    if (!targetStyleKey || !defaultProfile) {
      return;
    }

    const canAutoSelect =
      !waterPlanMeta.targetProfileIsOverridden &&
      (!waterPlanMeta.targetProfile ||
        waterPlanMeta.targetProfileSource === "auto_style");

    if (!canAutoSelect) {
      return;
    }

    if (
      waterPlanMeta.targetProfileSlug === defaultProfile.slug &&
      waterPlanMeta.targetProfileResolvedFromBjcpStyleKey === targetStyleKey
    ) {
      return;
    }

    onChange(
      applyRecipeWaterCatalogTargetProfile(
        ensureRecipeWaterPlanConfigured(waterPlanMeta),
        defaultProfile,
        "auto_style",
        targetStyleKey,
        false,
      ),
    );
  }, [onChange, targetStyleKey, waterPlanMeta]);

  React.useEffect(() => {
    if (waterPlanMeta.setupEnabled || !savedSourceProfiles.length) {
      return;
    }

    onChange(
      applyRecipeWaterSavedSourceProfile(
        ensureRecipeWaterPlanConfigured(waterPlanMeta),
        savedSourceProfiles[0],
      ),
    );
  }, [onChange, savedSourceProfiles, waterPlanMeta]);

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

  const updateManualSalt = (
    index: number,
    patch: { salt?: string; grams?: number },
  ) => {
    const next = [...(effectiveWaterPlanMeta.manualSaltAdditions ?? [])];
    const current = next[index] ?? { salt: "gypsum", grams: 0 };
    next[index] = { ...current, ...patch };
    onChange({
      ...effectiveWaterPlanMeta,
      setupEnabled: true,
      manualSaltAdditions: next,
    });
  };

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

  const updateSavedSourceProfiles = (
    profiles: SavedSourceWaterProfile[],
  ) => {
    setSavedSourceProfiles(profiles);
    persistSavedSourceWaterProfiles(profiles);
  };

  const updateSavedTargetProfiles = (
    profiles: SavedTargetWaterProfile[],
  ) => {
    setSavedTargetProfiles(profiles);
    persistSavedTargetWaterProfiles(profiles);
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

  return (
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
      className="group rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-700">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-xs font-bold text-sky-700">
          H2O
        </span>
        Вода
        <span className="text-xs font-normal text-zinc-400">
          {waterPlanMeta.setupEnabled ? "профиль -> добавки" : "выберите источник"}
        </span>
        <ChevronRight className="ml-auto h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90" />
      </summary>

      <div className="mt-4 space-y-4">
        {waterPlanMeta.setupEnabled ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <WaterSummaryCard
                waterPlanMeta={waterPlanMeta}
                waterPlanResult={waterPlanResult}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange(createRecipeWaterPlanResetMeta())}
              className="ml-auto rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
            >
              Сбросить воду
            </button>
          </div>
        ) : null}

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-900">
              1. Исходная вода
            </h3>
            <span className="truncate text-xs text-zinc-400">{sourceName}</span>
          </div>
          <div className={`grid gap-2 ${savedSourceProfiles.length ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
            <SourceSavedWaterProfileOption
              profiles={savedSourceProfiles}
              selectedId={effectiveWaterPlanMeta.sourceProfileSavedId}
              selected={effectiveWaterPlanMeta.sourceProfileMode === "saved"}
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
            />
            {selectableSourceWaterProfiles.map((preset) => (
              <SourceWaterProfileOption
                key={preset.id}
                preset={preset}
                selected={
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
              className={`flex h-10 items-center justify-center rounded-lg border px-3 text-sm font-medium ${effectiveWaterPlanMeta.sourceProfileMode === "manual" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
            >
              Вручную
            </button>
          </div>

          <div className="space-y-2 rounded-xl bg-zinc-50 p-3">
            <ProfileIonEditor
              profile={source}
              compact
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
                      className="h-8 w-52 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                      placeholder={getNextSavedSourceWaterProfileName(savedSourceProfiles)}
                    />
                    <button
                      type="button"
                      onClick={handleSaveManualSourceProfile}
                      className="inline-flex h-8 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800"
                    >
                      ОК
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualProfileSaveOpen(false)}
                      className="h-8 rounded-lg px-2 text-xs font-medium text-zinc-500 hover:bg-white hover:text-zinc-800"
                    >
                      Отмена
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSourceProfileSaveMessage(null);
                      setManualProfileSaveOpen(true);
                    }}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Сохранить
                  </button>
                )}
                {sourceProfileSaveMessage ? (
                  <span className="text-xs text-emerald-700">
                    {sourceProfileSaveMessage}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900">
            2. Целевой профиль
          </h3>

          <div className={`grid gap-2 ${savedTargetProfiles.length ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {savedTargetProfiles.length ? (
              <SourceSavedWaterProfileOption
                profiles={savedTargetProfiles}
                selectedId={effectiveWaterPlanMeta.targetProfileSavedId}
                selected={effectiveWaterPlanMeta.targetProfileMode === "saved"}
                showProfileSummary
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
              label="Подобрать профиль"
              selected={
                (effectiveWaterPlanMeta.targetProfileMode === "catalog" &&
                  Boolean(effectiveWaterPlanMeta.targetProfile)) ||
                targetCatalogPickerOpen
              }
              onClick={() => {
                setTargetCatalogPickerOpen(true);
              }}
            />
            <TargetModeButton
              label="Вручную"
              selected={effectiveWaterPlanMeta.targetProfileMode === "manual"}
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

          {effectiveWaterPlanMeta.targetProfileMode === "catalog" &&
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
            <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
              <label className="flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-600">
                <Search className="h-4 w-4 shrink-0 text-zinc-400" />
                <input
                  type="search"
                  value={targetQuery}
                  onChange={(event) => {
                    setTargetQuery(event.target.value);
                    setShowAllTargetProfiles(false);
                  }}
                  placeholder="IPA, lager, blanche, стаут..."
                  className="h-full min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                />
              </label>

              <div className={`grid gap-2 ${showAllTargetProfiles ? "max-h-96 overflow-y-auto pr-1" : ""}`}>
                {targetSuggestedEntries.map(({ profile, badgeLabel }) => (
                  <TargetCatalogProfileRow
                    key={`${profile.slug}:${badgeLabel ?? "default"}`}
                    profile={profile}
                    badgeLabel={badgeLabel}
                    selected={
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
                <button
                  type="button"
                  onClick={() => setShowAllTargetProfiles(true)}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950"
                >
                  {targetQueryTrimmed
                    ? `Показать все результаты (${targetCatalogTotalResults})`
                    : `Показать все профили (${targetCatalogTotalResults})`}
                </button>
              ) : null}
              {!targetSuggestedEntries.length && !targetVisibleCatalogResults.length ? (
                <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-500">
                  Ничего не найдено. Попробуйте IPA, lager, pils, witbier,
                  stout.
                </div>
              ) : null}
            </div>
          ) : null}

          {showTargetStyleChangedNotice ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Стиль изменился. При желании можно подобрать другой профиль воды.
            </div>
          ) : null}

          <div className="space-y-2 rounded-xl bg-zinc-50 p-3">
            <ProfileIonEditor
              profile={target}
              compact
              onChange={(profile) =>
                onChange(
                  setRecipeWaterManualTargetProfile(
                    effectiveWaterPlanMeta,
                    profile,
                  ),
                )
              }
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
                      className="h-8 w-52 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                      placeholder={getNextSavedTargetWaterProfileName(savedTargetProfiles)}
                    />
                    <button
                      type="button"
                      onClick={handleSaveManualTargetProfile}
                      className="inline-flex h-8 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800"
                    >
                      ОК
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetProfileSaveOpen(false)}
                      className="h-8 rounded-lg px-2 text-xs font-medium text-zinc-500 hover:bg-white hover:text-zinc-800"
                    >
                      Отмена
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setTargetProfileSaveMessage(null);
                      setTargetProfileSaveOpen(true);
                    }}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Сохранить
                  </button>
                )}
                {targetProfileSaveMessage ? (
                  <span className="text-xs text-emerald-700">
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
              <h3 className="text-sm font-semibold text-zinc-900">
                3. Как вносить соли
              </h3>
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
                  className={`rounded-xl border px-4 py-3 text-left text-sm ${!isSplitVolume ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
                >
                  <span className="block font-semibold">
                    Считать одним объемом
                  </span>
                  <span
                    className={`mt-1 block text-xs ${!isSplitVolume ? "text-zinc-200" : "text-zinc-500"}`}
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
                      ),
                    )
                  }
                  className={`rounded-xl border px-4 py-3 text-left text-sm ${isSplitVolume ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
                >
                  <span className="block font-semibold">
                    Разделить на затор и промывку
                  </span>
                  <span
                    className={`mt-1 block text-xs ${isSplitVolume ? "text-zinc-200" : "text-zinc-500"}`}
                  >
                    Отдельные добавки по объемам
                  </span>
                </button>
              </div>

              {isSplitVolume ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-zinc-600">
                    Заторная вода, л
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={waterPlanMeta.mashWaterVolumeL ?? ""}
                      onChange={(event) =>
                        updateSplitVolume(
                          "mashWaterVolumeL",
                          event.target.value,
                        )
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                    />
                  </label>
                  <label className="text-xs font-medium text-zinc-600">
                    Промывочная вода, л
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={waterPlanMeta.spargeWaterVolumeL ?? ""}
                      onChange={(event) =>
                        updateSplitVolume(
                          "spargeWaterVolumeL",
                          event.target.value,
                        )
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                    />
                  </label>
                </div>
              ) : null}

              {waterPlanResult.warnings.includes(
                "water_split_sum_differs_from_batch_volume",
              ) ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Сумма заторной и промывочной воды отличается от объема партии.
                </div>
              ) : null}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">
                    4. Что добавить
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Финальный профиль:{" "}
                    {formatProfile(waterPlanResult.finalProfile)} ppm
                  </p>
                </div>
                <div className="text-xs text-zinc-500">
                  SO4:Cl {waterPlanResult.sulfateChlorideRatio ?? "—"}
                </div>
              </div>

              {!isSplitVolume ? (
                <WaterAdditionsCard
                  title="Добавить в воду"
                  volumeLabel={`${waterPlanResult.waterVolumes.totalWaterL.toFixed(1)} л`}
                  saltAdditions={waterPlanResult.totalSaltAdditions}
                  acidAddition={waterPlanResult.mashAcidAddition}
                  showAcid={mashPhEnabled}
                  headerControl={
                    <TargetMashPhField
                      value={mashPhEnabled ? waterPlanMeta.targetMashPh : null}
                      onChange={(value) =>
                        onChange(
                          setRecipeWaterTargetMashPh(waterPlanMeta, value),
                        )
                      }
                    />
                  }
                />
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  <WaterAdditionsCard
                    title="В затор"
                    volumeLabel={`${waterPlanResult.waterVolumes.mashWaterL.toFixed(1)} л`}
                    saltAdditions={waterPlanResult.mashSaltAdditions}
                    acidAddition={waterPlanResult.mashAcidAddition}
                    showAcid={mashPhEnabled}
                    headerControl={
                      <TargetMashPhField
                        value={
                          mashPhEnabled ? waterPlanMeta.targetMashPh : null
                        }
                        onChange={(value) =>
                          onChange(
                            setRecipeWaterTargetMashPh(waterPlanMeta, value),
                          )
                        }
                      />
                    }
                  />
                  <WaterAdditionsCard
                    title="В промывку"
                    volumeLabel={`${waterPlanResult.waterVolumes.spargeWaterL.toFixed(1)} л`}
                    saltAdditions={waterPlanResult.spargeSaltAdditions}
                    acidAddition={waterPlanResult.spargeAcidAddition}
                    showAcid={
                      mashPhEnabled && waterPlanMeta.spargeAcidificationEnabled
                    }
                  >
                    {mashPhEnabled ? (
                      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                        <input
                          type="checkbox"
                          checked={
                            waterPlanMeta.spargeAcidificationEnabled ?? false
                          }
                          onChange={(event) =>
                            onChange({
                              ...waterPlanMeta,
                              setupEnabled: true,
                              spargeAcidificationEnabled: event.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                        Подкислить промывочную воду
                      </label>
                    ) : null}
                    {mashPhEnabled &&
                    waterPlanMeta.spargeAcidificationEnabled ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="text-xs font-medium text-zinc-600">
                          Исходный pH
                          <input
                            type="number"
                            min={0}
                            max={14}
                            step={0.01}
                            value={
                              waterPlanMeta.spargeSourcePh ?? source.ph ?? 7
                            }
                            onChange={(event) =>
                              onChange({
                                ...waterPlanMeta,
                                setupEnabled: true,
                                spargeSourcePh: toOptionalNumber(
                                  event.target.value,
                                ),
                              })
                            }
                            className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                          />
                        </label>
                        <label className="text-xs font-medium text-zinc-600">
                          Целевой pH
                          <input
                            type="number"
                            min={4}
                            max={7}
                            step={0.01}
                            value={waterPlanMeta.targetSpargePh ?? 5.7}
                            onChange={(event) =>
                              onChange({
                                ...waterPlanMeta,
                                setupEnabled: true,
                                targetSpargePh:
                                  toOptionalNumber(event.target.value) ?? 5.7,
                              })
                            }
                            className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                          />
                        </label>
                      </div>
                    ) : null}
                  </WaterAdditionsCard>
                </div>
              )}

              {visibleWarnings.length ? (
                <div className="grid gap-2">
                  {visibleWarnings.map((warning) => (
                    <div
                      key={warning}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                    >
                      {waterWarningLabels[warning] ?? warning}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <details className="rounded-xl border border-zinc-100 bg-white p-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-800">
                <SlidersHorizontal className="h-4 w-4 text-zinc-400" />
                Расширенные настройки
                <ChevronRight className="ml-auto h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90" />
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-xs font-medium text-zinc-600">
                  Расчет солей
                  <select
                    value={saltCalculationMode}
                    onChange={(event) =>
                      onChange(
                        setRecipeWaterSaltCalculationMode(
                          waterPlanMeta,
                          event.target.value as "auto" | "manual",
                        ),
                      )
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  >
                    <option value="auto">
                      {saltCalculationModeLabels.auto}
                    </option>
                    <option value="manual">
                      {saltCalculationModeLabels.manual}
                    </option>
                  </select>
                </label>
                {mashPhEnabled ? (
                  <>
                    <label className="text-xs font-medium text-zinc-600">
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
                        className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                      >
                        {recipeMashPhModels.map((model) => (
                          <option key={model} value={model}>
                            {recipeMashPhModelLabels[model]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-zinc-600">
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
                        className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
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
                    <label className="text-xs font-medium text-zinc-600">
                      Концентрация кислоты, %
                      <input
                        type="number"
                        min={1}
                        max={100}
                        step={0.1}
                        value={waterPlanMeta.acidConcentrationPct ?? ""}
                        onChange={(event) =>
                          onChange({
                            ...waterPlanMeta,
                            setupEnabled: true,
                            acidConcentrationPct: toOptionalNumber(
                              event.target.value,
                            ),
                          })
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                        placeholder={
                          selectedAcid === "lactic_acid" ? "88" : "85"
                        }
                      />
                    </label>
                    <label className="text-xs font-medium text-zinc-600">
                      Калибровка pH
                      <input
                        type="number"
                        min={-2}
                        max={2}
                        step={0.01}
                        value={waterPlanMeta.calibrationOffset ?? ""}
                        onChange={(event) =>
                          onChange({
                            ...waterPlanMeta,
                            setupEnabled: true,
                            calibrationOffset: toOptionalNumber(
                              event.target.value,
                            ),
                          })
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                        placeholder="0.00"
                      />
                    </label>
                  </>
                ) : null}
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-zinc-700">
                    Ручные добавки солей
                  </h4>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...waterPlanMeta,
                        setupEnabled: true,
                        engine: "advanced_manual",
                        manualSaltAdditions: [
                          ...(waterPlanMeta.manualSaltAdditions ?? []),
                          { salt: "gypsum", grams: 0 },
                        ],
                      })
                    }
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                  >
                    + Добавить
                  </button>
                </div>
                {(waterPlanMeta.manualSaltAdditions ?? []).map(
                  (addition, index) => (
                    <div
                      key={index}
                      className="grid gap-2 sm:grid-cols-[1fr_120px_36px]"
                    >
                      <select
                        value={addition.salt}
                        onChange={(event) =>
                          updateManualSalt(index, { salt: event.target.value })
                        }
                        className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                      >
                        {saltOptionGroups.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map((value) => (
                              <option key={value} value={value}>
                                {formatSaltOptionLabel(value)}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={addition.grams}
                        onChange={(event) =>
                          updateManualSalt(index, {
                            grams: Number(event.target.value || 0),
                          })
                        }
                        className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onChange(
                            removeRecipeWaterManualSaltAddition(
                              waterPlanMeta,
                              index,
                            ),
                          )
                        }
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
                        aria-label="Удалить ручную добавку соли"
                        title="Удалить"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ),
                )}
                <p className="text-xs text-zinc-500">
                  Основной авторасчет держит простой набор солей. Chalk и slaked
                  lime доступны только здесь.
                </p>
              </div>
            </details>
          </>
        ) : null}
      </div>
    </details>
  );
}
