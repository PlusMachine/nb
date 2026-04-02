import type { BeerColorBand, BjcpCatalogStyle, BjcpUiColorHint } from "@nb/content";

import { beerColorFromSrm } from "@/features/recipes/beer-color";

export type BjcpCardStatKey = "abv" | "ibu" | "srm";

export type BjcpCardStatDisplay = {
  value: string;
  isFallback: boolean;
  rawValue: string | null;
};

export type BjcpCardColorInfo = BjcpCardStatDisplay & {
  startHex: string;
  averageHex: string;
  endHex: string;
};

const shortStatFallbackLabels = {
  missing: "не указано",
  sameAsBase: "как база",
  byBase: "по базе",
  strongerThanBase: "крепче базы",
  darkerThanBase: "темнее базы",
  bySubtype: "по подстилю",
  byDeclaredBeer: "по заявленному"
} as const;

type BjcpCardColorRamp = Pick<BjcpCardColorInfo, "startHex" | "averageHex" | "endHex">;

const colorBandFallback: Record<BeerColorBand, BjcpCardColorRamp> = {
  straw: { startHex: "#FEF3C7", averageHex: "#FDE68A", endHex: "#FBBF24" },
  gold: { startHex: "#FDE68A", averageHex: "#FBBF24", endHex: "#D97706" },
  amber: { startHex: "#F59E0B", averageHex: "#D97706", endHex: "#92400E" },
  copper: { startHex: "#C2410C", averageHex: "#9A3412", endHex: "#7C2D12" },
  brown: { startHex: "#92400E", averageHex: "#6B3410", endHex: "#451A03" },
  dark: { startHex: "#7C4A24", averageHex: "#4B2E17", endHex: "#1C1917" }
};

const themedColorFallback: Record<BjcpUiColorHint, BjcpCardColorRamp> = {
  "autumn-amber": { startHex: "#FBBF24", averageHex: "#D97706", endHex: "#92400E" },
  "blended-spectrum": { startHex: "#FDE68A", averageHex: "#FB7185", endHex: "#7C3AED" },
  "declared-spectrum": { startHex: "#FDE68A", averageHex: "#F59E0B", endHex: "#92400E" },
  "experimental-spectrum": { startHex: "#F59E0B", averageHex: "#EC4899", endHex: "#7C3AED" },
  "fruit-spectrum": { startHex: "#FDE047", averageHex: "#FB923C", endHex: "#F43F5E" },
  "fruit-spice-spectrum": { startHex: "#FDBA74", averageHex: "#F97316", endHex: "#DC2626" },
  "grain-harvest": { startHex: "#FDE047", averageHex: "#D97706", endHex: "#92400E" },
  "hop-spectrum": { startHex: "#D9F99D", averageHex: "#FACC15", endHex: "#F97316" },
  "lager-hazy": { startHex: "#FDE68A", averageHex: "#FBBF24", endHex: "#D97706" },
  "smoke-malt": { startHex: "#D6A968", averageHex: "#8B5E3C", endHex: "#3F2514" },
  "sour-spectrum": { startHex: "#FEF3C7", averageHex: "#F59E0B", endHex: "#E11D48" },
  "spice-garden": { startHex: "#F59E0B", averageHex: "#84CC16", endHex: "#DC2626" },
  "sugar-caramel": { startHex: "#FEF3C7", averageHex: "#D97706", endHex: "#6B3410" },
  "wild-ale-spectrum": { startHex: "#FEF3C7", averageHex: "#FB923C", endHex: "#F43F5E" },
  "winter-spice": { startHex: "#F59E0B", averageHex: "#7C2D12", endHex: "#1C1917" },
  "wood-barrel": { startHex: "#EAB308", averageHex: "#A16207", endHex: "#4B2E17" }
};

const parseStatNumbers = (value?: string | null) => (
  value?.match(/\d+(?:\.\d+)?/g)?.map((item) => Number.parseFloat(item)).filter((item) => Number.isFinite(item)) ?? []
);

const isNumericStatValue = (value: string) => (
  parseStatNumbers(value).length > 0 && !/[A-Za-zА-Яа-я]/u.test(value)
);

const formatNumber = (value: number) => value.toFixed(1).replace(/\.0$/, "");

const normalizeDescriptor = (value: string) => value
  .toLowerCase()
  .replace(/[–—]/gu, "-")
  .replace(/\s+/gu, " ")
  .replace(/[.\s]+$/u, "")
  .trim();

const resolveRawStatValue = (style: BjcpCatalogStyle, key: BjcpCardStatKey) => {
  switch (key) {
    case "abv":
      return style.vitalStatistics.abv;
    case "ibu":
      return style.vitalStatistics.ibu;
    case "srm":
      return style.vitalStatistics.srm;
  }
};

const resolveShortDescriptor = (key: BjcpCardStatKey, value: string) => {
  const normalized = normalizeDescriptor(value);

  if (normalized === "same as base style") {
    return shortStatFallbackLabels.sameAsBase;
  }

  if (normalized.startsWith("variable by type, see individual styles")) {
    return shortStatFallbackLabels.bySubtype;
  }

  if (normalized.startsWith("og, fg, ibus, srm, and abv will vary depending on the declared beer")) {
    return shortStatFallbackLabels.byDeclaredBeer;
  }

  if (
    normalized === "variable by base style"
    || normalized === "varies with the base beer style"
    || normalized === "varies with base style"
    || normalized.startsWith("og, fg, ibus, srm, and abv will vary depending on the underlying base beer")
  ) {
    if (
      key === "abv"
      && (
        normalized.includes("typically above-average")
        || normalized.includes("above 5%")
        || normalized.includes("above 6%")
      )
    ) {
      return shortStatFallbackLabels.strongerThanBase;
    }

    if (
      key === "srm"
      && (
        normalized.includes("often darker")
        || normalized.includes("darker than")
      )
    ) {
      return shortStatFallbackLabels.darkerThanBase;
    }

    return shortStatFallbackLabels.byBase;
  }

  if (normalized === "varies with base style, typically above-average") {
    return key === "abv" ? shortStatFallbackLabels.strongerThanBase : shortStatFallbackLabels.byBase;
  }

  if (normalized === "varies with base style, often darker than the unadulterated base style") {
    return key === "srm" ? shortStatFallbackLabels.darkerThanBase : shortStatFallbackLabels.byBase;
  }

  return shortStatFallbackLabels.missing;
};

