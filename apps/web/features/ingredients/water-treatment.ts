import type { IngredientTechnicalData } from "./contracts";

const percentLikeNumberPattern = /(\d+(?:[.,]\d+)?)/;
const acidTextPattern = /(acid|кислот)/i;

const hasAcidToken = (value: unknown) => (
  typeof value === "string" && acidTextPattern.test(value.replaceAll("ё", "е"))
);

const hasAcidLikeListToken = (values: unknown) => (
  Array.isArray(values) && values.some((value) => hasAcidToken(value) || String(value ?? "").toLowerCase().includes("acidification"))
);

export const normalizeWaterTreatmentConcentrationPct = (
  value: unknown,
): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 && value <= 100 ? Number(value.toFixed(2)) : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().replace(",", ".").match(percentLikeNumberPattern);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 100
    ? Number(parsed.toFixed(2))
    : null;
};

export const formatWaterTreatmentConcentrationPct = (
  value: number | null | undefined,
): string | null => {
  const normalized = normalizeWaterTreatmentConcentrationPct(value);
  if (normalized == null) {
    return null;
  }

  return Number.isInteger(normalized)
    ? `${normalized}%`
    : `${normalized.toFixed(1)}%`;
};

const readTrimmedWaterTreatmentText = (
  ...values: unknown[]
): string | null => {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
};

export const resolveWaterTreatmentFormulaLabel = (
  technicalData: IngredientTechnicalData | null | undefined,
): string | null => {
  if (!technicalData || technicalData.type !== "water_treatment") {
    return null;
  }

  return readTrimmedWaterTreatmentText(
    technicalData.displayFormula,
    technicalData.formula,
    technicalData.calculationFormula,
  );
};

export const readWaterTreatmentConcentrationPct = (
  technicalData: IngredientTechnicalData | null | undefined,
): number | null => {
  if (!technicalData || technicalData.type !== "water_treatment") {
    return null;
  }

  return normalizeWaterTreatmentConcentrationPct(technicalData.concentrationPct)
    ?? normalizeWaterTreatmentConcentrationPct(technicalData.defaultConcentrationPct)
    ?? normalizeWaterTreatmentConcentrationPct(technicalData.displayFormula)
    ?? normalizeWaterTreatmentConcentrationPct(technicalData.typicalUseRu);
};

export const readInventoryWaterTreatmentConcentrationPct = (
  properties: Record<string, unknown> | null | undefined,
) => {
  if (!properties) {
    return null;
  }

  const nested = properties.waterTreatment;
  const nestedRecord = typeof nested === "object" && nested !== null && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : null;

  return normalizeWaterTreatmentConcentrationPct(properties.waterTreatmentConcentrationPct)
    ?? normalizeWaterTreatmentConcentrationPct(properties.concentrationPct)
    ?? normalizeWaterTreatmentConcentrationPct(properties.concentration)
    ?? normalizeWaterTreatmentConcentrationPct(nestedRecord?.concentrationPct);
};

export const applyInventoryWaterTreatmentConcentration = (
  technicalData: IngredientTechnicalData | null | undefined,
  properties: Record<string, unknown> | null | undefined,
): IngredientTechnicalData | null | undefined => {
  const concentrationPct = readInventoryWaterTreatmentConcentrationPct(properties);
  if (!technicalData || technicalData.type !== "water_treatment" || concentrationPct == null) {
    return technicalData;
  }

  return {
    ...technicalData,
    concentrationPct,
    defaultConcentrationPct: concentrationPct,
    displayFormula: formatWaterTreatmentConcentrationPct(concentrationPct) ?? technicalData.displayFormula,
  };
};

export const isWaterTreatmentAcidLike = ({
  category,
  subtype,
  itemKind,
  sourceCategory,
  groupName,
  displayName,
  nameRu,
  nameEn,
  technicalData,
}: {
  category?: string | null;
  subtype?: string | null;
  itemKind?: string | null;
  sourceCategory?: string | null;
  groupName?: string | null;
  displayName?: string | null;
  nameRu?: string | null;
  nameEn?: string | null;
  technicalData?: IngredientTechnicalData | null;
}) => {
  const isWaterTreatment = category === "water_treatment" || technicalData?.type === "water_treatment";
  if (!isWaterTreatment) {
    return false;
  }

  if (subtype === "acid") {
    return true;
  }

  if ([itemKind, sourceCategory, groupName, displayName, nameRu, nameEn].some(hasAcidToken)) {
    return true;
  }

  if (technicalData?.type !== "water_treatment") {
    return false;
  }

  return (
    technicalData.pHEffectDirection === "decrease"
    || hasAcidLikeListToken(technicalData.waterCalcRole)
    || hasAcidLikeListToken(technicalData.recommendedFor)
  );
};

export const waterTreatmentConcentrationsEqual = (
  left: number | null | undefined,
  right: number | null | undefined,
) => {
  const normalizedLeft = normalizeWaterTreatmentConcentrationPct(left);
  const normalizedRight = normalizeWaterTreatmentConcentrationPct(right);

  if (normalizedLeft == null && normalizedRight == null) {
    return true;
  }

  if (normalizedLeft == null || normalizedRight == null) {
    return false;
  }

  return Math.abs(normalizedLeft - normalizedRight) < 0.01;
};
