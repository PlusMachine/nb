import { getBeerStyleById, getBeerStyleTaglineRu, srmToEbc } from "@nb/brewing-core";

import { resolveIngredientDisplayNames } from "../ingredients/presentation";
import { resolveIngredientCategory } from "../ingredients/taxonomy";
import type { RecipeDetailDto, RecipeIngredientDto } from "../recipes/contracts";
import { isRecipeHidden, isRecipePubliclyVisible } from "../recipes/visibility";
import {
  defaultPreferredGravityUnit,
  formatGravityNumber,
  gravityUnitSuffix,
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

/**
 * Имя сорта для списка состава. Запятые и «•» из каталожного имени убираем: и то
 * и другое — служебные символы списка. «Brown Sugar, Light» иначе разваливается
 * на два сорта («Brown Sugar» и «Light»), потому что форма отдаёт список одной
 * строкой через запятую, а печатается он через «•».
 */
const sanitizeListName = (name: string): string =>
  name
    .replace(/[,;•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const resolveIngredientPrimaryName = (ingredient: RecipeIngredientDto): string => {
  const { primaryName } = resolveIngredientDisplayNames({
    displayName: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? ingredient.type,
    displayNameRu: ingredient.ingredientDisplayNameRu,
    displayNameEn: ingredient.ingredientDisplayNameEn
  });
  return sanitizeListName(primaryName);
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

/**
 * Масса позиции в граммах. Вес считаем только по нормализованной единице «g» —
 * ровно как движок рецепта (см. buildRecipeCalcInput): позиция, заданная в
 * штуках или литрах (жидкий экстракт, пакет сахара), веса не имеет.
 */
const ingredientWeightG = (ingredient: RecipeIngredientDto): number | null => {
  if (ingredient.amountNormalizedUnit !== "g") {
    return null;
  }
  const grams = Number(ingredient.amountNormalizedQuantity);
  return Number.isFinite(grams) && grams > 0 ? grams : null;
};

/**
 * Доли в засыпи целыми процентами, сумма ровно 100 («97% + 3%», а не «96% + 5%»):
 * округляем вниз и раздаём остаток по убыванию дробной части. Позиция легче
 * половины процента получает «<1%» — «0%» на бутылке выглядит как брак печати.
 */
const distributePercents = (weights: number[]): string[] => {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const exact = weights.map((weight) => (weight / total) * 100);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const { index } of order) {
    if (remainder <= 0) {
      break;
    }
    floors[index] += 1;
    remainder -= 1;
  }
  return floors.map((value) => (value === 0 ? "<1%" : `${value}%`));
};

/**
 * Солод: имя сорта с долей в засыпи («Pale Ale 97%»). Доля — часть имени, а не
 * отдельное поле: список едет в форму одной строкой, и что пользователь видит в
 * поле, то и печатается; не нужна — стирается руками.
 *
 * Доли считаются, только если их можно посчитать честно: у каждой позиции есть
 * вес, и сортов больше одного (единственный солод — всегда 100%, печатать
 * нечего). Одинаковые имена складываются: два мешка одного пилснера — это одна
 * строка, а не «Пилснер 50% • Пилснер 50%».
 */
const collectMalts = (ingredients: RecipeIngredientDto[]): string[] => {
  const byName = new Map<string, number | null>();
  for (const ingredient of ingredients) {
    const category = ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type });
    if (category !== "fermentable") {
      continue;
    }
    const name = resolveIngredientPrimaryName(ingredient);
    const weight = ingredientWeightG(ingredient);
    const known = byName.get(name);
    // Позиция без веса «заражает» весь сорт: доли по остальным сортам считать
    // уже нечестно — сумма не сойдётся к 100.
    byName.set(name, known === undefined ? weight : known === null || weight === null ? null : known + weight);
  }

  const entries = [...byName.entries()];
  const weights = entries.map(([, weight]) => weight);
  const measurable = entries.length > 1 && weights.every((weight): weight is number => weight !== null);
  const percents = measurable ? distributePercents(weights as number[]) : null;

  return entries.map(([name], index) => (percents ? `${name} ${percents[index]}` : name));
};

// Плотность печатаем в единице пользователя; по умолчанию — °P (в СНГ
// плотность указывают в Плато). Конверсию не дублируем: берём общесистемный
// форматтер, тот же, что в рецептах, варках и калькуляторах. Число идёт в слот
// голым — единицу шаблон ставит сам (typographic — одну на строку «OG · FG»,
// craft — на каждую плашку).
const formatGravitySlot = (value: number | null, unit: PreferredGravityUnit): string | null =>
  formatGravityNumber(value, unit);

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

// QR несёт факты розлива: печатается дата/партия/переопределённый ABV — те же
// значения уезжают в query QR-ссылки. Продуктовое решение: гость не должен
// увидеть на бутылке одно, а по QR на /beer/<slug> узнать другое.

export type QrBottlingFacts = {
  /** ISO-дата розлива (YYYY-MM-DD); null — дата на наклейке не печатается. */
  bottlingIso: string | null;
  /** Итоговый (уже с учётом правок) текст номера партии; null — блок не печатается. */
  batchText: string | null;
  /** Итоговый (уже с учётом правок) текст ABV; число из него берём, только если ABV — ручной override. */
  abvText: string | null;
  /** Пользователь явно переопределил ABV (ключ `abv` присутствует в правках). */
  abvOverridden: boolean;
};

/**
 * Число ABV из напечатанного текста для QR: убирает «~»/«%»/пробелы, запятую
 * меняет на точку. Разбор строгий — а не «первое число в строке»: диапазон
 * вида «5.8–6.2%» не одно значение, и подставить в URL первую цифру значило
 * бы соврать гостю на странице пива. Не разобрали — просто не добавляем.
 */
export const extractQrAbvNumber = (text: string | null): number | null => {
  if (!text) {
    return null;
  }
  const normalized = text.replace(/[~%\s]/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }
  const value = Number.parseFloat(normalized);
  // Потребитель (features/beer-page/bottle-params.ts) принимает максимум два
  // знака после точки — «5.625» страница пива молча выбросила бы. Округляем до
  // проверки диапазона: «0.004» после округления — ноль, его не эмитим вовсе
  // (значение, которое потребитель всё равно отбросит, в QR не возим).
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 && rounded <= 30 ? rounded : null;
};

/**
 * Дописывает к QR-ссылке факты розлива — но только когда она уже ведёт на
 * нашу страницу пива (/beer/<slug> нашего домена): в ручном режиме QR иногда
 * указывает на что-то ещё, и там эти параметры читать некому. Порядок
 * k → b → n → abv фиксирован контрактом; k (если есть) уже стоит в url, а
 * остальные ключи новые — set() лишь дописывает их следом через
 * URLSearchParams (обычное кодирование, без ручной сборки строки).
 */
export const appendQrBottlingFacts = (url: string, baseUrl: string | null, facts: QrBottlingFacts): string => {
  const batch = facts.batchText ? facts.batchText.trim().slice(0, 16) : null;
  const abv = facts.abvOverridden ? extractQrAbvNumber(facts.abvText) : null;
  if (!facts.bottlingIso && !batch && abv === null) {
    return url;
  }
  if (!baseUrl) {
    return url;
  }

  let target: URL;
  let origin: URL;
  try {
    target = new URL(url);
    origin = new URL(baseUrl);
  } catch {
    return url;
  }
  if (target.host !== origin.host || !target.pathname.startsWith("/beer/")) {
    return url;
  }

  if (facts.bottlingIso) {
    target.searchParams.set("b", facts.bottlingIso);
  }
  if (batch) {
    target.searchParams.set("n", batch);
  }
  if (abv !== null) {
    target.searchParams.set("abv", String(abv));
  }
  return target.toString();
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
  // Та же дата, что и в bottlingDateText, но до RU-форматирования — ровно
  // формат b=YYYY-MM-DD, который уходит в QR.
  const bottlingIso = bottling ? params.bottlingDate ?? null : null;
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
    gravityUnitText: gravityUnitSuffix(gravityUnit),
    hops: collectNamesByCategory(recipe.ingredients, "hop"),
    malts: collectMalts(recipe.ingredients),
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

  const result = applyLabelOverrides(base, overrides);
  if (!result.qrUrl) {
    return result;
  }
  return {
    ...result,
    qrUrl: appendQrBottlingFacts(result.qrUrl, baseUrl, {
      bottlingIso,
      batchText: result.batchText,
      abvText: result.abvText,
      abvOverridden: overrides.abv !== undefined
    })
  };
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
  /** Единица плотности; по умолчанию °P. */
  gravityUnit?: PreferredGravityUnit;
  overrides?: LabelOverrides;
  /** Абсолютный URL публичной страницы рецепта для QR (резолвится роутом по слагу). */
  recipeQrUrl?: string | null;
  /** Базовый URL сайта — проверить, что recipeQrUrl ведёт на нашу /beer/<slug> (для мирроринга фактов розлива в QR). */
  baseUrl?: string | null;
}): LabelSlots => {
  const overrides = params.overrides ?? {};
  const bottling = params.bottlingDate ? parseIsoDate(params.bottlingDate) : null;
  // Та же дата, что и в bottlingDateText, но до RU-форматирования — ровно
  // формат b=YYYY-MM-DD, который уходит в QR.
  const bottlingIso = bottling ? params.bottlingDate ?? null : null;

  const base: LabelSlots = {
    title: CUSTOM_LABEL_DEFAULT_TITLE,
    styleName: null,
    abvText: null,
    ibu: null,
    ebc: null,
    ogText: null,
    fgText: null,
    // Значения OG/FG пользователь вводит сам, но шкалу для них знать всё равно
    // нужно: без неё «15.2» напечаталось бы без «°P».
    gravityUnitText: gravityUnitSuffix(params.gravityUnit ?? defaultPreferredGravityUnit),
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

  const result = applyLabelOverrides(base, overrides);
  if (!result.qrUrl) {
    return result;
  }
  return {
    ...result,
    qrUrl: appendQrBottlingFacts(result.qrUrl, params.baseUrl ?? null, {
      bottlingIso,
      batchText: result.batchText,
      abvText: result.abvText,
      abvOverridden: overrides.abv !== undefined
    })
  };
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

// Разделитель списка в форме — запятая, но принимаем и «•»: он печатается на
// наклейке, и пользователь копирует список ровно в таком виде. Имена сортов
// приходят уже без обоих символов (sanitizeListName), так что двусмысленности нет.
const LIST_SEPARATOR = /[,•]/;

const overrideList = (current: string[], value: string | undefined): string[] => {
  if (value === undefined) {
    return current;
  }
  // Шаблон печатает 8 имён и сворачивает остаток в «+N»: 240 символов запятых
  // превращались в «+52» — считаем это опечаткой, а не списком.
  return value
    .split(LIST_SEPARATOR)
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
