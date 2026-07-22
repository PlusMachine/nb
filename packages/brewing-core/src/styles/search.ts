import {
  buildLayoutQueryVariants,
  buildSearchQueryVariants,
  foldSearchDiacritics,
  normalizeSearchText
} from "@nb/search";

import type { NumericRange } from "./types";

export type BjcpStyleSearchEntry = {
  id?: string;
  bjcpId: string;
  styleKey?: string | null;
  name?: string;
  nameRu?: string | null;
  nameEn?: string | null;
  title?: string;
  titleEn?: string;
  family?: string | null;
  familyRu?: string | null;
  familyNameRu?: string | null;
  familyNameEn?: string | null;
  familyNamesRu?: string[];
  familyNamesEn?: string[];
  categoryId?: string | null;
  categoryNameRu?: string | null;
  badgesRu?: string[];
  searchAliases?: string[];
  og?: NumericRange | null;
  fg?: NumericRange | null;
  abv?: NumericRange | null;
  ibu?: NumericRange | null;
  colorSrm?: NumericRange | null;
};

export type BjcpStyleSearchResult<T extends BjcpStyleSearchEntry> = {
  item: T;
  score: number;
};

const tokenVariantGroups = [
  ["pil", "pils", "pilsen", "pilsner", "pilsener", "пилс", "пилснер", "пилсен", "пильзнер", "пильзен", "пильзенер", "пилзнер", "пильсен", "пилзен", "пилзенер"],
  ["wit", "witbier", "blanche", "бланш", "вит", "витбир"],
  ["kolsch", "kölsch", "kelsch", "кельш"],
  ["hazy", "hazy ipa", "neipa", "new england", "new england ipa", "хейзи", "неипа", "нэипа"]
] as const;

const styleAliasMap: Record<string, string[]> = {
  "5B": ["kolsch", "kölsch", "кельш"],
  "10A": ["weissbier", "weizen", "вайцен", "вайценбир", "hefeweizen"],
  "10B": ["dunkelweizen", "dunkles weissbier", "тёмный вайцен", "дункельвайцен"],
  "10C": ["weizenbock", "вайценбок"],
  "12C": ["english ipa"],
  "21A": ["american ipa", "west coast ipa"],
  "21C": ["hazy ipa", "new england ipa", "new england", "neipa", "неипа", "нэипа"],
  "21B": ["specialty ipa", "специальный ipa"],
  "21B-Belgian IPA": ["belgian ipa", "бельгийский ipa"],
  "21B-Black IPA": ["black ipa", "черный ipa", "чёрный ipa"],
  "21B-Brown IPA": ["brown ipa", "коричневый ipa"],
  "21B-Red IPA": ["red ipa", "красный ipa"],
  "21B-Rye IPA": ["rye ipa", "ржаной ipa"],
  "21B-White IPA": ["white ipa", "белый ipa"],
  "21B-Brut IPA": ["brut ipa", "брют ipa", "брют-ipa"],
  "24A": ["witbier", "blanche", "бланш", "витбир", "вит"],
  "25A": ["saison"],
  "27A": ["gose", "гозе"],
  "23G": ["gose", "гозе"],
  "27B": ["gueuze", "геуз"],
  "23E": ["gueuze", "геуз"],
  "27C": ["lambic", "ламбик"],
  "23D": ["lambic", "ламбик"],
  "27D": ["fruit lambic", "fruit lambiek", "фруктовый ламбик"],
  "23F": ["fruit lambic", "fruit lambiek", "фруктовый ламбик"],
  "31A": ["alternative grain beer", "альтернативные зерновые"],
  "32A": ["kvass", "квас"],
  "27-Piwo-Grodziskie": ["piwo grodziskie", "grätzer", "гродзиское", "гродзиский"],
  "X5": ["piwo grodziskie", "grätzer", "гродзиское", "гродзиский"]
};

export const foldBjcpSearchDiacritics = foldSearchDiacritics;

export const normalizeBjcpSearchText = normalizeSearchText;

const dedupe = (values: Array<string | null | undefined>) => {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeBjcpSearchText(foldBjcpSearchDiacritics(value ?? ""));
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    out.push(value!.trim());
  }

  return out;
};

export const buildBjcpQueryVariants = (query: string) => buildSearchQueryVariants(query, {
  tokenVariantGroups
});

// Wrong-layout typing ("lf,tk" instead of "дуббель") is a rescue path, not a first-class one:
// applied to every query it turns "дуб" into "le" and floods the results with junk substrings.
export const buildBjcpLayoutQueryVariants = (query: string) => buildLayoutQueryVariants(query, {
  tokenVariantGroups
});

// Substrings shorter than this match too much noise ("ду" inside "Дунклес") to be worth ranking.
const minContainsVariantLength = 4;

