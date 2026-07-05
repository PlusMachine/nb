type RankedCatalogSearchItem = {
  source: "catalog" | "custom";
  primaryLabelRu: string;
  isFavorite?: boolean;
};

type RankedCatalogMatch = {
  item: RankedCatalogSearchItem;
  tier?: number;
  score: number;
};

export const sortRankedCatalogItems = (
  left: RankedCatalogMatch,
  right: RankedCatalogMatch
) => (
  (left.tier ?? 0) - (right.tier ?? 0)
  || right.score - left.score
  || Number(right.item.isFavorite === true) - Number(left.item.isFavorite === true)
  || Number(right.item.source === "custom") - Number(left.item.source === "custom")
  || left.item.primaryLabelRu.localeCompare(right.item.primaryLabelRu, "ru")
);

/**
 * Шкала приоритета совпадений — tier 0..9 (0 — лучшее совпадение). tier 8 —
 * token-scatter (все токены запроса разбросаны по полям), tier 9 — fuzzy/
 * левенштейн. У обоих matchType помечен как "token" — резать хвост нужно по
 * числовому tier, а не по matchType (иначе легко перепутать fuzzy с обычным
 * "contains").
 */
export const CATALOG_SEARCH_STRONG_TIER_MAX = 7;
export const CATALOG_SEARCH_NOISE_TIER_MIN = 8;

/**
 * Отрезает шумный token-scatter/fuzzy хвост (tier >= CATALOG_SEARCH_NOISE_TIER_MIN),
 * но только если среди результатов есть хотя бы одно сильное совпадение
 * (tier <= CATALOG_SEARCH_STRONG_TIER_MAX). Если сильных совпадений нет — хвост
 * оставляем как есть (fallback «возможно, вы имели в виду»).
 */
export const filterRankedCatalogNoise = <T extends { tier?: number }>(ranked: T[]): T[] => {
  const hasStrongMatch = ranked.some((match) => (match.tier ?? 0) <= CATALOG_SEARCH_STRONG_TIER_MAX);

  return hasStrongMatch
    ? ranked.filter((match) => (match.tier ?? 0) <= CATALOG_SEARCH_STRONG_TIER_MAX)
    : ranked;
};
