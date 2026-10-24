import type { IngredientTechnicalData } from "./contracts";
import type { IngredientCategory } from "./taxonomy";
import { resolveIngredientTechnicalDataHopAlphaAcidPct } from "./technical-fields";

const formatStatNumber = (value: number) => (
  value % 1 === 0 ? String(value) : value.toFixed(1).replace(/\.0$/, "")
);

const normalizeComparableNumber = (value: number | null) => (
  value == null ? null : Number(value.toFixed(2))
);

export const catalogComparableNumbersEqual = (left: number | null, right: number | null) => {
  const normalizedLeft = normalizeComparableNumber(left);
  const normalizedRight = normalizeComparableNumber(right);

  if (normalizedLeft == null && normalizedRight == null) {
    return true;
  }

  if (normalizedLeft == null || normalizedRight == null) {
    return false;
  }

  return Math.abs(normalizedLeft - normalizedRight) < 0.001;
};

export type DerivedIngredientOwnershipSource = {
  source: "catalog" | "custom";
  category?: IngredientCategory | null;
  derivedFromIngredientId?: string | null;
  hopAlphaAcidPct?: number | null;
  derivedFromHopAlphaAcidPct?: number | null;
  technicalData?: IngredientTechnicalData | null;
  harvestYear?: number | null;
};

const readFiniteNumber = (value: unknown): number | null => (
  typeof value === "number" && Number.isFinite(value) ? value : null
);

export const resolveDerivedIngredientHopAlphaAcidPct = (item: DerivedIngredientOwnershipSource): number | null => {
  const direct = readFiniteNumber(item.hopAlphaAcidPct);
  if (direct != null) {
    return direct;
  }

  if (item.technicalData?.type === "hop") {
    return resolveIngredientTechnicalDataHopAlphaAcidPct(item.technicalData);
  }

  return null;
};

export const isHopWithUserAlphaOverride = (item: DerivedIngredientOwnershipSource): boolean => {
  if (item.category !== "hop" || !item.derivedFromIngredientId) {
    return false;
  }

  const currentAlpha = resolveDerivedIngredientHopAlphaAcidPct(item);
  if (currentAlpha == null) {
    return false;
  }

  const catalogAlpha = readFiniteNumber(item.derivedFromHopAlphaAcidPct);
  if (catalogAlpha == null) {
    // Старые derived-хмели без сохранённой каталожной α: без урожая они
    // создавались только из-за правки α (см. resolveCatalogTechnicalOverride).
    return item.harvestYear == null;
  }

  return !catalogComparableNumbersEqual(currentAlpha, catalogAlpha);
};

export const resolveCustomIngredientOwnershipBadgeLabel = (
  item: DerivedIngredientOwnershipSource,
  style: "upper" | "title" = "upper"
): string | null => {
  if (item.source !== "custom") {
    return null;
  }

  if (!item.derivedFromIngredientId) {
    return style === "upper" ? "СВОЙ" : "Свой";
  }

  // Derived-хмель: год урожая и α — просто поля партии, не «изменение».
  // Пользовательская α помечается у самого значения α, бейдж не нужен.
  if (item.category === "hop") {
    return null;
  }

  return style === "upper" ? "ИЗМЕНЁННЫЙ" : "Изменённый";
};

export const formatHopAlphaAcidStatLabel = (
  alphaPct: number,
  options?: { userOverride?: boolean }
) => {
  const label = `Альфа ${formatStatNumber(alphaPct)}%`;
  return options?.userOverride ? `${label} (ваше значение)` : label;
};

export const formatHopAlphaAcidAaValue = (
  alphaPct: number,
  options?: { userOverride?: boolean }
) => {
  const label = `${formatStatNumber(alphaPct)}% AA`;
  return options?.userOverride ? `${label} (ваше значение)` : label;
};

export const formatHopAlphaAcidDetailValue = (
  alphaPct: number,
  options?: { userOverride?: boolean }
) => {
  const label = `${formatStatNumber(alphaPct)}%`;
  return options?.userOverride ? `${label} (ваше значение)` : label;
};

export const readDerivedFromHopAlphaAcidPct = (properties: Record<string, unknown> | null | undefined): number | null => (
  readFiniteNumber(properties?.derivedFromHopAlphaAcidPct)
);