const getCompactNumericSummary = (key: BjcpCardStatKey, value: string) => {
  const numbers = parseStatNumbers(value);

  if (!numbers.length) {
    return null;
  }

  const first = formatNumber(numbers[0]!);
  const last = formatNumber(numbers[numbers.length - 1]!);

  if (key === "abv") {
    return first === last ? `${first}%` : `${first} – ${last}%`;
  }

  return first === last ? first : `${first} – ${last}`;
};

export const getBjcpCardStatDisplay = (style: BjcpCatalogStyle, key: BjcpCardStatKey): BjcpCardStatDisplay => {
  const rawValue = resolveRawStatValue(style, key);

  if (rawValue) {
    if (isNumericStatValue(rawValue)) {
      return { value: rawValue, isFallback: false, rawValue };
    }

    const descriptor = resolveShortDescriptor(key, rawValue);
    if (descriptor !== shortStatFallbackLabels.missing) {
      return { value: descriptor, isFallback: true, rawValue };
    }

    const compactNumericSummary = getCompactNumericSummary(key, rawValue);
    if (compactNumericSummary) {
      return { value: compactNumericSummary, isFallback: false, rawValue };
    }

    return { value: shortStatFallbackLabels.missing, isFallback: true, rawValue };
  }

  if (
    key === "abv"
    && (style.vitalStatistics.sessionAbv || style.vitalStatistics.standardAbv || style.vitalStatistics.doubleAbv)
  ) {
    return {
      value: shortStatFallbackLabels.bySubtype,
      isFallback: true,
      rawValue: null
    };
  }

  const note = style.vitalStatistics.note ?? style.vitalStatisticsText;
  if (note) {
    return {
      value: resolveShortDescriptor(key, note),
      isFallback: true,
      rawValue: note
    };
  }

  return {
    value: shortStatFallbackLabels.missing,
    isFallback: true,
    rawValue: null
  };
};

const hasBadge = (style: BjcpCatalogStyle, label: string) => style.badgesRu.includes(label);

const resolveSemanticColorHint = (
  style: BjcpCatalogStyle,
  descriptor: string | null
): BjcpUiColorHint | null => {
  if (style.uiColorHint) {
    return style.uiColorHint;
  }

  const normalized = descriptor ? normalizeDescriptor(descriptor) : "";
  const isFruit = hasBadge(style, "Фруктовое");
  const isSpice = hasBadge(style, "Пряное");
  const isWoodAged = hasBadge(style, "Выдержка в дереве/бочке");
  const isSmoked = hasBadge(style, "Копчёное");
  const isSourOrWild = style.familyId === "sour_wild" || hasBadge(style, "Кислое") || hasBadge(style, "Дикое/смешанное брожение");

  if (normalized.includes("amber-copper")) {
    return "autumn-amber";
  }

  if (isFruit && isSpice) {
    return "fruit-spice-spectrum";
  }

  if (isFruit) {
    return isSourOrWild ? "wild-ale-spectrum" : "fruit-spectrum";
  }

  if (isWoodAged) {
    return "wood-barrel";
  }

  if (isSmoked) {
    return "smoke-malt";
  }

  if (normalized.includes("dark") || normalized.includes("darker") || normalized.includes("темн") || normalized.includes("тёмн")) {
    return isSpice ? "winter-spice" : "wood-barrel";
  }

  if (isSourOrWild) {
    return "sour-spectrum";
  }

  if (isSpice) {
    return "spice-garden";
  }

  if (style.familyId === "ipa_hoppy") {
    return "hop-spectrum";
  }

  if (style.familyId === "wheat_grain") {
    return "grain-harvest";
  }

  if (normalized.includes("declared beer")) {
    return "declared-spectrum";
  }

  return null;
};

const resolveFallbackColor = (style: BjcpCatalogStyle, descriptor: string | null) => {
  const colorHint = resolveSemanticColorHint(style, descriptor);
  return colorHint ? themedColorFallback[colorHint] : colorBandFallback[style.colorBand];
};

export const getBjcpCardColorInfo = (style: BjcpCatalogStyle): BjcpCardColorInfo => {
  const stat = getBjcpCardStatDisplay(style, "srm");
  const numbers = parseStatNumbers(stat.rawValue);

  if (!stat.isFallback && numbers.length) {
    const startSrm = numbers[0]!;
    const endSrm = numbers[numbers.length - 1]!;
    const averageSrm = numbers.reduce((sum, item) => sum + item, 0) / numbers.length;

    return {
      ...stat,
      startHex: beerColorFromSrm(startSrm).hex,
      averageHex: beerColorFromSrm(averageSrm).hex,
      endHex: beerColorFromSrm(endSrm).hex
    };
  }

  return {
    ...stat,
    ...resolveFallbackColor(style, stat.rawValue ?? stat.value)
  };
};
