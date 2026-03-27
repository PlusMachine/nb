import { buildQueryVariants, normalizeSearchText } from "./normalization";

const levenshtein = (left: string, right: string) => {
  const rows = Array.from({ length: left.length + 1 }, (_, rowIndex) => (
    Array.from({ length: right.length + 1 }, (_, columnIndex) => (
      rowIndex === 0 ? columnIndex : columnIndex === 0 ? rowIndex : 0
    ))
  ));

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
    }
  }

  return rows[left.length][right.length];
};

const hasAllTokens = (variant: string, haystack: string) => {
  const tokens = variant.split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
};

const calcFuzzyBonus = (variant: string, targets: string[]) => {
  if (variant.length < 5) {
    return 0;
  }

  const distance = Math.min(...targets.map((target) => levenshtein(variant, target)));
  if (distance > 2) {
    return 0;
  }

  return Math.max(0, 50 - distance * 18);
};

type RankedCandidate = {
  displayName?: string;
  displayNameRu?: string | null;
  displayNameEn?: string | null;
  normalizedName?: string;
  aliases?: string[];
  displayNameNorm?: string;
  searchAliasesNorm?: string[];
  searchTextNorm?: string;
  brandName?: string | null;
  manufacturer?: string | null;
};

const normalizeCandidate = (candidate: RankedCandidate) => {
  const displayNameNorm = candidate.displayNameNorm
    ?? normalizeSearchText(candidate.displayName ?? "");
  const displayNameRuNorm = normalizeSearchText(candidate.displayNameRu ?? candidate.displayName ?? "");
  const displayNameEnNorm = normalizeSearchText(candidate.displayNameEn ?? candidate.displayName ?? "");
  const searchAliasesNorm = candidate.searchAliasesNorm
    ?? (candidate.aliases?.map((alias) => normalizeSearchText(alias)).filter(Boolean) ?? []);
  const searchTextNorm = candidate.searchTextNorm
    ?? normalizeSearchText([
      candidate.displayName ?? "",
      candidate.normalizedName ?? "",
      ...searchAliasesNorm,
      candidate.brandName ?? "",
      candidate.manufacturer ?? ""
    ].join(" "));

  return {
    displayNameNorm,
    displayNameRuNorm,
    displayNameEnNorm,
    searchAliasesNorm,
    searchTextNorm,
    brandName: candidate.brandName,
    manufacturer: candidate.manufacturer
  };
};

const scoreVariant = (variant: string, candidate: RankedCandidate) => {
  const normalizedCandidate = normalizeCandidate(candidate);
  let score = 0;
  const queryHasLatin = /[a-z]/.test(variant);
  const queryHasCyrillic = /[а-я]/.test(variant);

  if (normalizedCandidate.displayNameNorm === variant) {
    score += 110;
  }

  if (normalizedCandidate.searchAliasesNorm.includes(variant)) {
    score += 100;
  }

  if (normalizedCandidate.displayNameNorm.startsWith(variant)) {
    score += 80;
  }

  if (queryHasLatin && normalizedCandidate.displayNameEnNorm.startsWith(variant)) {
    score += 24;
  }

  if (queryHasCyrillic && normalizedCandidate.displayNameRuNorm.startsWith(variant)) {
    score += 18;
  }

  if (normalizedCandidate.searchAliasesNorm.some((alias) => alias.startsWith(variant))) {
    score += 70;
  }

  if (hasAllTokens(variant, normalizedCandidate.searchTextNorm)) {
    score += 60;
  }

  const brandTokens = [
    normalizeSearchText(normalizedCandidate.brandName ?? ""),
    normalizeSearchText(normalizedCandidate.manufacturer ?? "")
  ].filter(Boolean);

  if (brandTokens.some((brand) => variant.includes(brand) || brand.includes(variant))) {
    score += 18;
  } else if (brandTokens.some((brand) => hasAllTokens(brand, variant) || hasAllTokens(variant, brand))) {
    score += 10;
  }

  score += calcFuzzyBonus(variant, [
    normalizedCandidate.displayNameNorm,
    ...normalizedCandidate.searchAliasesNorm
  ]);

  return score;
};

export const scoreIngredientCandidate = (
  query: string | string[],
  candidate: RankedCandidate
) => {
  const variants = Array.isArray(query) ? query : buildQueryVariants(query);
  if (!variants.length) {
    return 0;
  }

  return variants.reduce((bestScore, variant) => Math.max(bestScore, scoreVariant(variant, candidate)), 0);
};
