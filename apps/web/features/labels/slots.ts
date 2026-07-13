import { getBeerStyleById, getBeerStyleTaglineRu, srmToEbc } from "@nb/brewing-core";

import { resolveIngredientDisplayNames } from "../ingredients/presentation";
import { resolveIngredientCategory } from "../ingredients/taxonomy";
import type { RecipeDetailDto, RecipeIngredientDto } from "../recipes/contracts";
import { isRecipeHidden, isRecipePubliclyVisible } from "../recipes/visibility";
import {
  defaultPreferredGravityUnit,
  formatGravity as formatGravityValue,
  type PreferredGravityUnit
} from "../system/gravity-units";

import {
  isValidIsoDate,
  LABEL_BRAND_TEXT,
  LABEL_LIST_MAX_NAMES,
  LABEL_LIST_NAME_MAX_LENGTH,
  LABEL_NUMBER_MAX,
  type LabelOverrides,
  type LabelSlots
} from "./contracts";

// Чистая сборка слотов наклейки из рецепта (без БД и env — тестируется
// напрямую). QR ведёт на гостевую страницу пива /beer/<slug>; для
// неопубликованного рецепта — только с share-ключом (?k=…), который считает
// вызывающий сервис: сюда БД и секреты не тянем.

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

// Плотность печатаем в единице пользователя; по умолчанию — °P (в СНГ
// плотность указывают в Плато). Конверсию не дублируем: берём общесистемный
// форматтер, тот же, что в рецептах, варках и калькуляторах.
const formatGravitySlot = (value: number | null, unit: PreferredGravityUnit): string | null =>
  value === null ? null : formatGravityValue(value, unit);

const formatAbv = (value: number | null): string | null => {
  if (value === null) {
    return null;
  }
  const rounded = value.toFixed(1).replace(/\.0$/, "");
  return `~${rounded}%`;
};

const parseIsoDate = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  // Календарь, а не только формат: Date.UTC молча переносит «2026-02-31» на март.
  if (!match || !isValidIsoDate(value)) {
    return null;
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
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
  /** Дата розлива YYYY-MM-DD; null/undefined — дата не печатается. */
  bottlingDate?: string | null;
  /** Единица плотности; по умолчанию °P. */
  gravityUnit?: PreferredGravityUnit;
  /** Ручные правки полей поверх данных рецепта. */
  overrides?: LabelOverrides;
  /** Ключ доступа к /beer/<slug> непубличного рецепта (features/beer-page/share-key). */
  shareKey?: string | null;
};

/** Чистая сборка слотов: вся tier-логика пустых полей — здесь и в шаблонах. */
export const buildLabelSlots = (params: BuildLabelSlotsParams): LabelSlots => {
  const { recipe } = params;
  const style = recipe.styleId ? getBeerStyleById(recipe.styleId) : null;
  const bottling = params.bottlingDate ? parseIsoDate(params.bottlingDate) : null;
  const overrides = params.overrides ?? {};
  const gravityUnit = params.gravityUnit ?? defaultPreferredGravityUnit;

  // Скрытый модератором рецепт не даёт QR вообще: /beer/<slug> закрыт и для
  // владельца, и по share-ключу — печатать ссылку в никуда нельзя.
  const isHidden = isRecipeHidden(recipe);
  const isPublished = isRecipePubliclyVisible(recipe);
  const baseUrl = params.baseUrl.replace(/\/$/, "");

  const yeastNames = collectNamesByCategory(recipe.ingredients, "yeast");

  const base: LabelSlots = {
    title: recipe.title,
    styleName: style ? style.nameRu ?? style.name : null,
    abvText: formatAbv(recipe.abv),
    ibu: recipe.ibu === null ? null : Math.round(recipe.ibu),
    ebc: recipe.color === null ? null : Math.round(srmToEbc(recipe.color)),
    ogText: formatGravitySlot(recipe.og, gravityUnit),
    fgText: formatGravitySlot(recipe.fg, gravityUnit),
    hops: collectNamesByCategory(recipe.ingredients, "hop"),
    malts: collectNamesByCategory(recipe.ingredients, "fermentable"),
    yeast: yeastNames.length > 0 ? yeastNames.join(", ") : null,
    // Описание рецепта на наклейку не переносим: там разметка и целые абзацы,
    // а на бутылке — пара предложений. По умолчанию печатаем описание стиля
    // (готовый текст под лимит поля), пивовар меняет или стирает его в студии.
    description: getBeerStyleTaglineRu(style?.id),
    showLogo: true,
    showIbuScale: true,
    // Объём тары и номер партии рецепт не знает: их вводит пивовар при розливе.
    volumeText: null,
    batchText: null,
    authorName: recipe.authorDisplayName,
    bottlingDateText: bottling ? formatDateRu(bottling) : null,
    // QR ведёт на гостевую страницу пива: опубликованный — открытая ссылка,
    // непубличный — та же страница по share-ключу. Нет ключа — нет QR.
    qrUrl: !recipe.slug || isHidden
      ? null
      : isPublished
        ? `${baseUrl}/beer/${recipe.slug}`
        : params.shareKey
          ? `${baseUrl}/beer/${recipe.slug}?k=${params.shareKey}`
          : null,
    brandText: LABEL_BRAND_TEXT
  };

  return applyLabelOverrides(base, overrides);
};

/** Название по умолчанию в ручном режиме — заготовка, которую пользователь заменит. */
export const CUSTOM_LABEL_DEFAULT_TITLE = "Моё пиво";

