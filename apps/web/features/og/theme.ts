// Визуальные константы динамических OG-карточек (превью ссылок в мессенджерах).
// Единое семейство карточек 1200×630, чтобы любая ссылка NB узнавалась в ленте
// чата. Спека — docs/specs/og-images.md §4. Тёмный фон = айдентика иконки
// приложения (app/icon.svg, #09090b), контраст в обеих темах клиента.

/** Размер холста — стандарт 1200×630 (1.91:1) для всех платформ. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

export const OG_CONTENT_TYPE = "image/png";

/** Ширина фото-врезки (Ф5) — треть холста; высота врезки всегда = OG_SIZE.height. */
export const OG_PHOTO_WIDTH = 400;

/** Приёмочный бюджет веса ЛЮБОЙ карточки (docs/specs/og-images.md §8 Ф5). */
export const OG_WEIGHT_BUDGET_BYTES = 300 * 1024;

export const OG_JPEG_CONTENT_TYPE = "image/jpeg";

/**
 * Кэш-заголовок для route-хендлеров карточек. TG всё равно кэширует превью на
 * своей стороне; s-maxage согласован с revalidate публичной деталки рецепта.
 */
export const OG_CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=600";

/** Имя font-family, под которым Rubik регистрируется в Satori (см. fonts.ts). */
export const OG_FONT_FAMILY = "Rubik";

export const OG_COLORS = {
  background: "#09090b",
  foreground: "#f4f4f6",
  muted: "#a1a1aa",
  /** Изумрудный акцент (primary сайта, чуть светлее для читаемости на тёмном). */
  accent: "#34d399",
  /** Золотая заливка звезды рейтинга. */
  star: "#f5b323",
  /** Нейтральная полоса цвета для сущностей без указанного SRM. */
  neutralStrip: "#57534e"
} as const;

/** Ширина фирменной вертикальной полосы цвета слева, px. */
export const OG_STRIP_WIDTH = 16;

/**
 * Кегль заголовка ступенями по длине строки (docs/specs/og-images.md §6):
 * длинные названия не должны уезжать за 2 строки при ширине контента ~1040px.
 * Простая эвристика по числу символов — без opentype-метрик (в отличие от
 * наклеек, тут запас по ширине большой).
 */
export const resolveTitleFontSize = (title: string): number => {
  const length = title.length;
  if (length <= 20) return 70;
  if (length <= 30) return 60;
  if (length <= 42) return 50;
  if (length <= 56) return 44;
  return 40;
};

// Эмодзи/пиктограммы/вариационные селекторы: Satori (@vercel/og) рендерит их НЕ
// из шрифта, а тянет SVG с CDN twemoji — на self-hosted без исходящего интернета
// это роняет рендер посреди стрима (картинка приходит битой, поймать нельзя). Из
// пользовательского названия рецепта их вырезаем; латиница/кириллица/пунктуация
// остаются (они есть в Rubik).
const UNSUPPORTED_GLYPHS =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}\u{20E3}\u{2049}\u{203C}]/gu;

/** Убирает эмодзи/пиктограммы и схлопывает пробелы (для безопасного рендера в Satori). */
export const stripUnsupportedGlyphs = (text: string): string =>
  text.replace(UNSUPPORTED_GLYPHS, "").replace(/\s+/g, " ").trim();

/** Обрезка по границе слова с «…» — чтобы длинный заголовок не дал 3-ю строку. */
export const truncateForCard = (text: string, maxLength: number): string => {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  const slice = trimmed.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(" ");
  const safe = lastSpace > maxLength / 2 ? slice.slice(0, lastSpace) : slice;
  return `${safe.trimEnd()}…`;
};
