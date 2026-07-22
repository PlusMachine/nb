import { describe, expect, it } from "vitest";

import { calculateCoolingInfusion, calculateInfusionStep, calculateStepMash, calculateStrikeWater } from "./mash";

// Palmer's classic How to Brew example: 10 lb (4.536 kg) grain at 70°F (21.1°C),
// mashed at 1.5 qt/lb (≈14.2 L) to hit 153°F (67.2°C) — strike water should land
// around 164°F (≈73.2-73.5°C).
const palmerGrainKg = 4.536;
const palmerMashWaterL = 14.195;

describe("calculateStrikeWater", () => {
  it("matches Palmer's classic strike water example", () => {
    const result = calculateStrikeWater({
      grainKg: palmerGrainKg,
      mashWaterL: palmerMashWaterL,
      grainTempC: 21.1,
      targetTempC: 67.2
    });

    expect(result.strikeTempC).toBeGreaterThanOrEqual(73.2);
    expect(result.strikeTempC).toBeLessThanOrEqual(73.5);
    expect(result.mashThicknessLPerKg).toBeCloseTo(3.13, 2);
    expect(result.warnings).toEqual([]);
  });

  it("accounts for tun thermal mass raising the required strike temp", () => {
    const withoutTun = calculateStrikeWater({
      grainKg: palmerGrainKg,
      mashWaterL: palmerMashWaterL,
      grainTempC: 21.1,
      targetTempC: 67.2
    });
    const withTun = calculateStrikeWater({
      grainKg: palmerGrainKg,
      mashWaterL: palmerMashWaterL,
      grainTempC: 21.1,
      targetTempC: 67.2,
      tunThermalMassL: 2,
      tunTempC: 18
    });

    expect(withTun.strikeTempC).toBeGreaterThan(withoutTun.strikeTempC);
  });

  it("warns when the required strike temp is above boiling", () => {
    const result = calculateStrikeWater({
      grainKg: 10,
      mashWaterL: 5,
      grainTempC: 5,
      targetTempC: 70
    });

    expect(result.strikeTempC).toBeGreaterThan(100);
    expect(result.warnings).toContain("strike_temp_above_boiling");
    expect(result.warnings).toContain("mash_thickness_unusual");
  });

  it("warns when the required strike temp is near (but not above) boiling", () => {
    // A very thick mash (0.9 L/kg) is what makes a near-boiling strike temp physically
    // reachable — the thickness warning is expected to fire alongside it.
    const result = calculateStrikeWater({
      grainKg: 10,
      mashWaterL: 9,
      grainTempC: 6.3,
      targetTempC: 70
    });

    expect(result.strikeTempC).toBeGreaterThan(98);
    expect(result.strikeTempC).toBeLessThanOrEqual(100);
    expect(result.warnings).toContain("strike_temp_near_boiling");
    expect(result.warnings).not.toContain("strike_temp_above_boiling");
  });

  it("bails out instead of returning Infinity when mash water is zero or negative", () => {
    const zeroWater = calculateStrikeWater({
      grainKg: 5,
      mashWaterL: 0,
      grainTempC: 20,
      targetTempC: 66
    });
    const negativeWater = calculateStrikeWater({
      grainKg: 5,
      mashWaterL: -1,
      grainTempC: 20,
      targetTempC: 66
    });

    expect(zeroWater.strikeTempC).toBe(0);
    expect(zeroWater.mashThicknessLPerKg).toBe(0);
    expect(zeroWater.warnings).toEqual(["mash_water_required"]);
    expect(Number.isFinite(zeroWater.strikeTempC)).toBe(true);
    expect(negativeWater.strikeTempC).toBe(0);
    expect(negativeWater.warnings).toEqual(["mash_water_required"]);
  });

  it("warns on an unusually thin mash", () => {
    const result = calculateStrikeWater({
      grainKg: 5,
      mashWaterL: 30,
      grainTempC: 20,
      targetTempC: 67
    });

    expect(result.mashThicknessLPerKg).toBe(6);
    expect(result.warnings).toContain("mash_thickness_unusual");
  });
});

