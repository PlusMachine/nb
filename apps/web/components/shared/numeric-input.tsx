"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
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

const countDecimals = (step: number): number => {
  const text = String(step);
  const dotIndex = text.indexOf(".");
  return dotIndex === -1 ? 0 : text.length - dotIndex - 1;
};

/**
 * Шаг вверх/вниз для стрелок: клампит в [min, max] и режет плавающий хвост по числу
 * знаков в шаге (0.1 + 0.2 = 0.30000000000000004). Пустое поле — первый шаг ставит
 * min (а без min — сам шаг), не уводя значение в минус. Возвращает null, если
 * значение не изменилось: тогда change не эмитим вовсе.
 */
export const stepNumericValue = (
  rawValue: string,
  {
    direction,
    step = 1,
    min,
    max
  }: { direction: 1 | -1; step?: number; min?: number; max?: number }
): string | null => {
  const stepAmount = Number.isFinite(step) && step > 0 ? step : 1;
  const parsed = parseDecimalInput(rawValue);
  const hasValue = parsed != null && Number.isFinite(parsed);

  // Точность — по самому «дробному» из двух: шаг 1 от 72,5 обязан дать 73,5, а не 74.
  let next = hasValue
    ? Number((parsed + direction * stepAmount).toFixed(Math.max(countDecimals(stepAmount), countDecimals(parsed))))
    : (min ?? (direction === 1 ? stepAmount : 0));
  if (typeof min === "number" && next < min) next = min;
  if (typeof max === "number" && next > max) next = max;

  const nextText = String(next);
  return nextText === rawValue ? null : nextText;
};

type NumericInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode"
> & {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Целое значение — inputMode="numeric" и без разделителя дробной части. */
  integer?: boolean;
  /**
   * Явно разрешить/запретить ведущий минус, в обход автоопределения по `min`.
   * Не передан — поведение как раньше: минус разрешён только когда min < 0.
   */
  allowNegative?: boolean;
  /** Стрелки ±step справа от поля (плюс шаг стрелками клавиатуры). */
  withSteppers?: boolean;
  /** Классы обёртки, когда включены стрелки: поле само по себе остаётся `<input>`. */
  wrapperClassName?: string;
};

/**
 * Замена `<input type="number">` для контролируемых числовых полей, чьё
 * значение в стейте хранится строкой (как и раньше). Фильтрует ввод посимвольно
 * и нормализует разделитель дробной части на blur через `parseDecimalInput`.
 * min/max/step по-прежнему можно передавать — минус разрешается автоматически,
 * если min < 0, если явно не передан allowNegative.
 */
export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(function NumericInput(
  {
    value,
    onChange,
    onBlur,
    onKeyDown,
    integer = false,
    min,
    max,
    step,
    disabled,
    allowNegative: allowNegativeProp,
    withSteppers = false,
    wrapperClassName,
    ...rest
  },
  ref
) {
  const allowNegative = allowNegativeProp ?? (typeof min === "number" && min < 0);
  const innerRef = React.useRef<HTMLInputElement | null>(null);

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

  // Стрелки эмитят обычный change с нового значения: вызывающий код читает
  // event.target.value и кладёт его в стейт — как при ручном вводе.
  const emitStep = (direction: 1 | -1) => {
    const input = innerRef.current;
    if (!input || disabled) {
      return;
    }

    const next = stepNumericValue(value, {
      direction,
      step: typeof step === "number" ? step : Number(step) || 1,
      min: typeof min === "number" ? min : undefined,
      max: typeof max === "number" ? max : undefined
    });
    if (next == null) {
      return;
    }

    input.value = next;
    onChange({ target: input, currentTarget: input } as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (withSteppers && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      emitStep(event.key === "ArrowUp" ? 1 : -1);
    }

    onKeyDown?.(event);
  };

  const input = (
    <input
      {...rest}
      ref={(node) => {
        innerRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      }}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );

  if (!withSteppers) {
    return input;
  }

  return (
    <div className={`relative ${wrapperClassName ?? ""}`}>
      {input}
      <span className="pointer-events-none absolute inset-y-px right-px flex w-6 flex-col overflow-hidden rounded-r-[7px] border-l border-border">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Увеличить"
          onClick={() => emitStep(1)}
          className="pointer-events-auto flex flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <ChevronUp className="h-3 w-3" aria-hidden />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Уменьшить"
          onClick={() => emitStep(-1)}
          className="pointer-events-auto flex flex-1 items-center justify-center border-t border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <ChevronDown className="h-3 w-3" aria-hidden />
        </button>
      </span>
    </div>
  );
});
