import { describe, expect, it } from "vitest";
import { brewStepsSchema } from "./schemas";
import { generateBrewSteps } from "./generator";

describe("brew step generator", () => {
  it("generates deterministic steps for mash + boil process", () => {
    const steps = generateBrewSteps({
      name: "APA",
      batchVolumeL: 20,
      boilTimeMinutes: 60,
      mashRests: [{ name: "Saccharification", temperatureC: 67, durationMinutes: 60 }],
      hasSparge: true,
      whirlpoolMinutes: 15,
      hopAdditions: [
        { id: "hop-1", name: "Citra", alphaAcidPercent: 12, weightG: 20, boilTimeMinutes: 60, use: "boil" },
        { id: "hop-2", name: "Cascade", alphaAcidPercent: 6, weightG: 30, boilTimeMinutes: 10, use: "boil" }
      ],
      fermentationTemperatureC: 19
    });

    expect(steps.length).toBeGreaterThan(8);
    expect(steps[0]?.stage).toBe("preparation");
    expect(steps.some((s) => s.title.includes("Hop addition"))).toBe(true);

    const parsed = brewStepsSchema.safeParse(steps);
    expect(parsed.success).toBe(true);
  });
});