describe("calculateInfusionStep", () => {
  it("matches the order of magnitude of Palmer's step-infusion tables (~7-8 L)", () => {
    const result = calculateInfusionStep({
      grainKg: palmerGrainKg,
      currentMashWaterL: palmerMashWaterL,
      currentTempC: 65.6,
      targetTempC: 76.7,
      infusionWaterTempC: 99
    });

    expect(result.infusionVolumeL).toBeGreaterThanOrEqual(7);
    expect(result.infusionVolumeL).toBeLessThanOrEqual(8);
    expect(result.newTotalWaterL).toBeCloseTo(palmerMashWaterL + result.infusionVolumeL, 2);
    expect(result.warnings).toEqual([]);
  });

  it("is impossible when the infusion water is not hotter than the target", () => {
    const atTarget = calculateInfusionStep({
      grainKg: 5,
      currentMashWaterL: 15,
      currentTempC: 65,
      targetTempC: 76,
      infusionWaterTempC: 76
    });
    const belowTarget = calculateInfusionStep({
      grainKg: 5,
      currentMashWaterL: 15,
      currentTempC: 65,
      targetTempC: 76,
      infusionWaterTempC: 70
    });

    expect(atTarget.infusionVolumeL).toBe(0);
    expect(atTarget.warnings).toContain("infusion_temp_not_above_target");
    expect(belowTarget.infusionVolumeL).toBe(0);
    expect(belowTarget.warnings).toContain("infusion_temp_not_above_target");
  });

  it("warns on a downward step and returns zero infusion volume", () => {
    const result = calculateInfusionStep({
      grainKg: 5,
      currentMashWaterL: 15,
      currentTempC: 70,
      targetTempC: 65,
      infusionWaterTempC: 98
    });

    expect(result.infusionVolumeL).toBe(0);
    expect(result.warnings).toContain("infusion_step_downward");
  });

  it("warns when the infusion volume would exceed 60% of the current mash water", () => {
    const result = calculateInfusionStep({
      grainKg: 5,
      currentMashWaterL: 10,
      currentTempC: 50,
      targetTempC: 95,
      infusionWaterTempC: 100
    });

    expect(result.infusionVolumeL).toBeGreaterThan(10 * 0.6);
    expect(result.warnings).toContain("infusion_volume_excessive");
  });

  // Control numbers from the mash-infusion calculator spec (К15): 5 kg grain, 15 L
  // mash water, 50°C → 66°C target, confirms calculateInfusionStep's behaviour is
  // unchanged after delegating its arithmetic to the shared rawWaterAddition helper.
  it("matches the calculator's single upward infusion control numbers", () => {
    const withBoilingWater = calculateInfusionStep({
      grainKg: 5,
      currentMashWaterL: 15,
      currentTempC: 50,
      targetTempC: 66,
      infusionWaterTempC: 98
    });
    const withHotterWater = calculateInfusionStep({
      grainKg: 5,
      currentMashWaterL: 15,
      currentTempC: 50,
      targetTempC: 66,
      infusionWaterTempC: 100
    });

    expect(withBoilingWater.infusionVolumeL).toBeCloseTo(8.5, 1);
    expect(withBoilingWater.newTotalWaterL).toBeCloseTo(23.5, 1);
    expect(withHotterWater.infusionVolumeL).toBeCloseTo(8.0, 1);
  });
});

describe("calculateCoolingInfusion", () => {
  it("matches the calculator's inverse (cool-down) control numbers", () => {
    const result = calculateCoolingInfusion({
      grainKg: 5,
      currentMashWaterL: 20,
      currentTempC: 72,
      targetTempC: 66,
      coldWaterTempC: 15
    });

    expect(result.coldWaterVolumeL).toBeCloseTo(2.6, 1);
    expect(result.newTotalWaterL).toBeCloseTo(22.59, 2);
    expect(result.newThicknessLPerKg).toBeCloseTo(4.52, 2);
    expect(result.warnings).toEqual([]);
  });

  it("bails out with zero volume when the cold water is not below the target", () => {
    const result = calculateCoolingInfusion({
      grainKg: 5,
      currentMashWaterL: 20,
      currentTempC: 72,
      targetTempC: 66,
      coldWaterTempC: 66
    });

    expect(result.coldWaterVolumeL).toBe(0);
    expect(result.warnings).toContain("cooling_water_not_below_target");
  });

  it("bails out with zero volume when the step is not actually downward", () => {
    const result = calculateCoolingInfusion({
      grainKg: 5,
      currentMashWaterL: 20,
      currentTempC: 72,
      targetTempC: 74,
      coldWaterTempC: 15
    });

    expect(result.coldWaterVolumeL).toBe(0);
    expect(result.warnings).toContain("cooling_step_not_downward");
  });

  it("warns when the cold water addition would exceed 60% of the current mash water", () => {
    const result = calculateCoolingInfusion({
      grainKg: 5,
      currentMashWaterL: 10,
      currentTempC: 90,
      targetTempC: 20,
      coldWaterTempC: 5
    });

    expect(result.coldWaterVolumeL).toBeGreaterThan(10 * 0.6);
    expect(result.warnings).toContain("cooling_volume_excessive");
  });
});

