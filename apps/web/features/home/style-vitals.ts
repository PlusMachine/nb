import { srmToEbc } from "@nb/brewing-core";
import type { BjcpCatalogStyle } from "@nb/content";

import { beerColorFromSrm, srmToGlassStops, srmToHex } from "@/features/recipes/beer-color";
import { defaultPreferredGravityUnit, formatGravityRange } from "@/features/system/gravity-units";

/**
 * Данные одного стиля для hero-панели главной: готовые к показу строки-диапазоны
 * (°P / IBU / % / EBC), середина SRM для заливки бокала и подпись цвета. Всё
 * считается на сервере — клиентский островок получает плоский DTO и только
 * переключает активный индекс, без фетчей и конвертаций.
 */
export type HeroStyleVital = {
  bjcpId: string;
  title: string;
  href: string;
  og: string;
  ibu: string;
  abv: string;
  ebc: string;
  colorLabel: string;
  glassHex: string;
  glassFrom: string;
  glassTo: string;
};

/**
 * Шесть стилей hero, отсортированы от светлого к тёмному — порядок сам объясняет
 * цветовую шкалу, когда пользователь листает чипы.
 */
export const HERO_STYLE_CODES = ["4A", "3B", "10A", "21A", "10B", "15B"] as const;

const EN_DASH = "–";

/**
 * Достаёт числовой диапазон из сырой строки BJCP. Разделитель в данных
 * неконсистентен (" - ", "-", " – "), плюс у ABV висит знак `%`, поэтому парсим не
 * по сепаратору, а вытаскиваем сами числа. Одно число → диапазон-точка; пусто → null.
 */
export function parseNumericRange(raw: string | null | undefined): { min: number; max: number } | null {
  if (!raw) {
    return null;
  }
  const matches = raw.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) {
    return null;
  }
  const numbers = matches.map(Number).filter((value) => Number.isFinite(value));
  if (numbers.length === 0) {
    return null;
  }
  const min = numbers[0];
  const max = numbers.length > 1 ? numbers[1] : numbers[0];
  return min <= max ? { min, max } : { min: max, max: min };
}

/** Форматирует диапазон в строку "min–max suffix"; при равных границах — одно число. */
const formatRange = (
  range: { min: number; max: number },
  transform: (value: number) => number,
  digits: number,
  suffix: string
): string => {
  const lo = transform(range.min).toFixed(digits);
  const hi = transform(range.max).toFixed(digits);
  const body = lo === hi ? lo : `${lo}${EN_DASH}${hi}`;
  return suffix ? `${body} ${suffix}` : body;
};

const DASH_PLACEHOLDER = "—";

/**
 * OG в предпочитаемой единице плотности через общий formatGravityRange. Единица
 * фиксирована на Plato (defaultPreferredGravityUnit), а не на реальном предпочтении
 * пользователя: hero — гостевой блок главной (залогиненных редиректит в /app), сессию
 * здесь читать незачем.
 */
const formatOgPlato = (raw: string | null): string => {
  const range = parseNumericRange(raw);
  if (!range) {
    return DASH_PLACEHOLDER;
  }
  return formatGravityRange(range.min, range.max, defaultPreferredGravityUnit) ?? DASH_PLACEHOLDER;
};

/** SRM → EBC (×1.97), целые. */
const formatEbc = (raw: string | null): string => {
  const range = parseNumericRange(raw);
  if (!range) {
    return DASH_PLACEHOLDER;
  }
  return formatRange(range, (srm) => srmToEbc(srm), 0, "EBC");
};

const formatIbu = (raw: string | null): string => {
  const range = parseNumericRange(raw);
  if (!range) {
    return DASH_PLACEHOLDER;
  }
  return formatRange(range, (value) => value, 0, "");
};

const formatAbv = (raw: string | null): string => {
  const range = parseNumericRange(raw);
  if (!range) {
    return DASH_PLACEHOLDER;
  }
  return formatRange(range, (value) => value, 1, "%");
};

/** Середина SRM-диапазона для заливки бокала и подписи цвета; фолбэк — соломенный. */
const resolveSrmMid = (raw: string | null): number => {
  const range = parseNumericRange(raw);
  if (!range) {
    return 2;
  }
  return (range.min + range.max) / 2;
};

const mapStyleToVital = (style: BjcpCatalogStyle): HeroStyleVital => {
  const vitals = style.vitalStatistics;
  const srmMid = resolveSrmMid(vitals.srm);
  const stops = srmToGlassStops(srmMid);
  return {
    bjcpId: style.bjcpId,
    title: style.title,
    href: `/bjcp/${style.slug}`,
    og: formatOgPlato(vitals.og),
    ibu: formatIbu(vitals.ibu),
    abv: formatAbv(vitals.abv),
    ebc: formatEbc(vitals.srm),
    colorLabel: beerColorFromSrm(srmMid).label,
    glassHex: srmToHex(srmMid),
    glassFrom: stops.from,
    glassTo: stops.to
  };
};

/**
 * Собирает hero-DTO по фиксированному списку {@link HERO_STYLE_CODES} из каталога
 * BJCP. Отсутствующие коды тихо пропускаются (порядок сохраняется), чтобы главная
 * не падала, если стиль когда-то уедет из каталога.
 */
export function buildHeroStyleVitals(styles: BjcpCatalogStyle[]): HeroStyleVital[] {
  const byId = new Map(styles.map((style) => [style.bjcpId, style]));
  return HERO_STYLE_CODES.map((code) => byId.get(code))
    .filter((style): style is BjcpCatalogStyle => Boolean(style))
    .map(mapStyleToVital);
}
