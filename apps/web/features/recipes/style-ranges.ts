export const globalBrewingRanges = {
  og: { min: 1.03, max: 1.12 },
  fg: { min: 1.002, max: 1.04 },
  abv: { min: 2, max: 14 },
  ibu: { min: 5, max: 120 },
  colorSrm: { min: 2, max: 40 }
} as const;

export const recipeStatLabels = {
  og: "OG",
  fg: "FG",
  abv: "ABV",
  ibu: "IBU",
  colorSrm: "Color"
} as const;