describe("calculateStepMash", () => {
  it("matches the calculator's step-ladder control numbers and accumulates water between steps", () => {
    const result = calculateStepMash({
      grainKg: 5,
      startingWaterL: 15,
      startingTempC: 50,
      pauses: [{ targetTempC: 63 }, { targetTempC: 72 }, { targetTempC: 76 }],
      infusionWaterTempC: 100
    });

    expect(result.steps).toHaveLength(3);

    expect(result.steps[0].infusionVolumeL).toBeCloseTo(6.0, 1);
    expect(result.steps[0].totalWaterAfterL).toBeCloseTo(20.99, 2);
    expect(result.steps[0].thicknessAfterL).toBeCloseTo(4.2, 2);

    // Regression: the second step must be computed against the mash water already
    // grown by the first infusion (20.99 L), not the original starting volume (15 L).
    // Folding from the original 15 L would give 5.5 L here instead of 7.4 L.
    expect(result.steps[1].infusionVolumeL).toBeCloseTo(7.4, 1);
    expect(result.steps[1].infusionVolumeL).not.toBeCloseTo(5.5, 1);
    expect(result.steps[1].totalWaterAfterL).toBeCloseTo(28.4, 2);
    expect(result.steps[1].thicknessAfterL).toBeCloseTo(5.68, 2);

    expect(result.steps[2].infusionVolumeL).toBeCloseTo(5.1, 1);
    expect(result.steps[2].totalWaterAfterL).toBeCloseTo(33.47, 2);
    expect(result.steps[2].thicknessAfterL).toBeCloseTo(6.69, 2);

    expect(result.totalInfusionL).toBeCloseTo(18.5, 1);
    expect(result.totalWaterL).toBeCloseTo(33.47, 2);
    expect(result.finalThicknessLPerKg).toBeCloseTo(6.69, 2);
    expect(result.warnings).toContain("mash_thickness_unusual");
  });

  it("matches the calculator's default two-pause ladder without an unusual-thickness warning", () => {
    const result = calculateStepMash({
      grainKg: 5,
      startingWaterL: 15,
      startingTempC: 66,
      pauses: [{ targetTempC: 72 }, { targetTempC: 76 }],
      infusionWaterTempC: 98
    });

    expect(result.steps[0].infusionVolumeL).toBeCloseTo(3.9, 1);
    expect(result.steps[1].infusionVolumeL).toBeCloseTo(3.8, 1);
    expect(result.totalInfusionL).toBeCloseTo(7.8, 1);
    expect(result.finalThicknessLPerKg).toBeCloseTo(4.55, 2);
    expect(result.warnings).not.toContain("mash_thickness_unusual");
  });

  it("warns on a downward pause and adds no water for that step", () => {
    const result = calculateStepMash({
      grainKg: 5,
      startingWaterL: 15,
      startingTempC: 66,
      pauses: [{ targetTempC: 60 }],
      infusionWaterTempC: 98
    });

    expect(result.steps[0].infusionVolumeL).toBe(0);
    expect(result.steps[0].warnings).toContain("infusion_step_downward");
    expect(result.totalInfusionL).toBe(0);
    expect(result.totalWaterL).toBeCloseTo(15, 2);
  });

  // Regression: unlike calculateInfusionStep, the fold used to keep computing the
  // heat-balance equation after pushing infusion_temp_not_above_target. With the pause
  // exactly equal to the infusion water temperature the denominator is zero, the step
  // volume became +Infinity and poisoned every later step and total.
  it("bails out with zero volume (not Infinity) when a pause equals the infusion water temperature", () => {
    const result = calculateStepMash({
      grainKg: 5,
      startingWaterL: 15,
      startingTempC: 66,
      pauses: [{ targetTempC: 76 }, { targetTempC: 78 }],
      infusionWaterTempC: 76
    });

    expect(result.steps[0].infusionVolumeL).toBe(0);
    expect(result.steps[0].warnings).toContain("infusion_temp_not_above_target");
    expect(result.steps[1].totalWaterAfterL).toBeCloseTo(15, 2);
    expect(result.totalInfusionL).toBe(0);
    expect(Number.isFinite(result.totalWaterL)).toBe(true);
    expect(result.totalWaterL).toBeCloseTo(15, 2);
  });

  // Regression: a downward pause with infusion water colder than the pause made both the
  // numerator and denominator negative — a positive "infusion" volume slipped past the
  // Math.max(0, ...) clamp while the step's own warnings said no water was needed.
  it("adds no water on a downward pause even when the infusion water is colder than the pause", () => {
    const result = calculateStepMash({
      grainKg: 5,
      startingWaterL: 15,
      startingTempC: 72,
      pauses: [{ targetTempC: 65 }],
      infusionWaterTempC: 60
    });

    expect(result.steps[0].infusionVolumeL).toBe(0);
    expect(result.steps[0].warnings).toContain("infusion_step_downward");
    expect(result.totalInfusionL).toBe(0);
    expect(result.totalWaterL).toBeCloseTo(15, 2);
  });

  it("returns an empty ladder unchanged when there are no pauses", () => {
    const result = calculateStepMash({
      grainKg: 5,
      startingWaterL: 15,
      startingTempC: 66,
      pauses: [],
      infusionWaterTempC: 98
    });

    expect(result.steps).toEqual([]);
    expect(result.totalInfusionL).toBe(0);
    expect(result.totalWaterL).toBeCloseTo(15, 2);
    expect(result.finalThicknessLPerKg).toBeCloseTo(3, 2);
    expect(result.warnings).toEqual([]);
  });
});
