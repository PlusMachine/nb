type RankedCatalogSearchItem = {
  source: "catalog" | "custom";
  primaryLabelRu: string;
};

type RankedCatalogMatch = {
  item: RankedCatalogSearchItem;
  score: number;
};

export const sortRankedCatalogItems = (
  left: RankedCatalogMatch,
  right: RankedCatalogMatch
) => (
  Number(right.item.source === "custom") - Number(left.item.source === "custom")
  || right.score - left.score
  || left.item.primaryLabelRu.localeCompare(right.item.primaryLabelRu, "ru")
);
