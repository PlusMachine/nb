import { getBeerStyleById, srmToEbc } from "@nb/brewing-core";

import { resolveIngredientDisplayNames } from "../ingredients/presentation";
import { resolveIngredientCategory } from "../ingredients/taxonomy";
import type { RecipeDetailDto, RecipeIngredientDto } from "../recipes/contracts";

import { LABEL_BRAND_TEXT, READY_AFTER_DAYS_DEFAULT, type LabelSlots } from "./contracts";

// Чистая сборка слотов наклейки из рецепта (без БД и env — тестируется
// напрямую). QR — только для опубликованных рецептов: никаких ссылок на
// приватные страницы на печати.

const resolveIngredientPrimaryName = (ingredient: RecipeIngredientDto): string => {
  const { primaryName } = resolveIngredientDisplayNames({
    displayName: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? ingredient.type,
    displayNameRu: ingredient.ingredientDisplayNameRu,
    displayNameEn: ingredient.ingredientDisplayNameEn
  });
  return primaryName;
};

const collectNamesByCategory = (
  ingredients: RecipeIngredientDto[],
  category: "fermentable" | "hop" | "yeast"
): string[] => {
  const names = new Set<string>();
  for (const ingredient of ingredients) {
    const resolved = ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type });
    if (resolved === category) {
      names.add(resolveIngredientPrimaryName(ingredient));
    }
  }
  return [...names];
};

const formatGravity = (value: number | null): string | null => (value === null ? null : value.toFixed(3));

const formatAbv = (value: number | null): string | null => {
  if (value === null) {
    return null;
  }
  const rounded = value.toFixed(1).replace(/\.0$/, "");
  return `~${rounded}%`;
};

const parseIsoDate = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateRu = (date: Date): string => {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${date.getUTCFullYear()}`;
};

export type BuildLabelSlotsParams = {
  recipe: RecipeDetailDto;
  /** Абсолютный базовый URL приложения (для QR). */
  baseUrl: string;
  /** Дата розлива YYYY-MM-DD; null/undefined — блоки даты не печатаются. */
  bottlingDate?: string | null;
  readyAfterDays?: number;
};

/** Чистая сборка слотов: вся tier-логика пустых полей — здесь и в шаблонах. */
export const buildLabelSlots = (params: BuildLabelSlotsParams): LabelSlots => {
  const { recipe } = params;
  const style = recipe.styleId ? getBeerStyleById(recipe.styleId) : null;
  const bottling = params.bottlingDate ? parseIsoDate(params.bottlingDate) : null;
  const readyAfterDays = params.readyAfterDays ?? READY_AFTER_DAYS_DEFAULT;
  const readyAfter = bottling ? new Date(bottling.getTime() + readyAfterDays * 24 * 60 * 60 * 1000) : null;

  const isPublished = recipe.publicationState === "published";
  const baseUrl = params.baseUrl.replace(/\/$/, "");

  const yeastNames = collectNamesByCategory(recipe.ingredients, "yeast");

  return {
    title: recipe.title,
    styleName: style ? style.nameRu ?? style.name : null,
    abvText: formatAbv(recipe.abv),
    ibu: recipe.ibu === null ? null : Math.round(recipe.ibu),
    ebc: recipe.color === null ? null : Math.round(srmToEbc(recipe.color)),
    ogText: formatGravity(recipe.og),
    fgText: formatGravity(recipe.fg),
    hops: collectNamesByCategory(recipe.ingredients, "hop"),
    malts: collectNamesByCategory(recipe.ingredients, "fermentable"),
    yeast: yeastNames.length > 0 ? yeastNames.join(", ") : null,
    authorName: recipe.authorDisplayName,
    bottlingDateText: bottling ? formatDateRu(bottling) : null,
    readyAfterDateText: readyAfter ? formatDateRu(readyAfter) : null,
    qrUrl: isPublished && recipe.slug ? `${baseUrl}/recipes/${recipe.slug}` : null,
    brandText: LABEL_BRAND_TEXT
  };
};
