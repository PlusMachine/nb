// Форматтеры значений для OG-карточек (docs/specs/og-images.md §5). Чистые
// функции, общие для билдеров сущностей: диапазоны техпараметров, дата розлива,
// нормализация готовых строк-диапазонов из BJCP. Держим en-dash «–» для
// диапазонов (в Rubik есть); греческую «α» и «№» не используем — их в
// cyrillic_latin-подмножестве может не быть (см. §6), заменяем на «альфа»/«#».

const EN_DASH = "–";

const isNum = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Диапазон чисел «min–max» (или одиночное значение, если границы совпали или
 * задана одна). Округление до `digits` знаков; null, если данных нет вовсе.
 */
export const formatNumberRange = (
  min: number | null | undefined,
  max: number | null | undefined,
  opts: { digits?: number } = {}
): string | null => {
  const digits = opts.digits ?? 0;
  const round = (value: number): string => {
    const fixed = value.toFixed(digits);
    // Убираем хвостовые нули дробной части: «12.0» → «12», «4.50» → «4.5».
    return digits > 0 ? fixed.replace(/\.?0+$/, "") : fixed;
  };

  const lo = isNum(min) ? min : null;
  const hi = isNum(max) ? max : null;
  if (lo == null && hi == null) {
    return null;
  }
  if (lo != null && hi != null) {
    return lo === hi ? round(lo) : `${round(lo)}${EN_DASH}${round(hi)}`;
  }
  return round((lo ?? hi) as number);
};

/**
 * Нормализует готовую строку-диапазон из BJCP (`"1.044 - 1.052"`, `"6 – 14"`):
 * схлопывает пробелы и приводит любой дефис/минус между цифрами к en-dash без
 * окружающих пробелов — единый вид на карточке.
 */
export const normalizeRangeText = (text: string): string =>
  text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*[-‐-―]\s*/g, EN_DASH);

/** Дата розлива «12.07.2026». ISO-строка «YYYY-MM-DD» — полночь UTC, форматируем в UTC. */
export const formatBottlingDateRu = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
};

/** Дата публикации «12 июля 2026» из Date. */
export const formatPublishDateRu = (value: Date | null | undefined): string | null => {
  if (!value || Number.isNaN(value.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(value);
};

/** Собирает строку фактов из непустых частей через « · ». Пусто → null. */
export const joinFacts = (parts: Array<string | null | undefined>): string | null => {
  const clean = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return clean.length > 0 ? clean.join(" · ") : null;
};
