import rawBjcpStyles from "./bjcp-2021.raw.json";
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
  name: string;
  family: string | null;
  vital_statistics_raw: string;
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

const rawStyleFixtures = rawBjcpStyles as RawBjcpStyle[];

const bjcpIdCounts = rawStyleFixtures.reduce((counts, style) => {
  const bjcpId = style.bjcp_id.trim();
  counts.set(bjcpId, (counts.get(bjcpId) ?? 0) + 1);
  return counts;
}, new Map<string, number>());

const getNormalizedStyleId = (style: RawBjcpStyle) => {
  const bjcpId = style.bjcp_id.trim();
  if ((bjcpIdCounts.get(bjcpId) ?? 0) <= 1) {
    return bjcpId;
  }

  // Some BJCP categories in the source reuse one BJCP code across several named substyles.
  return `${bjcpId}-${slugify(style.name)}`;
};

export const beerStyleFixtures: BeerStyle[] = rawStyleFixtures.map((style) => ({
  id: getNormalizedStyleId(style),
  bjcpId: style.bjcp_id.trim(),
  name: style.name.trim(),
  family: style.family?.trim() || null,
  og: parseNumericRange(style.vital_statistics?.OG),
  fg: parseNumericRange(style.vital_statistics?.FG),
  abv: parseNumericRange(style.vital_statistics?.ABV),
  ibu: parseNumericRange(style.vital_statistics?.IBUs),
  colorSrm: parseNumericRange(style.vital_statistics?.SRM)
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

const beerStylesById = new Map([...beerStyleFixtures, ...legacyStyleAliases].map((style) => [style.id, style] as const));
const styleRangesById = new Map([...styleRangeFixtures, ...legacyStyleAliases].map((style) => [style.id, style] as const));

export const getBeerStyleById = (id: string | null | undefined) => (
  id ? beerStylesById.get(id) ?? null : null
);

export const getStyleRangeById = (id: string | null | undefined) => (
  id ? styleRangesById.get(id) ?? null : null
);

export const buildBjcpArticleSlug = (
  style: Pick<BeerStyle, "id" | "bjcpId" | "name"> | null | undefined
) => {
  if (!style || style.bjcpId === "LEGACY") {
    return null;
  }

  const titleSlug = slugifyBjcpArticleSegment(style.name);
  const rawId = style.id === style.bjcpId ? style.bjcpId : `${style.bjcpId}-${style.name}`;
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
