"use client";

import React from "react";

import { parseDecimalInput } from "@/features/forms/numeric-validation";

export type NumericInputFilterOptions = {
  /** Целые значения: без разделителя дробной части. */
  integer?: boolean;
  /** Разрешить ведущий минус (обычно — когда min < 0). */
  allowNegative?: boolean;
};

/**
 * Посимвольная фильтрация ввода: цифры, один разделитель дробной части
 * ("," или ".", в зависимости от того, что ввели первым), и ведущий минус,
 * если разрешён. Разделитель НЕ конвертируется здесь — только на commit
 * (blur), через `parseDecimalInput`, чтобы не прыгал курсор при наборе.
 */
export const filterNumericInputText = (
  rawValue: string,
  { integer = false, allowNegative = false }: NumericInputFilterOptions = {}
): string => {
  const negative = allowNegative && rawValue.startsWith("-");
  const unsigned = rawValue.replace(/-/g, "");

  if (integer) {
    const digitsOnly = unsigned.replace(/[^0-9]/g, "");
    return negative ? `-${digitsOnly}` : digitsOnly;
  }

  let seenSeparator = false;
  let filtered = "";
  for (const char of unsigned) {
    if (char >= "0" && char <= "9") {
      filtered += char;
    } else if ((char === "," || char === ".") && !seenSeparator) {
      seenSeparator = true;
      filtered += char;
    }
  }

  return negative ? `-${filtered}` : filtered;
};

type NumericInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode"
> & {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Целое значение — inputMode="numeric" и без разделителя дробной части. */
  integer?: boolean;
};

/**
 * Замена `<input type="number">` для контролируемых числовых полей, чьё
 * значение в стейте хранится строкой (как и раньше). Фильтрует ввод посимвольно
 * и нормализует разделитель дробной части на blur через `parseDecimalInput`.
 * min/max/step по-прежнему можно передавать — минус разрешается автоматически,
 * если min < 0.
 */
export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(function NumericInput(
  { value, onChange, onBlur, integer = false, min, ...rest },
  ref
) {
  const allowNegative = typeof min === "number" && min < 0;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const filtered = filterNumericInputText(event.target.value, { integer, allowNegative });
    if (filtered !== event.target.value) {
      event.target.value = filtered;
    }
    onChange(event);
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (!integer) {
      const parsed = parseDecimalInput(event.target.value);
      if (parsed != null && Number.isFinite(parsed)) {
        const normalized = String(parsed);
        if (normalized !== event.target.value) {
          event.target.value = normalized;
          onChange(event as unknown as React.ChangeEvent<HTMLInputElement>);
        }
      }
    }

    onBlur?.(event);
  };

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      min={min}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});
