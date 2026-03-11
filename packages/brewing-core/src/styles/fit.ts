import type { FitDetail, NumericRange, RecipeStatSnapshot, StyleFitResult, StyleRange } from "./types";
import { roundTo } from "../units";

const evaluateMetric = (value: number, range: NumericRange): FitDetail => {
  if (value < range.min) {
    return { status: "below", deltaFromRange: roundTo(range.min - value, 3) };
  }

  if (value > range.max) {
    return { status: "above", deltaFromRange: roundTo(value - range.max, 3) };
  }

  return { status: "in_range", deltaFromRange: 0 };
};

export const evaluateStyleFit = (style: StyleRange, stats: RecipeStatSnapshot): StyleFitResult => {
  const og = evaluateMetric(stats.og, style.og);
  const fg = evaluateMetric(stats.fg, style.fg);
  const abv = evaluateMetric(stats.abv, style.abv);
  const ibu = evaluateMetric(stats.ibu, style.ibu);
  const colorSrm = evaluateMetric(stats.srm, style.colorSrm);

  const details = [og, fg, abv, ibu, colorSrm];
  const overallFit = details.every((detail) => detail.status === "in_range");

  return {
    styleId: style.id,
    styleName: style.name,
    overallFit,
    og,
    fg,
    abv,
    ibu,
    colorSrm
  };
};
