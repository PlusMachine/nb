"use client";

// =============================================================================
//  components/recipes/brew-volume-choice.tsx
//  Выбор объёма варки в диалоге «Сварить». Показывается ТОЛЬКО когда объём
//  рецепта разошёлся с объёмом оборудования пользователя (рецепт с витрины на
//  30 л, у меня — 20 л): молча сварить чужой объём нельзя, иначе разъезжаются и
//  списание склада, и водный план варочного дня. Совпали — блока нет вовсе.
//
//  Предвыбора нет намеренно (решение владельца): пока объём не выбран, кнопка
//  старта варки неактивна. «Моё оборудование» подставляет профиль целиком —
//  объём, выпаривание, потери; «Другой» — тот же профиль с ручным объёмом.
// =============================================================================
import React from "react";

import { NumericInput } from "@/components/shared/numeric-input";
import { parseDecimalInput } from "@/features/forms/numeric-validation";

export type BrewVolumeProfile = {
  id: string;
  name: string;
  targetBatchVolumeL: number;
  brewhouseEfficiencyPct: number;
};

export type BrewVolumeChoiceKind = "recipe" | "profile" | "custom";

export type BrewVolumeSelection = {
  targetBatchVolumeL?: number;
  equipmentProfileId?: string;
};

/** Расхождение меньше 0.1 л — не расхождение (округления объёма, а не другое оборудование). */
const VOLUME_MATCH_TOLERANCE_L = 0.1;

export const hasBrewVolumeMismatch = (
  recipeBatchVolumeL: number | null,
  profile: BrewVolumeProfile | null
): boolean => (
  recipeBatchVolumeL != null
  && recipeBatchVolumeL > 0
  && profile != null
  && Math.abs(profile.targetBatchVolumeL - recipeBatchVolumeL) > VOLUME_MATCH_TOLERANCE_L
);

export const parseCustomBrewVolumeL = (rawValue: string): number | null => {
  const parsed = parseDecimalInput(rawValue);
  return parsed != null && Number.isFinite(parsed) && parsed > 0 && parsed <= 1000 ? parsed : null;
};

/**
 * Итог выбора для payload старта варки. «Как в рецепте» — пусто: ни объём, ни
 * профиль не подменяем (прежнее поведение). Выбора не было (блок не показан) —
 * тоже пусто.
 */
export const resolveBrewVolumeSelection = (input: {
  choice: BrewVolumeChoiceKind | null;
  profile: BrewVolumeProfile | null;
  customValue: string;
}): BrewVolumeSelection => {
  if (!input.profile || input.choice == null || input.choice === "recipe") {
    return {};
  }

  if (input.choice === "profile") {
    return {
      targetBatchVolumeL: input.profile.targetBatchVolumeL,
      equipmentProfileId: input.profile.id
    };
  }

  const custom = parseCustomBrewVolumeL(input.customValue);
  return custom == null
    ? {}
    : { targetBatchVolumeL: custom, equipmentProfileId: input.profile.id };
};

/** Можно ли стартовать варку: либо выбора нет, либо он сделан и полон. */
export const isBrewVolumeSelectionReady = (input: {
  required: boolean;
  choice: BrewVolumeChoiceKind | null;
  customValue: string;
}): boolean => {
  if (!input.required) {
    return true;
  }
  if (input.choice === "recipe" || input.choice === "profile") {
    return true;
  }
  return input.choice === "custom" && parseCustomBrewVolumeL(input.customValue) != null;
};

export const formatBrewVolumeL = (value: number): string => `${Number(value.toFixed(2))} л`;

const formatPercent = (value: number): string => `${Number(value.toFixed(1))}%`;

type OptionButtonProps = {
  active: boolean;
  disabled?: boolean;
  title: string;
  value: string;
  onClick: () => void;
};

const OptionButton = ({ active, disabled, title, value, onClick }: OptionButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-pressed={active}
    className={`flex min-h-[44px] flex-1 flex-col items-start rounded-lg border px-3 py-2 text-left transition disabled:opacity-60 ${
      active ? "border-foreground bg-muted" : "border-border bg-card hover:bg-accent"
    }`}
  >
    <span className="text-xs text-muted-foreground">{title}</span>
    <span className="text-sm font-semibold text-foreground">{value}</span>
  </button>
);

export type BrewVolumeChoiceProps = {
  recipeBatchVolumeL: number;
  /** Эффективность автора: с ней сверяем свою, чтобы честно сказать про дожим засыпи. */
  recipeEfficiencyPct?: number | null;
  profile: BrewVolumeProfile;
  choice: BrewVolumeChoiceKind | null;
  onChoiceChange: (choice: BrewVolumeChoiceKind) => void;
  customValue: string;
  onCustomValueChange: (value: string) => void;
  disabled?: boolean;
};

export function BrewVolumeChoice({
  recipeBatchVolumeL,
  recipeEfficiencyPct,
  profile,
  choice,
  onChoiceChange,
  customValue,
  onCustomValueChange,
  disabled
}: BrewVolumeChoiceProps) {
  const customVolumeL = parseCustomBrewVolumeL(customValue);
  const targetVolumeL = choice === "profile"
    ? profile.targetBatchVolumeL
    : choice === "custom"
      ? customVolumeL
      : null;
  // Варка на своём оборудовании идёт и на своей эффективности: засыпь дожимается,
  // чтобы попасть в авторский OG. Солода спишется больше, чем «просто по объёму», —
  // об этом надо сказать прямо, иначе цифра на складе выглядит ошибкой.
  const efficiencyDiffers = choice !== "recipe"
    && choice != null
    && recipeEfficiencyPct != null
    && Math.abs(profile.brewhouseEfficiencyPct - recipeEfficiencyPct) > 0.5;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">Объём варки</span>
        <span className="text-xs text-muted-foreground">{profile.name}</span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <OptionButton
          active={choice === "recipe"}
          disabled={disabled}
          title="Как в рецепте"
          value={formatBrewVolumeL(recipeBatchVolumeL)}
          onClick={() => onChoiceChange("recipe")}
        />
        <OptionButton
          active={choice === "profile"}
          disabled={disabled}
          title="Моё оборудование"
          value={formatBrewVolumeL(profile.targetBatchVolumeL)}
          onClick={() => onChoiceChange("profile")}
        />
        <OptionButton
          active={choice === "custom"}
          disabled={disabled}
          title="Другой"
          value="Ввести объём"
          onClick={() => onChoiceChange("custom")}
        />
      </div>
      {choice === "custom" ? (
        <label className="flex items-center gap-2">
          <NumericInput
            value={customValue}
            onChange={(event) => onCustomValueChange(event.target.value)}
            min={0}
            max={1000}
            disabled={disabled}
            aria-label="Объём варки, л"
            autoFocus
            className="h-9 w-28 rounded-md border border-border px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-sm text-muted-foreground">л</span>
        </label>
      ) : null}
      {targetVolumeL != null && targetVolumeL > 0 ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Количества ингредиентов пересчитаны на {formatBrewVolumeL(targetVolumeL)}.
          {efficiencyDiffers ? (
            <>
              {" "}Засыпь — под вашу эффективность {formatPercent(profile.brewhouseEfficiencyPct)}
              {" "}(у автора {formatPercent(recipeEfficiencyPct as number)}), чтобы попасть в его OG.
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
