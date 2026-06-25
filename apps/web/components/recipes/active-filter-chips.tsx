"use client";

import React from "react";
import { X } from "lucide-react";

import { srmColorBands } from "@/features/recipes/beer-color";

import type { RecipeFamilyOption, RecipeStyleOption } from "./recipes-filter-controls";
import { useRecipeQueryNav } from "./use-recipe-query";

type Chip = { key: string; label: string; patch: Record<string, string | null> };

const formatRange = (prefix: string, min: string | null, max: string | null, suffix = ""): string => {
  if (min && max) {
    return `${prefix} ${min}–${max}${suffix}`;
  }
  if (min) {
    return `${prefix} от ${min}${suffix}`;
  }
  return `${prefix} до ${max}${suffix}`;
};

const colorLabel = (min: string | null, max: string | null): string => {
  const band = srmColorBands.find((entry) => String(entry.min) === min && String(entry.max) === max);
  if (band) {
    return `Цвет: ${band.label}`;
  }
  return formatRange("Цвет: SRM", min, max);
};

/**
 * Активные фильтры в виде удаляемых чипов. Клик ✕ убирает соответствующий
 * параметр(ы) из URL (мерж, прочие сохраняются; page сбрасывается). Лейблы
 * семейства/стиля резолвятся из переданных с сервера опций.
 */
export function ActiveFilterChips({
  familyOptions,
  styleOptions
}: {
  familyOptions: RecipeFamilyOption[];
  styleOptions: RecipeStyleOption[];
}) {
  const { searchParams, navigate } = useRecipeQueryNav();

  const chips: Chip[] = [];

  const q = searchParams.get("q");
  if (q) {
    chips.push({ key: "q", label: `«${q}»`, patch: { q: null } });
  }

  const family = searchParams.get("family");
  if (family) {
    const name = familyOptions.find((option) => option.id === family)?.name ?? family;
    chips.push({ key: "family", label: name, patch: { family: null } });
  }

  const style = searchParams.get("style");
  if (style) {
    const name = styleOptions.find((option) => option.code === style)?.name ?? style;
    chips.push({ key: "style", label: `${name} · ${style}`, patch: { style: null } });
  }

  const colorMin = searchParams.get("colorMin");
  const colorMax = searchParams.get("colorMax");
  if (colorMin || colorMax) {
    chips.push({ key: "color", label: colorLabel(colorMin, colorMax), patch: { colorMin: null, colorMax: null } });
  }

  const abvMin = searchParams.get("abvMin");
  const abvMax = searchParams.get("abvMax");
  if (abvMin || abvMax) {
    chips.push({ key: "abv", label: formatRange("ABV", abvMin, abvMax, " %"), patch: { abvMin: null, abvMax: null } });
  }

  const ibuMin = searchParams.get("ibuMin");
  const ibuMax = searchParams.get("ibuMax");
  if (ibuMin || ibuMax) {
    chips.push({ key: "ibu", label: formatRange("IBU", ibuMin, ibuMax), patch: { ibuMin: null, ibuMax: null } });
  }

  if (!chips.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => navigate(chip.patch)}
          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-white"
          aria-label={`Убрать фильтр: ${chip.label}`}
        >
          {chip.label}
          <X className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
        </button>
      ))}
    </div>
  );
}