const hasWordPrefix = (candidate: string, variant: string) => (
  candidate
    .split(" ")
    .some((word, index) => index > 0 && word.startsWith(variant))
);

export const scoreBjcpSearchText = (
  candidate: string,
  variant: string,
  exactScore: number,
  prefixScore: number,
  containsScore: number
) => {
  const normalizedCandidate = normalizeBjcpSearchText(foldBjcpSearchDiacritics(candidate));
  if (!normalizedCandidate || !variant) {
    return 0;
  }
  if (normalizedCandidate === variant) {
    return exactScore;
  }
  if (normalizedCandidate.startsWith(variant)) {
    return prefixScore;
  }
  if (containsScore <= 0) {
    return 0;
  }
  // "дуб" in "Бельгийский дуббель" is a real hit, not an accidental substring.
  if (hasWordPrefix(normalizedCandidate, variant)) {
    return Math.round(prefixScore * 0.92);
  }
  if (variant.length >= minContainsVariantLength && normalizedCandidate.includes(variant)) {
    return containsScore;
  }
  return 0;
};

const getAliasKeys = (style: BjcpStyleSearchEntry) => dedupe([
  style.id,
  style.bjcpId,
  style.styleKey
]);

const getPrimaryName = (style: BjcpStyleSearchEntry) => (
  style.nameRu
  ?? style.title
  ?? style.name
  ?? style.nameEn
  ?? style.titleEn
  ?? style.bjcpId
);

const getEnglishName = (style: BjcpStyleSearchEntry) => (
  style.nameEn
  ?? style.titleEn
  ?? style.name
  ?? null
);

const buildSearchTerms = (style: BjcpStyleSearchEntry) => {
  const aliasKeys = getAliasKeys(style);
  const explicitAliases = aliasKeys.flatMap((key) => styleAliasMap[key] ?? []);
  const englishName = getEnglishName(style);

  return {
    exact: dedupe([
      style.id,
      style.bjcpId,
      style.styleKey,
      style.name,
      style.nameRu,
      style.nameEn,
      style.title,
      style.titleEn,
      englishName ? foldBjcpSearchDiacritics(englishName) : null,
      ...(style.searchAliases ?? []),
      ...explicitAliases
    ]),
    family: dedupe([
      style.family,
      style.familyRu,
      style.familyNameRu,
      style.familyNameEn,
      ...(style.familyNamesRu ?? []),
      ...(style.familyNamesEn ?? [])
    ]),
    category: dedupe([
      style.categoryId,
      style.categoryNameRu
    ]),
    badges: style.badgesRu ?? []
  };
};

export const scoreBjcpStyle = (
  style: BjcpStyleSearchEntry,
  query: string,
  options: { variants?: string[] } = {}
) => {
  const variants = options.variants ?? buildBjcpQueryVariants(foldBjcpSearchDiacritics(query));
  let score = 0;
  const terms = buildSearchTerms(style);

  for (const variant of variants) {
    score = Math.max(score, scoreBjcpSearchText(style.bjcpId, variant, 1200, 980, 0));
    if (style.styleKey) {
      score = Math.max(score, scoreBjcpSearchText(style.styleKey, variant, 1180, 940, 0));
    }

    for (const candidate of terms.exact) {
      score = Math.max(score, scoreBjcpSearchText(candidate, variant, 1100, 860, 720));
    }

    for (const candidate of terms.family) {
      score = Math.max(score, scoreBjcpSearchText(candidate, variant, 420, 360, 280));
    }

    for (const candidate of terms.category) {
      score = Math.max(score, scoreBjcpSearchText(candidate, variant, 380, 320, 240));
    }

    for (const candidate of terms.badges) {
      score = Math.max(score, scoreBjcpSearchText(candidate, variant, 260, 220, 180));
    }
  }

  return score;
};

const styleOrderCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export const searchBjcpStyles = <T extends BjcpStyleSearchEntry>(
  styles: T[],
  query: string,
  options: { limit?: number } = {}
): Array<BjcpStyleSearchResult<T>> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return styles.map((item) => ({ item, score: 0 }));
  }

  const folded = foldBjcpSearchDiacritics(trimmed);
  const runPass = (variants: string[]) => styles
    .map((item) => ({ item, score: scoreBjcpStyle(item, trimmed, { variants }) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => (
      right.score - left.score
      || styleOrderCollator.compare(left.item.bjcpId, right.item.bjcpId)
    ));

  let results = runPass(buildBjcpQueryVariants(folded));
  if (!results.length) {
    const layoutVariants = buildBjcpLayoutQueryVariants(folded);
    if (layoutVariants.length) {
      results = runPass(layoutVariants);
    }
  }

  return typeof options.limit === "number" ? results.slice(0, options.limit) : results;
};

export const getBjcpStyleDisplayName = (style: BjcpStyleSearchEntry) => getPrimaryName(style);
