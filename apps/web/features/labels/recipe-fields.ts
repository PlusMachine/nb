/**
 * Заполнение полей студии данными рецепта (ручной режим /labels: человек выбрал
 * свой опубликованный рецепт и просит подставить его данные). Чистые функции —
 * ими пользуется и эндпоинт (`/api/labels/recipe-fields`, где слоты собираются
 * из БД), и сама студия (слияние с тем, что уже набрано руками).
 *
 * Автомат здесь никогда не решает за человека: подстановка запускается кнопкой,
 * а поверх набранного вручную — только с его явного выбора (см. mergeRecipeFields).
 */

import type { LabelSlots } from "./contracts";
import { clampLabelStudioFields, type LabelStudioFields } from "./label-studio-url";

/**
 * Слоты наклейки → значения полей формы. Режем по лимитам поля (см.
 * clampLabelStudioFields): название рецепта и склеенный список солодов длиннее
 * лимита наклейки, а `maxLength` у <input> предзаполненное значение не трогает.
 */
export const labelFieldsFromSlots = (slots: LabelSlots): LabelStudioFields =>
  clampLabelStudioFields({
    title: slots.title,
    style: slots.styleName ?? "",
    abv: slots.abvText ?? "",
    ibu: slots.ibu === null ? "" : String(slots.ibu),
    ebc: slots.ebc === null ? "" : String(slots.ebc),
    og: slots.ogText ?? "",
    fg: slots.fgText ?? "",
    malts: slots.malts.join(", "),
    hops: slots.hops.join(", "),
    yeast: slots.yeast ?? "",
    description: slots.description ?? "",
    author: slots.authorName ?? "",
    brand: slots.brandText ?? "",
    volume: slots.volumeText ?? "",
    batch: slots.batchText ?? ""
  });

/**
 * Поля, которые рецепт действительно знает. Объём тары, номер партии и марка
 * внизу сюда не входят: тару и партию знает только пивовар в день розлива, а
 * марка — заготовка студии, и рецепт не должен её затирать.
 */
export const LABEL_RECIPE_FIELD_KEYS = [
  "title",
  "style",
  "abv",
  "ibu",
  "ebc",
  "og",
  "fg",
  "malts",
  "hops",
  "yeast",
  "description",
  "author"
] as const satisfies readonly (keyof LabelStudioFields)[];

export type LabelRecipeFields = Pick<LabelStudioFields, (typeof LABEL_RECIPE_FIELD_KEYS)[number]>;

/** Человекочитаемые имена подставляемых полей — их студия перечисляет в диалоге. */
export const LABEL_RECIPE_FIELD_LABELS: Record<keyof LabelRecipeFields, string> = {
  title: "Название",
  style: "Стиль",
  abv: "ABV",
  ibu: "IBU",
  ebc: "EBC",
  og: "OG",
  fg: "FG",
  malts: "Солод",
  hops: "Хмель",
  yeast: "Дрожжи",
  description: "Описание",
  author: "Автор"
};

export const recipeFieldsFromSlots = (slots: LabelSlots): LabelRecipeFields => {
  const all = labelFieldsFromSlots(slots);
  return LABEL_RECIPE_FIELD_KEYS.reduce((acc, key) => {
    acc[key] = all[key];
    return acc;
  }, {} as LabelRecipeFields);
};

/**
 * `replace` — поля рецепта вместо всего, что было (в т.ч. пустые: рецепт без
 * стиля стирает стиль — блок просто не печатается).
 * `keep-mine` — дозаполнить только то, к чему человек не притрагивался.
 */
export type LabelFillMode = "replace" | "keep-mine";

/**
 * «Не тронуто» — это пусто ИЛИ ровно заготовка студии: в ручном режиме название
 * предзаполнено («Моё пиво»), и считать его введённым вручную значило бы, что
 * при «только пустые» на наклейке осталось бы «Моё пиво» вместо имени рецепта.
 */
const isUntouched = (value: string, fallback: string): boolean =>
  value.trim().length === 0 || value === fallback;

export const mergeRecipeFields = (params: {
  current: LabelStudioFields;
  incoming: LabelRecipeFields;
  /** Заготовка студии (то, с чего форма начиналась) — эталон «человек не трогал». */
  defaults: LabelStudioFields;
  mode: LabelFillMode;
}): LabelStudioFields => {
  const { current, incoming, defaults, mode } = params;
  const next = { ...current };

  for (const key of LABEL_RECIPE_FIELD_KEYS) {
    const value = incoming[key];
    if (mode === "replace") {
      next[key] = value;
      continue;
    }
    // Пустое значение рецепта в этом режиме не делает ничего: «дозаполнить»
    // нечем, а стирать чужое поле человек не просил.
    if (value.length > 0 && isUntouched(current[key], defaults[key])) {
      next[key] = value;
    }
  }

  return next;
};
