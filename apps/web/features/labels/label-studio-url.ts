/**
 * Клиент-безопасные (без БД/рендера) хелперы URL-состояния студии наклеек
 * (`/labels`, `/app/recipes/[id]/labels`). Правки полей и настройки студии
 * зеркалятся в query той же страницы, чтобы ссылку можно было переслать или
 * сохранить в закладках — без React, по образцу `my-recipes-url.ts`.
 *
 * Разделение ключей ВАЖНО: `format`/`preview`/`download`/`sheet` — служебные
 * параметры РЕНДЕРА (см. `labelRenderRequestSchema` в `contracts.ts`), их
 * студия подставляет сама при построении ссылки на превью/скачивание — в URL
 * СТРАНИЦЫ они не попадают. Режим листа A4 в URL страницы называется иначе —
 * `layout=a4` — чтобы не путать со служебным `sheet` (тот относится только к
 * вызову эндпоинта рендера).
 */

import { preferredGravityUnits, type PreferredGravityUnit } from "../system/gravity-units";

import {
  isValidIsoDate,
  LABEL_DPI_VALUES,
  LABEL_FIELD_LIMITS,
  LABEL_PRESET_IDS,
  LABEL_TEMPLATE_IDS,
  type LabelDpi,
  type LabelPresetId,
  type LabelTemplateId
} from "./contracts";

export type LabelStudioLayout = "single" | "a4";

/** Ровно ключи полей labelOverridesSchema (кроме qr/recipeSlug — у них своя семантика). */
export type LabelStudioFields = {
  title: string;
  style: string;
  abv: string;
  ibu: string;
  ebc: string;
  og: string;
  fg: string;
  malts: string;
  hops: string;
  yeast: string;
  description: string;
  author: string;
  brand: string;
  volume: string;
  batch: string;
};

export const LABEL_STUDIO_FIELD_KEYS = [
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
  "author",
  "brand",
  "volume",
  "batch"
] as const satisfies readonly (keyof LabelStudioFields)[];

/**
 * Режет значения полей по лимитам наклейки (LABEL_FIELD_LIMITS). Нужна не только
 * для полей из чужой ссылки, но и для префила из рецепта: название рецепта (до
 * 180 символов) и склеенный список солодов (легко за 240) длиннее лимита поля
 * наклейки, а `maxLength` у <input> режет только НАБОР/вставку, но не
 * предзаполненное значение. Без обрезки форма собрала бы запрос, который
 * серверная схема отвергнет 400-ым: превью замирает, а «Скачать PNG/PDF» ведёт
 * на JSON-ошибку.
 */
export const clampLabelStudioFields = (fields: LabelStudioFields): LabelStudioFields =>
  LABEL_STUDIO_FIELD_KEYS.reduce((acc, key) => {
    acc[key] = fields[key].slice(0, LABEL_FIELD_LIMITS[key]);
    return acc;
  }, {} as LabelStudioFields);

export type LabelStudioState = {
  template: LabelTemplateId;
  /** Пресет наклейки (S/M/L) — независимо от режима листа. */
  preset: LabelPresetId;
  layout: LabelStudioLayout;
  dpi: LabelDpi;
  /** Шкала OG/FG на наклейке; не обязана совпадать с настройкой профиля. */
  gravityUnit: PreferredGravityUnit;
  /** ISO-дата YYYY-MM-DD или "" (дата не печатается). */
  bottlingDate: string;
  fields: LabelStudioFields;
  withQr: boolean;
  /** Печатать эмблему («Крафт», большая наклейка). */
  withLogo: boolean;
  /** Печатать шкалу горечи (большая наклейка). */
  withIbuScale: boolean;
  /** Ручной режим: слаг или URL рецепта, на который ведёт QR. Пусто — не задано. */
  recipeSlug: string;
};

/**
 * Собирает query СТРАНИЦЫ студии (не рендера!) из текущего состояния — пишет
 * только то, что отличается от дефолтов (чистая форма = чистый URL). Ключи
 * полей совпадают с `labelOverridesSchema` (title/style/…/volume/batch), плюс
 * template/preset/layout/dpi/bottlingDate/qr/recipeSlug. Служебные ключи
 * рендера (format/preview/download/sheet) сюда никогда не попадают.
 */
