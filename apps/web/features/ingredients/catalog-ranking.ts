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
