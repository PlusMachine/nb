"use client";

import * as React from "react";
import * as Slider from "@radix-ui/react-slider";

import { cn } from "../lib/utils";

type SliderScaffoldProps = {
  value: number[];
  onValueChange?: (value: number[]) => void;
  onValueCommit?: (value: number[]) => void;
  min: number;
  max: number;
  step: number;
  /** Доступная подпись группы — навешивается на каждый thumb. */
  ariaLabel?: string;
  /** Подписи для отдельных thumb-ов (например, ["минимум", "максимум"]). */
  thumbLabels?: string[];
  className?: string;
  disabled?: boolean;
};

/**
 * Двухпальцевый (range) слайдер поверх `@radix-ui/react-slider`. Контролируемый:
 * число thumb-ов = длине `value`. `onValueChange` — на каждое изменение (live),
 * `onValueCommit` — по отпусканию (для записи в URL без спама).
 */
export const SliderScaffold = ({
  value,
  onValueChange,
  onValueCommit,
  min,
  max,
  step,
  ariaLabel,
  thumbLabels,
  className,
  disabled
}: SliderScaffoldProps) => (
  <Slider.Root
    className={cn("relative flex h-5 w-full touch-none select-none items-center", className)}
    value={value}
    onValueChange={onValueChange}
    onValueCommit={onValueCommit}
    min={min}
    max={max}
    step={step}
    minStepsBetweenThumbs={1}
    disabled={disabled}
  >
    <Slider.Track className="relative h-1.5 w-full grow rounded-full bg-muted">
      <Slider.Range className="absolute h-full rounded-full bg-foreground" />
    </Slider.Track>
    {value.map((_, index) => (
      <Slider.Thumb
        key={index}
        aria-label={thumbLabels?.[index] ?? ariaLabel}
        className="block h-5 w-5 rounded-full border-2 border-foreground bg-card shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      />
    ))}
  </Slider.Root>
);