export const serializeLabelStudioState = (
  state: LabelStudioState,
  defaults: LabelStudioState
): URLSearchParams => {
  const params = new URLSearchParams();

  if (state.template !== defaults.template) {
    params.set("template", state.template);
  }
  if (state.preset !== defaults.preset) {
    params.set("preset", state.preset);
  }
  if (state.layout !== defaults.layout) {
    params.set("layout", state.layout);
  }
  if (state.dpi !== defaults.dpi) {
    params.set("dpi", String(state.dpi));
  }
  if (state.gravityUnit !== defaults.gravityUnit) {
    params.set("gravityUnit", state.gravityUnit);
  }
  if (state.bottlingDate !== defaults.bottlingDate) {
    params.set("bottlingDate", state.bottlingDate);
  }
  for (const key of LABEL_STUDIO_FIELD_KEYS) {
    if (state.fields[key] !== defaults.fields[key]) {
      params.set(key, state.fields[key]);
    }
  }
  // По умолчанию QR включён (когда доступен) — писать нужно только отклонение
  // от дефолта состояния (обычно "0"); см. ловушку в parseLabelStudioQuery.
  if (state.withQr !== defaults.withQr) {
    params.set("qr", state.withQr ? "1" : "0");
  }
  if (state.withLogo !== defaults.withLogo) {
    params.set("logo", state.withLogo ? "1" : "0");
  }
  if (state.withIbuScale !== defaults.withIbuScale) {
    params.set("ibuScale", state.withIbuScale ? "1" : "0");
  }
  if (state.recipeSlug !== defaults.recipeSlug) {
    params.set("recipeSlug", state.recipeSlug);
  }

  return params;
};

/**
 * Разбирает query СТРАНИЦЫ студии обратно в частичное состояние. `ctx.qrAvailable`
 * — можно ли включить QR В ЭТОМ КОНКРЕТНОМ КОНТЕКСТЕ прямо сейчас (рецепт
 * опубликован/выбран пресет, где QR печатается, — вызывающая сторона решает
 * это до вызова, т.к. это знание о рецепте/пресете, а не о query как таковом).
 * `qr=1` из чужой ссылки при `qrAvailable=false` ИГНОРИРУЕТСЯ — иначе ссылка
 * вида `?qr=1` включала бы QR на страницу черновика или пресет S, где физически
 * нет места под QR (аналог ловушки двойной конверсии шкал — см. комментарий в
 * `features/calculators/definitions.ts:1113`). Выключить QR (`qr=0`) можно
 * всегда — симметрично серверной схеме `labelOverridesSchema`.
 */
export const parseLabelStudioQuery = (
  query: Record<string, string | undefined>,
  ctx: { qrAvailable: boolean }
): Partial<LabelStudioState> => {
  const result: Partial<LabelStudioState> = {};

  if (query.template && (LABEL_TEMPLATE_IDS as readonly string[]).includes(query.template)) {
    result.template = query.template as LabelTemplateId;
  }

  if (query.preset && (LABEL_PRESET_IDS as readonly string[]).includes(query.preset)) {
    result.preset = query.preset as LabelPresetId;
  }

  if (query.layout === "a4" || query.layout === "single") {
    result.layout = query.layout;
  }

  const dpi = Number(query.dpi);
  if ((LABEL_DPI_VALUES as readonly number[]).includes(dpi)) {
    result.dpi = dpi as LabelDpi;
  }

  if (query.gravityUnit && (preferredGravityUnits as readonly string[]).includes(query.gravityUnit)) {
    result.gravityUnit = query.gravityUnit as PreferredGravityUnit;
  }

  // Присутствие ключа отличаем от отсутствия: пустой `bottlingDate=` — это
  // намеренно очищенная дата (её нельзя терять при пересылке ссылки), иначе
  // состояние «без даты на наклейке» невозможно передать — у получателя дата
  // молча возвращалась бы к его «сегодня» (studioDefaults). Непустое значение
  // проверяем календарём; мусор — игнорируем.
  if (query.bottlingDate !== undefined) {
    if (query.bottlingDate === "") {
      result.bottlingDate = "";
    } else if (isValidIsoDate(query.bottlingDate)) {
      result.bottlingDate = query.bottlingDate;
    }
  }

  // Поля из ссылки режем по тем же лимитам, что и форма: иначе чужая ссылка
  // приносит в студию значение, которое сервер отвергнет 400-ым, — превью не
  // появится вовсе, а поле выглядит обычным.
  const fields: Partial<LabelStudioFields> = {};
  let hasFields = false;
  for (const key of LABEL_STUDIO_FIELD_KEYS) {
    const value = query[key];
    if (value !== undefined) {
      fields[key] = value.slice(0, LABEL_FIELD_LIMITS[key]);
      hasFields = true;
    }
  }
  if (hasFields) {
    result.fields = fields as LabelStudioFields;
  }

  if (query.qr === "0") {
    result.withQr = false;
  } else if (query.qr === "1" && ctx.qrAvailable) {
    result.withQr = true;
  }

  // Эмблема и шкала горечи печатаются по умолчанию — из ссылки читаем только
  // явное выключение/включение, всё остальное оставляем шаблону.
  if (query.logo === "0" || query.logo === "1") {
    result.withLogo = query.logo === "1";
  }
  if (query.ibuScale === "0" || query.ibuScale === "1") {
    result.withIbuScale = query.ibuScale === "1";
  }

  if (query.recipeSlug !== undefined) {
    result.recipeSlug = query.recipeSlug.slice(0, LABEL_FIELD_LIMITS.recipeSlug);
  }

  return result;
};
