/**
 * Справочник PPG (points per pound per gallon) и цвета (°L) для сопоставления
 * названий солодов из внешних рецептов с числами, которые ест движок.
 *
 * PPG — общепринятые значения (BeerSmith / Brewer's Friend / Palmer). Источники
 * рецептов (BYO, Brewer's Friend, AHA) почти никогда не публикуют PPG явно, зато
 * почти всегда публикуют цвет (°L) — цвет берём из рецепта, PPG отсюда.
 *
 * appliesEff=false → сахар/экстракт (100%, эффективность затирания не применяется).
 */
export type PpgEntry = { ppg: number; colorL: number; appliesEff: boolean };

// Ключ — подстрока (lowercase), матчится по «самое длинное совпадение выигрывает».
export const PPG_TABLE: Array<[string, PpgEntry]> = [
  // --- база
  ["maris otter", { ppg: 38, colorL: 3, appliesEff: true }],
  ["golden promise", { ppg: 37, colorL: 3, appliesEff: true }],
  ["pale ale malt", { ppg: 37, colorL: 3, appliesEff: true }],
  ["american 2-row", { ppg: 37, colorL: 2, appliesEff: true }],
  ["2-row", { ppg: 37, colorL: 2, appliesEff: true }],
  ["two-row", { ppg: 37, colorL: 2, appliesEff: true }],
  ["6-row", { ppg: 35, colorL: 2, appliesEff: true }],
  ["pilsner", { ppg: 37, colorL: 1.6, appliesEff: true }],
  ["pilsener", { ppg: 37, colorL: 1.6, appliesEff: true }],
  ["pils malt", { ppg: 37, colorL: 1.6, appliesEff: true }],
  ["vienna", { ppg: 35, colorL: 3.5, appliesEff: true }],
  ["munich", { ppg: 35, colorL: 9, appliesEff: true }],
  ["mild malt", { ppg: 36, colorL: 4, appliesEff: true }],
  ["pale malt", { ppg: 37, colorL: 3, appliesEff: true }],
  ["base malt", { ppg: 37, colorL: 2, appliesEff: true }],

  // --- пшеница / рожь / овёс
  ["wheat malt", { ppg: 37, colorL: 2, appliesEff: true }],
  ["white wheat", { ppg: 37, colorL: 2, appliesEff: true }],
  ["red wheat", { ppg: 37, colorL: 3, appliesEff: true }],
  ["torrified wheat", { ppg: 36, colorL: 2, appliesEff: true }],
  ["flaked wheat", { ppg: 35, colorL: 2, appliesEff: true }],
  ["rye malt", { ppg: 36, colorL: 4, appliesEff: true }],
  ["flaked rye", { ppg: 36, colorL: 3, appliesEff: true }],
  ["flaked oats", { ppg: 33, colorL: 2.2, appliesEff: true }],
  ["golden naked oats", { ppg: 33, colorL: 10, appliesEff: true }],
  ["oat malt", { ppg: 34, colorL: 3, appliesEff: true }],
  ["flaked barley", { ppg: 32, colorL: 2, appliesEff: true }],
  ["flaked corn", { ppg: 37, colorL: 1, appliesEff: true }],
  ["flaked maize", { ppg: 37, colorL: 1, appliesEff: true }],
  ["flaked rice", { ppg: 38, colorL: 1, appliesEff: true }],
  ["rice hulls", { ppg: 0, colorL: 0, appliesEff: true }],
  ["acidulated", { ppg: 33, colorL: 2, appliesEff: true }],

  // --- карамельные / кристальные
  ["carapils", { ppg: 33, colorL: 1.5, appliesEff: true }],
  ["carafoam", { ppg: 33, colorL: 1.5, appliesEff: true }],
  ["dextrin", { ppg: 33, colorL: 1.5, appliesEff: true }],
  ["caramunich", { ppg: 34, colorL: 60, appliesEff: true }],
  ["carahell", { ppg: 34, colorL: 10, appliesEff: true }],
  ["caravienne", { ppg: 34, colorL: 20, appliesEff: true }],
  ["caraaroma", { ppg: 34, colorL: 130, appliesEff: true }],
  ["caramel", { ppg: 34, colorL: 40, appliesEff: true }],
  ["crystal", { ppg: 34, colorL: 40, appliesEff: true }],
  ["special b", { ppg: 30, colorL: 180, appliesEff: true }],
  ["honey malt", { ppg: 37, colorL: 25, appliesEff: true }],
  ["melanoidin", { ppg: 33, colorL: 28, appliesEff: true }],
  ["aromatic", { ppg: 33, colorL: 20, appliesEff: true }],
  ["victory", { ppg: 34, colorL: 25, appliesEff: true }],
  ["biscuit", { ppg: 35, colorL: 25, appliesEff: true }],
  ["amber malt", { ppg: 33, colorL: 27, appliesEff: true }],
  ["brown malt", { ppg: 32, colorL: 65, appliesEff: true }],

  // --- жжёные
  ["chocolate", { ppg: 28, colorL: 350, appliesEff: true }],
  ["carafa", { ppg: 30, colorL: 400, appliesEff: true }],
  ["roasted barley", { ppg: 25, colorL: 300, appliesEff: true }],
  ["roast barley", { ppg: 25, colorL: 300, appliesEff: true }],
  ["black patent", { ppg: 25, colorL: 500, appliesEff: true }],
  ["black malt", { ppg: 25, colorL: 500, appliesEff: true }],
  ["blackprinz", { ppg: 25, colorL: 500, appliesEff: true }],
  ["midnight wheat", { ppg: 25, colorL: 550, appliesEff: true }],
  ["debittered black", { ppg: 25, colorL: 500, appliesEff: true }],

  // --- сахара / экстракты (эффективность не применяется)
  ["dme", { ppg: 44, colorL: 4, appliesEff: false }],
  ["dry malt extract", { ppg: 44, colorL: 4, appliesEff: false }],
  ["lme", { ppg: 36, colorL: 4, appliesEff: false }],
  ["liquid malt extract", { ppg: 36, colorL: 4, appliesEff: false }],
  ["malt extract", { ppg: 36, colorL: 4, appliesEff: false }],
  ["corn sugar", { ppg: 46, colorL: 0, appliesEff: false }],
  ["dextrose", { ppg: 46, colorL: 0, appliesEff: false }],
  ["table sugar", { ppg: 46, colorL: 0, appliesEff: false }],
  ["cane sugar", { ppg: 46, colorL: 0, appliesEff: false }],
  ["sucrose", { ppg: 46, colorL: 0, appliesEff: false }],
  ["candi sugar", { ppg: 38, colorL: 1, appliesEff: false }],
  ["candi syrup", { ppg: 32, colorL: 80, appliesEff: false }],
  ["candy sugar", { ppg: 38, colorL: 1, appliesEff: false }],
  ["turbinado", { ppg: 44, colorL: 10, appliesEff: false }],
  ["brown sugar", { ppg: 45, colorL: 15, appliesEff: false }],
  ["honey", { ppg: 35, colorL: 1, appliesEff: false }],
  ["lactose", { ppg: 35, colorL: 1, appliesEff: false }],
  ["maltodextrin", { ppg: 39, colorL: 0, appliesEff: false }],
  ["molasses", { ppg: 36, colorL: 80, appliesEff: false }],
  ["sugar", { ppg: 46, colorL: 0, appliesEff: false }]
];

export const resolveFermentable = (name: string, type?: string | null): PpgEntry | null => {
  const key = name.toLowerCase();
  let best: { len: number; entry: PpgEntry } | null = null;
  for (const [pattern, entry] of PPG_TABLE) {
    if (key.includes(pattern) && (!best || pattern.length > best.len)) {
      best = { len: pattern.length, entry };
    }
  }
  if (best) return best.entry;
  if (type === "sugar") return { ppg: 46, colorL: 0, appliesEff: false };
  if (type === "extract") return { ppg: 44, colorL: 4, appliesEff: false };
  return null;
};
