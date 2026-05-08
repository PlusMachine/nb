import rawBjcpStyles from "./bjcp-2021.raw.json";
import { searchBjcpStyles } from "./search";
import type { BeerStyle, NumericRange, StyleRange } from "./types";

type RawVitalStatistics = {
  OG?: string;
  FG?: string;
  IBUs?: string;
  SRM?: string;
  ABV?: string;
};

type RawBjcpStyle = {
  style_key: string;
  bjcp_id: string;
  full_bjcp_id?: string | null;
  category_id?: string | null;
  category_ru?: string | null;
  name: string;
  name_ru?: string | null;
  family: string | null;
  family_ru?: string | null;
  family_names_ru?: string[];
  family_names_en?: string[];
  badges_ru?: string[];
  vital_statistics_raw: string | null;
  vital_statistics: RawVitalStatistics | null;
};

const slugify = (value: string) => (
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
);

// Keep this slug format aligned with the BJCP article routes in @nb/content.
const slugifyBjcpArticleSegment = (value: string) => (
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
);

const parseNumericRange = (value: string | null | undefined): NumericRange | null => {
  if (!value) {
    return null;
  }

  const match = value
    .replace(/%/g, "")
    .match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  return {
    min: Number(match[1]),
    max: Number(match[2])
  };
};

const rawVitalStatisticLabels: Record<keyof RawVitalStatistics, string> = {
  OG: "OG",
  FG: "FG",
  IBUs: "IBUs?",
  SRM: "SRM",
  ABV: "ABV"
};

const getRawVitalStatistic = (raw: string | null | undefined, key: keyof RawVitalStatistics) => {
  if (!raw) {
    return null;
  }
  if (/\b(variable|varies|vary|same as|depending)\b/i.test(raw)) {
    return null;
  }

  const label = rawVitalStatisticLabels[key];
  const match = raw
    .replace(/–/g, "-")
    .match(new RegExp(`${label}:\\s*(-?\\d+(?:\\.\\d+)?)\\s*-\\s*(-?\\d+(?:\\.\\d+)?%?)`, "i"));

  return match ? `${match[1]} - ${match[2]}` : null;
};

const getVitalStatistic = (style: RawBjcpStyle, key: keyof RawVitalStatistics) => (
  style.vital_statistics?.[key] ?? getRawVitalStatistic(style.vital_statistics_raw, key)
);

const rawStyleFixtures = rawBjcpStyles as RawBjcpStyle[];

const getNormalizedStyleId = (style: RawBjcpStyle) => {
  const bjcpId = style.bjcp_id.trim();
  const fullBjcpId = style.full_bjcp_id?.trim() || bjcpId;

  if (fullBjcpId === bjcpId) {
    return bjcpId;
  }

  // Keep saved recipe IDs stable for BJCP substyles that share an official parent code.
  return `${bjcpId}-${slugify(style.name)}`;
};

export const beerStyleFixtures: BeerStyle[] = rawStyleFixtures.map((style) => ({
  id: getNormalizedStyleId(style),
  bjcpId: style.bjcp_id.trim(),
  styleKey: style.full_bjcp_id?.trim() || style.bjcp_id.trim(),
  name: style.name.trim(),
  nameRu: style.name_ru?.trim() || null,
  family: style.family?.trim() || null,
  familyRu: style.family_ru?.trim() || null,
  familyNamesRu: style.family_names_ru ?? [],
  familyNamesEn: style.family_names_en ?? [],
  categoryId: style.category_id?.trim() || null,
  categoryNameRu: style.category_ru?.trim() || null,
  badgesRu: style.badges_ru ?? [],
  og: parseNumericRange(getVitalStatistic(style, "OG")),
  fg: parseNumericRange(getVitalStatistic(style, "FG")),
  abv: parseNumericRange(getVitalStatistic(style, "ABV")),
  ibu: parseNumericRange(getVitalStatistic(style, "IBUs")),
  colorSrm: parseNumericRange(getVitalStatistic(style, "SRM"))
}));

export const hasStyleRange = (style: BeerStyle): style is StyleRange => (
  style.og !== null
  && style.fg !== null
  && style.abv !== null
  && style.ibu !== null
  && style.colorSrm !== null
);

export const styleRangeFixtures: StyleRange[] = beerStyleFixtures.filter(hasStyleRange);

const legacyStyleAliases: StyleRange[] = [
  {
    id: "american-pale-ale",
    bjcpId: "LEGACY",
    name: "American Pale Ale",
    family: "Legacy catalog",
    og: { min: 1.045, max: 1.06 },
    fg: { min: 1.01, max: 1.015 },
    abv: { min: 4.5, max: 6.2 },
    ibu: { min: 30, max: 50 },
    colorSrm: { min: 5, max: 10 }
  },
  {
    id: "dry-stout",
    bjcpId: "LEGACY",
    name: "Dry Stout",
    family: "Legacy catalog",
    og: { min: 1.036, max: 1.044 },
    fg: { min: 1.007, max: 1.011 },
    abv: { min: 4.0, max: 5.0 },
    ibu: { min: 25, max: 45 },
    colorSrm: { min: 25, max: 40 }
  }
];

const buildStyleLookupEntries = <T extends BeerStyle>(styles: T[]) => styles.flatMap((style) => {
  const entries: Array<readonly [string, T]> = [[style.id, style]];
  if (style.styleKey && style.styleKey !== style.id) {
    entries.push([style.styleKey, style]);
  }
  return entries;
});

const beerStylesById = new Map([
  ...buildStyleLookupEntries(beerStyleFixtures),
  ...legacyStyleAliases.map((style) => [style.id, style] as const)
]);
const styleRangesById = new Map([
  ...buildStyleLookupEntries(styleRangeFixtures),
  ...legacyStyleAliases.map((style) => [style.id, style] as const)
]);

export const getBeerStyleById = (id: string | null | undefined) => (
  id ? beerStylesById.get(id) ?? null : null
);

export const getStyleRangeById = (id: string | null | undefined) => (
  id ? styleRangesById.get(id) ?? null : null
);

export const buildBjcpArticleSlug = (
  style: Pick<BeerStyle, "id" | "bjcpId" | "styleKey" | "name"> | null | undefined
) => {
  if (!style || style.bjcpId === "LEGACY") {
    return null;
  }

  const titleSlug = slugifyBjcpArticleSegment(style.name);
  const rawId = style.styleKey ?? (style.id === style.bjcpId ? style.bjcpId : `${style.bjcpId}-${style.name}`);
  const idSlug = slugifyBjcpArticleSegment(rawId);
  if (!idSlug) {
    return null;
  }

  if (!titleSlug || idSlug.endsWith(titleSlug)) {
    return `bjcp-${idSlug}`;
  }

  return `bjcp-${idSlug}-${titleSlug}`;
};

export const getBjcpArticleHrefByStyleId = (id: string | null | undefined) => {
  const slug = buildBjcpArticleSlug(getBeerStyleById(id));
  return slug ? `/bjcp/${slug}` : null;
};

export const searchBeerStyles = (query: string, options: { limit?: number } = {}) => (
  searchBjcpStyles(beerStyleFixtures, query, options).map(({ item }) => item)
);
