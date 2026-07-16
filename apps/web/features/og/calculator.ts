import type { CalculatorCatalogItem } from "@/features/calculators/catalog";

import type { OgCardView } from "./models";
import { OG_COLORS, resolveTitleFontSize, stripUnsupportedGlyphs, truncateForCard } from "./theme";

// Карточка калькулятора v1 (docs/specs/og-images.md §5.2). Статичная брендовая:
// раздел в eyebrow, название, строка сути, полоса-акцент раздела. Генерится на
// билде через file-convention opengraph-image.tsx (роут SSG, searchParams не
// читает). Результат расчёта в карточке — это v2 (Ф4), здесь его нет.

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
