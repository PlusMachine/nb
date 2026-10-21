import type { RankedCandidate } from "../../features/ingredients/ranking";

// Fixed inputs for the pre-optimization baseline. Changes to matching policy
// require an explicit review of the expected results, not a snapshot refresh.
export const rankingCandidates: Array<RankedCandidate & { id: string }> = [
  { id: "citra", category: "hop", displayName: "Citra", nameRu: "Цитра", nameEn: "Citra", aliases: ["HBC 394"], brandName: "Yakima Chief", source: "catalog" },
  { id: "citra-cryo", category: "hop", displayName: "Citra Cryo", nameEn: "Citra Cryo", brandName: "Yakima Chief", source: "catalog", isFavorite: true },
  { id: "extra", category: "fermentable", displayName: "Extra", nameRu: "Экстра", nameEn: "Extra", source: "custom", isFavorite: true },
  { id: "mosaic", category: "hop", displayName: "Мозаик", nameRu: "Мозаик", nameEn: "Mosaic", aliases: ["мозайк"], source: "catalog" },
  { id: "pilsner", category: "fermentable", displayName: "Пилснер", nameRu: "Пилснер", nameEn: "Pilsner", brandName: "Курский солод", source: "catalog", brandMarketCount: 10 },
  { id: "pilsner-premium", category: "fermentable", displayName: "Пилснер премиум", nameEn: "Pilsner Premium", brandName: "Курский солод", source: "catalog" },
  { id: "best-pilsen", category: "fermentable", displayName: "BEST Pilsen", nameEn: "BEST Pilsen", aliases: [{ alias: "пилснер", aliasNormalized: "пилснер", isEnabled: true }], brandName: "BESTMALZ", source: "catalog", isFavorite: true, inventoryUsageCount: 2, recipeUsageCount: 3 },
  { id: "caramel-pilsen", category: "fermentable", displayName: "Caramel Pilsen", nameEn: "Caramel Pilsen", brandName: "Castle Malting", source: "catalog" },
  { id: "custom-pilsner", category: "fermentable", displayName: "Пилснер", nameEn: "Pilsner", source: "custom", isFavorite: true, inventoryUsageCount: 3 },
  { id: "support-alias", category: "fermentable", displayName: "Base Malt", aliases: [{ alias: "пилснер база", source: "manual" }], source: "custom", isFavorite: true },
  { id: "disabled-alias", category: "hop", displayName: "Saaz", aliases: [{ alias: "zzqhiddenalias", aliasNormalized: "zzqhiddenalias", isEnabled: false }], source: "catalog" },
  { id: "us-05", category: "yeast", displayName: "US-05", nameEn: "SafAle US-05", productCode: "US-05", aliases: ["US05", "ЮС-05"], brandName: "Fermentis", source: "catalog" },
  { id: "wlp002", category: "yeast", displayName: "English Ale", productCode: "WLP002", brandName: "White Labs", source: "catalog" },
  { id: "honey", category: "fermentable", displayName: "Мёд", nameRu: "Мёд", nameEn: "Honey", source: "catalog" },
  { id: "munich", category: "fermentable", displayName: "Мюнхенский", nameEn: "Munich Malt", brandName: "Weyermann", source: "catalog" },
  { id: "pbw", category: "consumable", displayName: "Щелочная мойка PBW", nameEn: "PBW Cleaner", brandName: "Five Star", aliases: [{ alias: "alkaline cleaner", source: "priority_term" }], source: "catalog", packageVariants: [{ id: "pbw-500", brand: "Five Star", productNameEn: "PBW Cleaner", packageAmount: 500, packageUnit: "g" }] },
  { id: "cleaner", category: "consumable", displayName: "Щелочная мойка", nameEn: "Alkaline Cleaner", brandName: "KegLand", searchTextNorm: "щелочная мойка alkaline cleaner pbw", source: "catalog" },
  { id: "salt", category: "water_treatment", displayName: "Хлорид кальция", nameEn: "Calcium Chloride", source: "catalog" }
];

export const rankingQueries = [
  "citra", "цитра", "citta", "citro", "HBC 394", "мозаик", "mosaic", "мозайк", "vjpfbr",
  "пилс", "pils", "пилснер", "pilsner", "курский пилс", "чешский пилснер", "пилснер премиум",
  "BESTMALZ", "Weyermann", "US-05", "US 05", "US05", "wlp002", "мед", "мёд", "munich",
  "pbw", "alkaline cleaner", "five star 500 g", "хлорид кальция", "zzqhiddenalias", "qqqzzz", "!!!", "", "  "
];
