import { describe, expect, it } from "vitest";

import {
  brixToSg,
  calculateAbvAlternate,
  calculateAbvAttenuation,
  calculateAbvStandard,
  calculateApparentAttenuation,
  calculateBeerColorSimple,
  calculateBottling,
  calculateBrewingWaterVolume,
  calculateDilutionBoiloff,
  calculateHopFreshness,
  calculateKegCarbonationPressure,
  calculatePrimingSugar,
  calculateSpeiseKrausen,
  calculateYeastStarter,
  convertBrewingUnitGroup,
  correctHydrometer,
  correctRefractometer,
  gravityPointsFromSg,
  residualCo2VolumesAtTempC,
  sgToBrix
} from "./calculator-tools";
import { calculateBitterness } from "./ibu";

describe("brewing calculator tools", () => {
  it("converts SG, Plato and Brix", () => {
    expect(sgToBrix(1.05)).toBeCloseTo(12.39, 2);
    expect(brixToSg(12.39)).toBeCloseTo(1.05, 3);
    expect(gravityPointsFromSg(1.05)).toBe(50);
    expect(convertBrewingUnitGroup("gravity", 50, "points").SG).toBe(1.05);
  });

  it("calculates ABV, alternate ABV and attenuation", () => {
    expect(calculateAbvStandard(1.05, 1.01)).toBe(5.25);
    expect(calculateAbvAlternate(1.05, 1.01)).toBeCloseTo(5.34, 1);
    expect(calculateApparentAttenuation(1.05, 1.01)).toBe(80);
    expect(calculateAbvAttenuation({ og: 1.05, fg: 1.01 }).calories).toBeGreaterThan(100);
  });

  it("uses Fahrenheit residual CO2 for priming sugar", () => {
    expect(residualCo2VolumesAtTempC(20)).toBeCloseTo(0.86, 2);
    const result = calculatePrimingSugar({
      beerVolumeL: 20,
      beerTemperatureC: 20,
      targetCo2Volumes: 2.4,
      sugarType: "dextrose",
      bottleSizeL: 0.5
    });

    expect(result.totalSugarGrams).toBe(123.2);
    expect(result.gramsPerBottle).toBeCloseTo(3.08, 2);
  });

  it("corrects hydrometer and refractometer readings", () => {
    expect(correctHydrometer({
      reading: 1.05,
      sampleTemperatureC: 30,
      calibrationTemperatureC: 20
    }).correctedSG).toBeCloseTo(1.053, 3);

    const refractometer = correctRefractometer({
      mode: "post_fermentation",
      originalGravity: 1.052,
      currentBrix: 6.4,
      wortCorrectionFactor: 1.04
    });

    expect(refractometer.correctedSG).toBeGreaterThan(1);
    expect(refractometer.estimatedABV).toBeGreaterThan(4);
  });

  it("conserves gravity points for dilution and boiloff", () => {
    const dilute = calculateDilutionBoiloff({
      mode: "dilute_to_gravity",
      currentVolumeL: 18,
      currentGravity: 1.06,
      targetGravity: 1.05
    });

    expect(dilute.waterToAddL).toBeCloseTo(3.6, 1);
    expect(dilute.resultingGravity).toBe(1.05);

    const boil = calculateDilutionBoiloff({
      mode: "boil_to_gravity",
      currentVolumeL: 25,
      currentGravity: 1.04,
      targetGravity: 1.05,
      boilOffRateLPerHour: 4
    });

    expect(boil.volumeToBoilOffL).toBe(5);
    expect(boil.extraBoilTimeMinutes).toBe(75);
  });

  it("calculates Tinseth and Rager bitterness", () => {
    const additions = [
      { id: "hop-1", name: "Citra", alphaAcidPercent: 12, weightG: 20, boilTimeMinutes: 60, use: "boil" as const }
    ];

    expect(calculateBitterness({ formula: "tinseth_classic", og: 1.05, batchVolumeL: 20, hopAdditions: additions }).ibu).toBeGreaterThan(20);
    expect(calculateBitterness({ formula: "rager", og: 1.05, batchVolumeL: 20, hopAdditions: additions }).ibu).toBeGreaterThan(20);
  });

  it("calculates Morey color", () => {
    const color = calculateBeerColorSimple({
      batchVolumeL: 20,
      fermentables: [
        { weightKg: 4.5, colorLovibond: 2 },
        { weightKg: 0.3, colorLovibond: 40 }
      ]
    });

    expect(color.srm).toBeCloseTo(6.6, 1);
    expect(color.ebc).toBeCloseTo(13, 0);
  });

  it("calculates brewing water volume", () => {
    const result = calculateBrewingWaterVolume({
      targetFermenterVolumeL: 20,
      grainWeightKg: 5,
      mashThicknessLPerKg: 3,
      boilTimeMinutes: 60,
      boilOffRateLPerHour: 4,
      grainAbsorptionLPerKg: 0.8,
      methodPreset: "mashTunWithSparge"
    });

    expect(result.totalWaterNeededL).toBeGreaterThan(29);
    expect(result.mashWaterL).toBe(15);
    expect(result.spargeWaterL).toBeGreaterThan(14);
  });

  it("converts pressure and temperature", () => {
    expect(convertBrewingUnitGroup("pressure", 14.5, "PSI").bar).toBe(1);
    expect(convertBrewingUnitGroup("temperature", 20, "C").F).toBe(68);
    expect(calculateKegCarbonationPressure({ beerTemperatureC: 4, targetCo2Volumes: 2.4 }).psi).toBeGreaterThan(9);
  });

  it("calculates packaging, speise, yeast and hop freshness helpers", () => {
    expect(calculateBottling({ beerVolumeL: 20, bottleSizesL: [0.5], sugarPerLiter: 6 }).bottlesNeeded).toBe(40);
    expect(calculateSpeiseKrausen({
      beerVolumeL: 20,
      targetCo2: 2.4,
      residualCo2: 0.86,
      speiseGravity: 1.05,
      temperatureC: 20
    }).speiseVolumeToAddL).toBeGreaterThan(1);
    expect(calculateYeastStarter({
      wortVolumeL: 20,
      gravity: 1.05,
      fermentationType: "ale",
      yeastType: "liquid",
      packsCount: 1,
      cellsPerPackBillion: 100,
      viabilityPercent: 70,
      starterMode: "stirPlate"
    }).pitchStatus).toBe("underpitch");
    expect(calculateHopFreshness({
      originalAlphaAcidPercent: 10,
      packageDate: new Date("2025-05-04"),
      storageTemperatureC: 4,
      packaging: "vacuum",
      form: "pellet",
      today: new Date("2026-05-04")
    }).estimatedCurrentAA).toBeGreaterThan(8);
  });
});
