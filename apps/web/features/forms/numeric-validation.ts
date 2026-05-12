export type NumericValidationOptions = {
  label: string;
  required?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
  exclusiveMin?: boolean;
};

const formatBoundary = (value: number) => Number.isInteger(value) ? String(value) : String(value);

export const parseDecimalInput = (value: string) => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export const validateNumericInput = (
  value: string,
  {
    label,
    required = false,
    min,
    max,
    integer = false,
    exclusiveMin = false
  }: NumericValidationOptions
) => {
  const parsed = parseDecimalInput(value);

  if (parsed == null) {
    return required ? `${label}: укажите значение.` : null;
  }

  if (!Number.isFinite(parsed)) {
    return `${label}: введите число.`;
  }

  if (integer && !Number.isInteger(parsed)) {
    return `${label}: введите целое число.`;
  }

  if (min != null) {
    const belowMin = exclusiveMin ? parsed <= min : parsed < min;
    if (belowMin) {
      return exclusiveMin
        ? `${label}: значение должно быть больше ${formatBoundary(min)}.`
        : `${label}: значение не может быть меньше ${formatBoundary(min)}.`;
    }
  }

  if (max != null && parsed > max) {
    return `${label}: значение не может быть больше ${formatBoundary(max)}.`;
  }

  return null;
};

export const hasValidationErrors = (errors: Record<string, string | null | undefined>) => (
  Object.values(errors).some(Boolean)
);
