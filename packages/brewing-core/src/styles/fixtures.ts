import type { StyleRange } from "./types";

export const styleRangeFixtures: StyleRange[] = [
  {
    id: "american-pale-ale",
    name: "American Pale Ale",
    og: { min: 1.045, max: 1.06 },
    fg: { min: 1.01, max: 1.015 },
    abv: { min: 4.5, max: 6.2 },
    ibu: { min: 30, max: 50 },
    colorSrm: { min: 5, max: 10 }
  },
  {
    id: "dry-stout",
    name: "Dry Stout",
    og: { min: 1.036, max: 1.044 },
    fg: { min: 1.007, max: 1.011 },
    abv: { min: 4.0, max: 5.0 },
    ibu: { min: 25, max: 45 },
    colorSrm: { min: 25, max: 40 }
  }
];
