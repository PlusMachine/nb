import type { CalculatorCatalogItem } from "@/features/calculators/catalog";
import type { CalculatorResult } from "@/features/calculators/definitions";

import type { OgCardView, OgStat } from "./models";
import { OG_COLORS, resolveTitleFontSize, stripUnsupportedGlyphs, truncateForCard } from "./theme";

// Карточки калькулятора v1 и v2 (docs/specs/og-images.md §5.2) — оба билдера обслуживает
// рантайм-роут /api/og/calculators/[slug]: buildCalculatorOgView без query — статичная
// брендовая карточка (раздел в eyebrow, название, строка сути, полоса-акцент раздела);
// buildCalculatorResultOgView с query — результат расчёта из share-ссылки. File-convention
// opengraph-image.tsx, который раньше рисовал v1 на билде, убрали в Ф4: он каскадится на
// вложенный саброут share/ и перебивал бы его собственный config-based og:image (§6, таблица
// «Два механизма доставки»).

const TITLE_MAX_LENGTH = 54;
const DESCRIPTION_MAX_LENGTH = 118;

// Уровень-400/500 Tailwind-палитры (accentClassName калькулятора — левая цветная
// граница вида «border-l-amber-400»). Иконки на калькулятор в данных нет, поэтому
// единственный визуальный акцент — этот цвет. Неизвестный класс → бренд-изумруд.
const TAILWIND_ACCENTS: Record<string, string> = {
  "amber-400": "#fbbf24",
  "blue-400": "#60a5fa",
  "cyan-400": "#22d3ee",
  "emerald-400": "#34d399",
  "fuchsia-400": "#e879f9",
  "green-500": "#22c55e",
  "indigo-400": "#818cf8",
  "lime-400": "#a3e635",
  "orange-400": "#fb923c",
  "rose-400": "#fb7185",
  "sky-400": "#38bdf8",
  "teal-400": "#2dd4bf",
  "violet-400": "#a78bfa",
  "yellow-500": "#eab308",
  "zinc-400": "#a1a1aa"
};

const resolveAccentColor = (accentClassName: string): string => {
  const token = accentClassName.match(/border-l-([a-z]+-\d+)/)?.[1];
  return (token && TAILWIND_ACCENTS[token]) || OG_COLORS.accent;
};

// Лимиты для карточки v2 (result.stats — произвольный пользовательский текст
// из движка калькулятора, в отличие от статичного каталога у v1).
const STAT_LABEL_MAX_LENGTH = 26;
const STAT_VALUE_MAX_LENGTH = 18;

// Стат дублирует subtitle целиком (и label, и value уже сказаны в строке под заголовком) —
// в IBU так у BU:GU: helper primary уже несёт "BU:GU 0.70 — сбалансированное", и одноимённый
// стат из result.stats слово-в-слово повторял бы его на карточке. Сравниваем со стрипнутыми
// (без эмодзи), но не обрезанными по длине версиями — дедуп не должен зависеть от того,
// влез ли subtitle в лимит символов.
const isDuplicateOfSubtitle = (stat: CalculatorResult["stats"][number], subtitleRaw: string): boolean => {
  const label = stripUnsupportedGlyphs(stat.label);
  const value = stripUnsupportedGlyphs(stat.value);
  return Boolean(label && value && subtitleRaw.includes(label) && subtitleRaw.includes(value));
};

/**
 * Карточка калькулятора v2 (docs/specs/og-images.md §5.2): результат расчёта
 * из share-ссылки вместо статичного описания. primary — крупно (title),
 * его label+helper — под ним (subtitle), остальные stats — строкой ячеек.
 *
 * Две доводки под реальный движок (не синтетические stats из тестовых фикстур):
 * — стат, целиком дублирующий subtitle (и label, и value уже в нём), выбрасывается ДО среза
 *   на 3 ячейки — иначе он занимал бы место и в карточке IBU был бы виден дважды (subtitle
 *   "BU:GU 0.70 — ..." + отдельная ячейка "BU:GU 0.70");
 * — в подпись ячейки подмешивается stat.helper (label = "label · helper"): у вкладов внесений
 *   IBU helper несёт реальные входы ("20 г · 60 мин"), без него несколько строк "Кипячение"
 *   на карточке неотличимы друг от друга.
 */
export const buildCalculatorResultOgView = (
  item: CalculatorCatalogItem,
  result: CalculatorResult,
  opts: { domain: string; wordmark: string }
): OgCardView => {
  const title = truncateForCard(stripUnsupportedGlyphs(result.primary.value) || "—", TITLE_MAX_LENGTH);

  const subtitleParts = [result.primary.label, result.primary.helper].filter(
    (part): part is string => Boolean(part)
  );
  const subtitleRaw = stripUnsupportedGlyphs(subtitleParts.join(" · "));
  const subtitle = subtitleRaw ? truncateForCard(subtitleRaw, DESCRIPTION_MAX_LENGTH) : null;

  const stats: OgStat[] = result.stats
    .filter((stat) => !isDuplicateOfSubtitle(stat, subtitleRaw))
    .slice(0, 3)
    .map((stat) => ({
      label: truncateForCard(
        stripUnsupportedGlyphs([stat.label, stat.helper].filter(Boolean).join(" · ")),
        STAT_LABEL_MAX_LENGTH
      ),
      value: truncateForCard(stripUnsupportedGlyphs(stat.value), STAT_VALUE_MAX_LENGTH)
    }))
    .filter((stat) => stat.label && stat.value);

  return {
    eyebrow: `Калькулятор · ${item.shortTitle}`,
    title,
    titleFontSize: resolveTitleFontSize(title),
    subtitle,
    stats: stats.length > 0 ? stats : undefined,
    strip: { kind: "solid", color: resolveAccentColor(item.accentClassName) },
    domain: opts.domain,
    wordmark: opts.wordmark
  };
};

export const buildCalculatorOgView = (
  item: CalculatorCatalogItem,
  opts: { domain: string; wordmark: string }
): OgCardView => {
  const title = truncateForCard(stripUnsupportedGlyphs(item.title) || "Калькулятор", TITLE_MAX_LENGTH);

  return {
    eyebrow: `Калькулятор · ${item.section}`,
    title,
    titleFontSize: resolveTitleFontSize(title),
    subtitle: item.description ? truncateForCard(item.description, DESCRIPTION_MAX_LENGTH) : null,
    strip: { kind: "solid", color: resolveAccentColor(item.accentClassName) },
    domain: opts.domain,
    wordmark: opts.wordmark
  };
};
