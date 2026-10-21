import { describe, expect, it } from "vitest";

import {
  buildHopHarvestYearOptions,
  HOP_HARVEST_YEAR_OPTION_COUNT,
  listRecentHopHarvestYears
} from "@/features/inventory/hop-harvest-year";

describe("hop harvest year options", () => {
  it("lists a fixed window of recent seasons", () => {
    expect(listRecentHopHarvestYears(2026)).toEqual([
      "2026",
      "2025",
      "2024",
      "2023",
      "2022",
      "2021",
      "2020",
      "2019"
    ]);
    expect(listRecentHopHarvestYears(2026)).toHaveLength(HOP_HARVEST_YEAR_OPTION_COUNT);
  });

  it("keeps an out-of-range current value selectable for edits", () => {
    expect(buildHopHarvestYearOptions("2010", 2026)[0]).toBe("2010");
    expect(buildHopHarvestYearOptions("2024", 2026)).toEqual(listRecentHopHarvestYears(2026));
    expect(buildHopHarvestYearOptions("", 2026)).toEqual(listRecentHopHarvestYears(2026));
  });
});
