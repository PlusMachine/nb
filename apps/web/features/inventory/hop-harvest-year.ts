export const HOP_HARVEST_YEAR_OPTION_COUNT = 8;

export const listRecentHopHarvestYears = (
  referenceYear = new Date().getFullYear()
): string[] => Array.from(
  { length: HOP_HARVEST_YEAR_OPTION_COUNT },
  (_, index) => String(referenceYear - index)
);

/** Recent seasons for hop harvest year selects; keeps an out-of-range current value editable. */
export const buildHopHarvestYearOptions = (
  currentValue?: string | null,
  referenceYear = new Date().getFullYear()
): string[] => {
  const options = listRecentHopHarvestYears(referenceYear);
  const normalized = currentValue?.trim() ?? "";

  if (normalized && !options.includes(normalized)) {
    options.unshift(normalized);
  }

  return options;
};
