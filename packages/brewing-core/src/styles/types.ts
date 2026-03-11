export interface NumericRange {
  min: number;
  max: number;
}

export interface StyleRange {
  id: string;
  name: string;
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