/**
 * Слоты для наклейки без рецепта (ручной режим /labels): всё пусто, кроме
 * названия-заготовки и марки; дальше их заполняет пользователь. QR появляется,
 * только если пользователь указал рецепт на нашем сайте (recipeQrUrl) —
 * произвольные ссылки в QR не печатаем.
 */
export const buildCustomLabelSlots = (params: {
  bottlingDate?: string | null;
  overrides?: LabelOverrides;
  /** Абсолютный URL публичной страницы рецепта для QR (резолвится роутом по слагу). */
  recipeQrUrl?: string | null;
}): LabelSlots => {
  const overrides = params.overrides ?? {};
  const bottling = params.bottlingDate ? parseIsoDate(params.bottlingDate) : null;

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
    description: null,
    showLogo: true,
    showIbuScale: true,
    volumeText: null,
    batchText: null,
    authorName: null,
    bottlingDateText: bottling ? formatDateRu(bottling) : null,
    // QR в ручном режиме ведёт на рецепт, выбранный пользователем: слаг резолвит
    // роут (нужна БД), сюда приходит уже готовый абсолютный URL.
    qrUrl: params.recipeQrUrl ?? null,
    brandText: LABEL_BRAND_TEXT
  };

  return applyLabelOverrides(base, overrides);
};

/**
 * Единственная дверь пользовательского текста в рендер. Чистит две вещи, о
 * которых по виду строки не догадаешься:
 *  1) символы вне XML 1.0 — управляющие (U+0001 и т.п.) и «не-символы» U+FFFE/
 *     U+FFFF: resvg падает на них ('non-XML character found'), и запрос уходит в
 *     500. escapeXml их не трогает (экранирует только `& < > " '`), поэтому
 *     режем здесь. Вектор — ссылка `?title=%01`/`?abv=%EF%BF%BF` и вставка из
 *     буфера: %EF%BF%BE — валидный UTF-8 для U+FFFE, он переживает URL-декод;
 *  2) переводы строк и табы — в SVG переноса нет, а метрики шрифта считают их
 *     как .notdef шириной 0.5em, поэтому подгонка кегля врёт и текст режется «…»
 *     на ровном месте.
 */
const sanitizeText = (value: string): string =>
  value
    // eslint-disable-next-line no-control-regex -- ровно те символы, которых нет в XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Пустая строка в override = «поле не печатать»; отсутствие ключа = «как в рецепте».
const overrideText = (current: string | null, value: string | undefined): string | null => {
  if (value === undefined) {
    return current;
  }
  const clean = sanitizeText(value);
  return clean.length > 0 ? clean : null;
};

const overrideNumber = (current: number | null, value: string | undefined): number | null => {
  if (value === undefined) {
    return current;
  }
  const clean = sanitizeText(value);
  if (clean.length === 0) {
    return null;
  }
  // Только десятичная запись: Number() съел бы и «0x10» (→16), и «1e5» (→100000).
  // Всё, что не разбирается (в т.ч. отрицательное), — не печатаем: остаётся
  // значение рецепта, а не выдуманное число и не маркер шкалы за краем наклейки.
  const normalized = clean.replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return current;
  }
  return Math.min(Math.round(Number(normalized)), LABEL_NUMBER_MAX);
};

const overrideList = (current: string[], value: string | undefined): string[] => {
  if (value === undefined) {
    return current;
  }
  // Шаблон печатает 8 имён и сворачивает остаток в «+N»: 240 символов запятых
  // превращались в «+52» — считаем это опечаткой, а не списком.
  return value
    .split(",")
    .map((item) => sanitizeText(item).slice(0, LABEL_LIST_NAME_MAX_LENGTH))
    .filter((item) => item.length > 0)
    .slice(0, LABEL_LIST_MAX_NAMES);
};

/** Накладывает ручные правки на слоты, собранные из рецепта. */
export const applyLabelOverrides = (slots: LabelSlots, overrides: LabelOverrides): LabelSlots => ({
  ...slots,
  // Название — главный элемент: очистить его нельзя, пустое = как в рецепте.
  title: overrideText(slots.title, overrides.title) ?? slots.title,
  styleName: overrideText(slots.styleName, overrides.style),
  abvText: overrideText(slots.abvText, overrides.abv),
  ibu: overrideNumber(slots.ibu, overrides.ibu),
  ebc: overrideNumber(slots.ebc, overrides.ebc),
  ogText: overrideText(slots.ogText, overrides.og),
  fgText: overrideText(slots.fgText, overrides.fg),
  malts: overrideList(slots.malts, overrides.malts),
  hops: overrideList(slots.hops, overrides.hops),
  yeast: overrideText(slots.yeast, overrides.yeast),
  description: overrideText(slots.description, overrides.description),
  // Блоки-переключатели: печатаются по умолчанию, правкой их можно только
  // выключить (симметрично QR — «1» ничего не включает сверх шаблона).
  showLogo: overrides.logo === "0" ? false : slots.showLogo,
  showIbuScale: overrides.ibuScale === "0" ? false : slots.showIbuScale,
  volumeText: overrideText(slots.volumeText, overrides.volume),
  batchText: overrideText(slots.batchText, overrides.batch),
  authorName: overrideText(slots.authorName, overrides.author),
  brandText: overrideText(slots.brandText, overrides.brand),
  // Включить QR правкой нельзя — только выключить: приватная страница не должна
  // попасть на печать ни при каких значениях параметров.
  qrUrl: overrides.qr === "0" ? null : slots.qrUrl
});
