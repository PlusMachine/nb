import { getBeerStyleById, srmToEbc } from "@nb/brewing-core";

import { resolveIngredientDisplayNames } from "../ingredients/presentation";
import { resolveIngredientCategory } from "../ingredients/taxonomy";
import type { RecipeDetailDto, RecipeIngredientDto } from "../recipes/contracts";

import { LABEL_BRAND_TEXT, READY_AFTER_DAYS_DEFAULT, type LabelOverrides, type LabelSlots } from "./contracts";

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
  /** Ручные правки полей поверх данных рецепта. */
  overrides?: LabelOverrides;
};

/** Чистая сборка слотов: вся tier-логика пустых полей — здесь и в шаблонах. */
export const buildLabelSlots = (params: BuildLabelSlotsParams): LabelSlots => {
  const { recipe } = params;
  const style = recipe.styleId ? getBeerStyleById(recipe.styleId) : null;
  const bottling = params.bottlingDate ? parseIsoDate(params.bottlingDate) : null;
  const overrides = params.overrides ?? {};
  const readyAfterDays = overrides.readyAfterDays ?? params.readyAfterDays ?? READY_AFTER_DAYS_DEFAULT;
  const readyAfter = bottling ? new Date(bottling.getTime() + readyAfterDays * 24 * 60 * 60 * 1000) : null;

  const isPublished = recipe.publicationState === "published";
  const baseUrl = params.baseUrl.replace(/\/$/, "");

  const yeastNames = collectNamesByCategory(recipe.ingredients, "yeast");

  const base: LabelSlots = {
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
    // QR ведёт на публичную страницу — только у опубликованного рецепта.
    qrUrl: isPublished && recipe.slug ? `${baseUrl}/recipes/${recipe.slug}` : null,
    brandText: LABEL_BRAND_TEXT
  };

  return applyLabelOverrides(base, overrides);
};

/** Название по умолчанию в ручном режиме — заготовка, которую пользователь заменит. */
export const CUSTOM_LABEL_DEFAULT_TITLE = "Моё пиво";

/**
 * Слоты для наклейки без рецепта (ручной режим /labels): всё пусто, кроме
 * названия-заготовки и марки; дальше их заполняет пользователь. QR тут не
 * бывает — ссылаться не на что.
 */
export const buildCustomLabelSlots = (params: {
  bottlingDate?: string | null;
  overrides?: LabelOverrides;
}): LabelSlots => {
  const overrides = params.overrides ?? {};
  const bottling = params.bottlingDate ? parseIsoDate(params.bottlingDate) : null;
  const readyAfterDays = overrides.readyAfterDays ?? READY_AFTER_DAYS_DEFAULT;
  const readyAfter = bottling ? new Date(bottling.getTime() + readyAfterDays * 24 * 60 * 60 * 1000) : null;

  const base: LabelSlots = {
    title: CUSTOM_LABEL_DEFAULT_TITLE,
    styleName: null,
    abvText: null,
    ibu: null,
    ebc: null,
    ogText: null,
    fgText: null,
    hops: [],
    malts: [],
    yeast: null,
    authorName: null,
    bottlingDateText: bottling ? formatDateRu(bottling) : null,
    readyAfterDateText: readyAfter ? formatDateRu(readyAfter) : null,
    qrUrl: null,
    brandText: LABEL_BRAND_TEXT
  };

  return applyLabelOverrides(base, overrides);
};

// Пустая строка в override = «поле не печатать»; отсутствие ключа = «как в рецепте».
const overrideText = (current: string | null, value: string | undefined): string | null => {
  if (value === undefined) {
    return current;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const overrideNumber = (current: number | null, value: string | undefined): number | null => {
  if (value === undefined) {
    return current;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : current;
};

const overrideList = (current: string[], value: string | undefined): string[] => {
  if (value === undefined) {
    return current;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

/** Накладывает ручные правки на слоты, собранные из рецепта. */
export const applyLabelOverrides = (slots: LabelSlots, overrides: LabelOverrides): LabelSlots => ({
  ...slots,
  // Название — главный элемент: очистить его нельзя, пустое = как в рецепте.
  title: overrides.title !== undefined && overrides.title.trim().length > 0 ? overrides.title.trim() : slots.title,
  styleName: overrideText(slots.styleName, overrides.style),
  abvText: overrideText(slots.abvText, overrides.abv),
  ibu: overrideNumber(slots.ibu, overrides.ibu),
  ebc: overrideNumber(slots.ebc, overrides.ebc),
  ogText: overrideText(slots.ogText, overrides.og),
  fgText: overrideText(slots.fgText, overrides.fg),
  malts: overrideList(slots.malts, overrides.malts),
  hops: overrideList(slots.hops, overrides.hops),
  yeast: overrideText(slots.yeast, overrides.yeast),
  authorName: overrideText(slots.authorName, overrides.author),
  brandText: overrideText(slots.brandText, overrides.brand),
  // Включить QR правкой нельзя — только выключить: приватная страница не должна
  // попасть на печать ни при каких значениях параметров.
  qrUrl: overrides.qr === "0" ? null : slots.qrUrl
});
