export interface NumericRange {
  min: number;
  max: number;
}

export interface BeerStyle {
  id: string;
  bjcpId: string;
  name: string;
  family: string | null;
  og: NumericRange | null;
  fg: NumericRange | null;
  abv: NumericRange | null;
  ibu: NumericRange | null;
  colorSrm: NumericRange | null;
}

export interface StyleRange extends BeerStyle {
  og: NumericRange;
  fg: NumericRange;
  abv: NumericRange;
  ibu: NumericRange;
  colorSrm: NumericRange;
}

export interface RecipeStatSnapshot {
  og: number;
  fg: number;
  abv: number;
  ibu: number;
  srm: number;
}

export type FitStatus = "below" | "in_range" | "above";

export interface FitDetail {
  status: FitStatus;
  deltaFromRange: number;
}

export interface StyleFitResult {
  styleId: string;
  styleName: string;
  overallFit: boolean;
  og: FitDetail;
  fg: FitDetail;
  abv: FitDetail;
  ibu: FitDetail;
  colorSrm: FitDetail;
}
