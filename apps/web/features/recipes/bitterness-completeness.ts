export type RecipeBitternessIssue = { ingredientId: string; name: string; reason: "hop_alpha" | "hopped_extract" };
export type RecipeBitternessEstimate = {
  status: "complete" | "partial" | "unavailable";
  knownIbu: number | null;
  missing: RecipeBitternessIssue[];
};

/** Only a product-specific, explicitly linear finished-beer specification can be scaled. */
export const calculateVerifiedExtractIbu = (spec: unknown, massG: number, volumeL: number): number | null => {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return null;
  const value = spec as Record<string, unknown>;
  if (value.basis !== "finished_beer" || value.scalesLinearlyWithConcentration !== true
    || typeof value.sourceUrl !== "string" || !/^https?:\/\//.test(value.sourceUrl)) return null;
  const ibu = value.ibuAtReferenceDilution, referenceMassG = value.referenceMassG, referenceVolumeL = value.referenceVolumeL;
  if (typeof ibu !== "number" || !Number.isFinite(ibu) || ibu < 0
    || typeof referenceMassG !== "number" || !Number.isFinite(referenceMassG) || referenceMassG <= 0
    || typeof referenceVolumeL !== "number" || !Number.isFinite(referenceVolumeL) || referenceVolumeL <= 0
    || !Number.isFinite(massG) || massG <= 0 || !Number.isFinite(volumeL) || volumeL <= 0) return null;
  return ibu * massG / referenceMassG * referenceVolumeL / volumeL;
};

export const formatRecipeBitternessMissing = (estimate?: RecipeBitternessEstimate | null) => {
  if (!estimate?.missing.length) return null;
  const known = estimate.status === "partial" && estimate.knownIbu != null ? `Известная часть: ${estimate.knownIbu.toFixed(1)} IBU. ` : "";
  return known + estimate.missing.map((issue) => issue.reason === "hop_alpha"
    ? `Укажите содержание альфа-кислот: ${issue.name}.`
    : `Не указана горечь охмелённого экстракта: ${issue.name}.`).join(" ");
};
