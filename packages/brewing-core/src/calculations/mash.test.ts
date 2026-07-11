import { describe, expect, it } from "vitest";

import { calculateInfusionStep, calculateStrikeWater } from "./mash";

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
});
