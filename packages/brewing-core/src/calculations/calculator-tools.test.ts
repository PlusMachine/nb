import { describe, expect, it } from "vitest";

import {
  brixToSg,
  calibrateWcf,
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
  calculateWaterPh,
  calculateYeastStarter,
  classifyApparentAttenuation,
  convertBrewingUnitGroup,
  correctHydrometer,
  correctRefractometer,
  gravityPointsFromSg,
  hopStorageTemperatureFactor,
  residualCo2VolumesAtTempC,
  sgToBrix
} from "./calculator-tools";
import { calculateBitterness, IBU_SOLUBILITY_CEILING } from "./ibu";

const testWaterProfile = { ca: 50, mg: 10, na: 15, cl: 40, so4: 60, hco3: 80 };

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

  it("clamps calories at zero for degenerate gravity inputs", () => {
    // OG у воды / FG > OG уводят формулу калорий в минус — наружу отдаём 0, не «−1 ккал».
    expect(calculateAbvAttenuation({ og: 1.0, fg: 0.998, servingSizeMl: 100 }).calories).toBe(0);
    expect(calculateAbvAttenuation({ og: 1.0, fg: 1.0, servingSizeMl: 100 }).calories).toBe(0);
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
    expect(result.warnings).toEqual([]);
  });

  it("guards priming sugar against a zero/negative volume and warns on carbonation risk", () => {
    const zeroVolume = calculatePrimingSugar({
      beerVolumeL: 0,
      beerTemperatureC: 20,
      targetCo2Volumes: 2.4
    });
    expect(zeroVolume.totalSugarGrams).toBe(0);
    expect(zeroVolume.gramsPerLiter).toBe(0);
    expect(zeroVolume.gramsPerBottle).toBe(0);
    expect(Number.isNaN(zeroVolume.gramsPerLiter)).toBe(false);

    const negativeVolume = calculatePrimingSugar({
      beerVolumeL: -5,
      beerTemperatureC: 20,
      targetCo2Volumes: 2.4
    });
    expect(negativeVolume.totalSugarGrams).toBe(0);

    const highCarbonation = calculatePrimingSugar({
      beerVolumeL: 20,
      beerTemperatureC: 20,
      targetCo2Volumes: 4
    });
    expect(highCarbonation.warnings).toContain("high_carbonation_bottle_risk");

    const belowResidual = calculatePrimingSugar({
      beerVolumeL: 20,
      beerTemperatureC: 20,
      targetCo2Volumes: 0.5
    });
    expect(belowResidual.warnings).toContain("residual_exceeds_target");
    expect(belowResidual.totalSugarGrams).toBe(0);
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

  it("matches a reference FG for the post-fermentation cubic", () => {
    // OB 12.4 Brix, current 6.5 Brix, WCF 1.0 (no instrument bias), Terrill cubic ("novotny" key).
    const result = correctRefractometer({
      mode: "post_fermentation",
      originalBrix: 12.4,
      currentBrix: 6.5,
      wortCorrectionFactor: 1.0,
      formula: "novotny"
    });

    expect(result.correctedSG).toBeCloseTo(1.013, 3);
    expect(result.estimatedABV).toBeGreaterThan(4);
    expect(result.attenuation).toBeGreaterThan(70);
  });

  it("treats an OG given in SG as a known gravity (no WCF), unlike a raw Brix reading", () => {
    const wcf = 1.1;

    const viaSg = correctRefractometer({
      mode: "post_fermentation",
      originalGravity: 1.05,
      currentBrix: 6.5,
      wortCorrectionFactor: wcf,
      formula: "novotny"
    });

    // The same wort read on the refractometer would show WCF× higher Brix; dividing
    // that raw reading back by WCF must reproduce the SG path exactly.
    const viaBiasedBrix = correctRefractometer({
      mode: "post_fermentation",
      originalBrix: sgToBrix(1.05) * wcf,
      currentBrix: 6.5,
      wortCorrectionFactor: wcf,
      formula: "novotny"
    });

    expect(viaSg.correctedSG).toBeCloseTo(viaBiasedBrix.correctedSG, 4);

    // A raw Brix reading equal to the true Brix (no bias) IS divided by WCF, so it must
    // NOT match the SG path — proving the WCF is skipped only for SG-typed OG input.
    const viaUnbiasedBrix = correctRefractometer({
      mode: "post_fermentation",
      originalBrix: sgToBrix(1.05),
      currentBrix: 6.5,
      wortCorrectionFactor: wcf,
      formula: "novotny"
    });

    expect(viaUnbiasedBrix.correctedSG).not.toBeCloseTo(viaSg.correctedSG, 4);
  });

  it("applies the WCF before fermentation and reports zero alcohol metrics", () => {
    const result = correctRefractometer({
      mode: "pre_fermentation",
      currentBrix: 12,
      wortCorrectionFactor: 1.04
    });

    expect(result.correctedBrix).toBeCloseTo(12 / 1.04, 2);
    expect(result.correctedBrix).toBeLessThan(12);
    expect(result.estimatedABV).toBe(0);
    expect(result.attenuation).toBe(0);
  });

  it("calibrates WCF from a refractometer/hydrometer pair", () => {
    // 12.5 Brix on the refractometer vs 1.048 SG on the hydrometer → ~1.05.
    expect(calibrateWcf({ refractometerBrix: 12.5, hydrometerReading: 1.048 })).toBeCloseTo(1.05, 2);

    // Saccharometer graduated in °P (≈ Brix) is divided directly.
    expect(calibrateWcf({ refractometerBrix: 12.5, hydrometerReading: 11.9, hydrometerUnit: "Plato" })).toBeCloseTo(1.05, 2);

    expect(() => calibrateWcf({ refractometerBrix: 12.5, hydrometerReading: 0 })).toThrow();
  });

  it("classifies apparent attenuation into bands", () => {
    expect(classifyApparentAttenuation(60)).toBe("low");
    expect(classifyApparentAttenuation(72)).toBe("normal");
    expect(classifyApparentAttenuation(85)).toBe("high");
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
    expect(dilute.warnings).toEqual([]);

    const boil = calculateDilutionBoiloff({
      mode: "boil_to_gravity",
      currentVolumeL: 25,
      currentGravity: 1.04,
      targetGravity: 1.05,
      boilOffRateLPerHour: 4
    });

    expect(boil.volumeToBoilOffL).toBe(5);
    expect(boil.extraBoilTimeMinutes).toBe(75);
    expect(boil.warnings).toEqual([]);
  });

  it("К17: currentVolumeMeasuredHot off is bit-for-bit the same as before, on applies the ~4% cooling shrinkage before any other math", () => {
    const cold = calculateDilutionBoiloff({
      mode: "dilute_to_gravity",
      currentVolumeL: 20,
      currentGravity: 1.06,
      targetGravity: 1.05
    });
    expect(cold.effectiveCurrentVolumeL).toBe(20);
    expect(cold.warnings).toEqual([]);

    // Explicit false must match the omitted-flag case exactly — no accidental behavior change
    // for callers that pass the field through as a plain boolean.
    const explicitlyCold = calculateDilutionBoiloff({
      mode: "dilute_to_gravity",
      currentVolumeL: 20,
      currentGravity: 1.06,
      targetGravity: 1.05,
      currentVolumeMeasuredHot: false
    });
    expect(explicitlyCold).toEqual(cold);

    const hot = calculateDilutionBoiloff({
      mode: "dilute_to_gravity",
      currentVolumeL: 20,
      currentGravity: 1.06,
      targetGravity: 1.05,
      currentVolumeMeasuredHot: true
    });
    // 20 L measured hot → 19.2 L once cooled — the water/gravity math runs from THAT volume.
    expect(hot.effectiveCurrentVolumeL).toBe(19.2);
    expect(hot.warnings).toContain("hot_wort_volume_shrinkage_applied");
    expect(hot.resultingGravity).toBe(1.05);
    // Same target gravity from a smaller true starting volume needs less added water.
    expect(hot.waterToAddL).toBeLessThan(cold.waterToAddL);
    expect(hot.waterToAddL).toBeCloseTo(19.2 * (1.06 - 1.05) / 0.05, 1);
  });

  it("actually applies an extract/sugar addition to gravity and volume", () => {
    const result = calculateDilutionBoiloff({
      mode: "add_extract_to_gravity",
      currentVolumeL: 20,
      currentGravity: 1.04,
      targetGravity: 1.05,
      additionType: "dme"
    });

    expect(result.resultingVolumeL).toBe(20);
    expect(result.resultingGravity).toBeCloseTo(1.05, 3);
    expect(result.dmeToAddG).toBeGreaterThan(0);
    expect(result.sugarToAddG).toBe(0);
  });

  it("ignores targetVolumeL for add_extract_to_gravity — extract is dosed for the CURRENT volume, not a hidden target", () => {
    const withoutTargetVolume = calculateDilutionBoiloff({
      mode: "add_extract_to_gravity",
      currentVolumeL: 20,
      currentGravity: 1.04,
      targetGravity: 1.05,
      additionType: "dme"
    });

    // A stale/default targetVolumeL (e.g. 24L, carried over from other modes) must not
    // silently inflate the batch or the grams needed — both must match the no-targetVolumeL case.
    const withStaleTargetVolume = calculateDilutionBoiloff({
      mode: "add_extract_to_gravity",
      currentVolumeL: 20,
      currentGravity: 1.04,
      targetGravity: 1.05,
      targetVolumeL: 24,
      additionType: "dme"
    });

    expect(withStaleTargetVolume.resultingVolumeL).toBe(withoutTargetVolume.resultingVolumeL);
    expect(withStaleTargetVolume.resultingVolumeL).toBe(20);
    expect(withStaleTargetVolume.resultingGravity).toBeCloseTo(1.05, 3);
    expect(withStaleTargetVolume.dmeToAddG).toBeCloseTo(withoutTargetVolume.dmeToAddG, 1);
  });

  it("flags physically impossible directions instead of faking a result", () => {
    // Boiling off can only shrink volume — a bigger requested volume is impossible.
    const boiloffUp = calculateDilutionBoiloff({
      mode: "gravity_after_boiloff",
      currentVolumeL: 20,
      currentGravity: 1.05,
      targetVolumeL: 25
    });
    expect(boiloffUp.volumeToBoilOffL).toBe(0);
    expect(boiloffUp.resultingVolumeL).toBe(20);
    expect(boiloffUp.resultingGravity).toBe(1.05);
    expect(boiloffUp.warnings).toContain("target_volume_above_current");

    const extraBoilUp = calculateDilutionBoiloff({
      mode: "extra_boil_time",
      currentVolumeL: 20,
      currentGravity: 1.05,
      targetVolumeL: 22,
      boilOffRateLPerHour: 4
    });
    expect(extraBoilUp.resultingVolumeL).toBe(20);
    expect(extraBoilUp.warnings).toContain("target_volume_above_current");

    // Adding water can only grow volume — a smaller requested volume is impossible.
    const waterDown = calculateDilutionBoiloff({
      mode: "gravity_after_water",
      currentVolumeL: 20,
      currentGravity: 1.05,
      targetVolumeL: 15
    });
    expect(waterDown.waterToAddL).toBe(0);
    expect(waterDown.resultingVolumeL).toBe(20);
    expect(waterDown.resultingGravity).toBe(1.05);
    expect(waterDown.warnings).toContain("target_volume_below_current");

    // Dilution only lowers gravity — a higher target can't be reached with water.
    const diluteUp = calculateDilutionBoiloff({
      mode: "dilute_to_gravity",
      currentVolumeL: 20,
      currentGravity: 1.04,
      targetGravity: 1.05
    });
    expect(diluteUp.waterToAddL).toBe(0);
    expect(diluteUp.warnings).toContain("target_gravity_above_current");

    // Boiling only raises gravity — a lower target can't be reached by boiling.
    const boilDown = calculateDilutionBoiloff({
      mode: "boil_to_gravity",
      currentVolumeL: 20,
      currentGravity: 1.05,
      targetGravity: 1.04
    });
    expect(boilDown.volumeToBoilOffL).toBe(0);
    expect(boilDown.warnings).toContain("target_gravity_below_current");
    // "Целевой объём" is hidden in boil_to_gravity mode — a second warning pointing at it
    // would be noise on top of the (correctly scoped) gravity warning above.
    expect(boilDown.warnings).not.toContain("target_volume_above_current");
  });

  it("calculates Tinseth and Rager bitterness", () => {
    const additions = [
      { id: "hop-1", name: "Citra", alphaAcidPercent: 12, weightG: 20, boilTimeMinutes: 60, use: "boil" as const }
    ];

    expect(calculateBitterness({ formula: "tinseth_classic", og: 1.05, batchVolumeL: 20, hopAdditions: additions }).ibu).toBeGreaterThan(20);
    expect(calculateBitterness({ formula: "rager", og: 1.05, batchVolumeL: 20, hopAdditions: additions }).ibu).toBeGreaterThan(20);
  });

  it("resolves an invalid OG (<=1) to 1.05 and reports it back for BU:GU math", () => {
    const additions = [
      { id: "hop-1", name: "Citra", alphaAcidPercent: 12, weightG: 20, boilTimeMinutes: 60, use: "boil" as const }
    ];

    const invalid = calculateBitterness({ formula: "tinseth_classic", og: 1, batchVolumeL: 20, hopAdditions: additions });
    expect(invalid.resolvedOg).toBe(1.05);

    const valid = calculateBitterness({ formula: "tinseth_classic", og: 1.06, batchVolumeL: 20, hopAdditions: additions });
    expect(valid.resolvedOg).toBe(1.06);
  });

  it("activates boil-carryover-into-whirlpool bitterness once whirlpoolTimeMinutes > 0", () => {
    const additions = [
      { id: "hop-1", name: "Late boil", alphaAcidPercent: 10, weightG: 20, boilTimeMinutes: 10, use: "boil" as const }
    ];

    const withoutWhirlpool = calculateBitterness({
      formula: "tinseth_whirlpool_v2",
      og: 1.05,
      batchVolumeL: 20,
      hopAdditions: additions,
      whirlpoolTimeMinutes: 0
    });
    expect(withoutWhirlpool.contributions.some((c) => c.isCarryover)).toBe(false);

    const withWhirlpool = calculateBitterness({
      formula: "tinseth_whirlpool_v2",
      og: 1.05,
      batchVolumeL: 20,
      hopAdditions: additions,
      whirlpoolTimeMinutes: 15,
      whirlpoolTemperatureC: 80
    });
    expect(withWhirlpool.contributions.some((c) => c.isCarryover)).toBe(true);
    expect(withWhirlpool.warnings).toContain("boil_carryover_whirlpool_approximation");
    expect(withWhirlpool.ibu).toBeGreaterThan(withoutWhirlpool.ibu);
  });

  it("caps a boil hop whose time exceeds the boil and warns about it", () => {
    const overLong = [
      { id: "hop-1", name: "Magnum", alphaAcidPercent: 12, weightG: 20, boilTimeMinutes: 90, use: "boil" as const }
    ];
    const capped = [
      { id: "hop-1", name: "Magnum", alphaAcidPercent: 12, weightG: 20, boilTimeMinutes: 60, use: "boil" as const }
    ];

    for (const formula of ["tinseth_classic", "tinseth_whirlpool_v2", "rager"] as const) {
      const long = calculateBitterness({ formula, og: 1.05, batchVolumeL: 20, boilTimeMinutes: 60, hopAdditions: overLong });
      const exact = calculateBitterness({ formula, og: 1.05, batchVolumeL: 20, boilTimeMinutes: 60, hopAdditions: capped });

      // 90 мин при кипячении 60 считается как 60 — те же IBU, что и у ровно 60-минутного хмеля.
      expect(long.ibu).toBeCloseTo(exact.ibu, 5);
      expect(long.warnings).toContain("hop_time_exceeds_boil_capped");
      expect(exact.warnings).not.toContain("hop_time_exceeds_boil_capped");
    }
  });

  it("ignores whirlpool additions in classic Tinseth and Rager with a warning", () => {
    const additions = [
      { id: "hop-1", name: "Boil", alphaAcidPercent: 10, weightG: 20, boilTimeMinutes: 60, use: "boil" as const },
      { id: "hop-2", name: "Whirlpool", alphaAcidPercent: 12, weightG: 40, boilTimeMinutes: 20, use: "whirlpool" as const }
    ];

    const classic = calculateBitterness({ formula: "tinseth_classic", og: 1.05, batchVolumeL: 20, hopAdditions: additions });
    expect(classic.contributions.some((c) => c.use === "whirlpool")).toBe(false);
    expect(classic.warnings).toContain("tinseth_classic_whirlpool_ignored");

    const rager = calculateBitterness({ formula: "rager", og: 1.05, batchVolumeL: 20, hopAdditions: additions });
    expect(rager.contributions.some((c) => c.use === "whirlpool")).toBe(false);
    expect(rager.warnings).toContain("whirlpool_unsupported_for_rager");

    // В формуле v2 то же внесение вирпула даёт вклад — контроль, что дело в формуле, а не в данных.
    const v2 = calculateBitterness({ formula: "tinseth_whirlpool_v2", og: 1.05, batchVolumeL: 20, hopAdditions: additions });
    expect(v2.contributions.some((c) => c.use === "whirlpool")).toBe(true);
    expect(v2.ibu).toBeGreaterThan(classic.ibu);
  });

  // К19 (аудит калькуляторов 2026-07-17): выше ~100 IBU растворимость изо-альфа-кислот
  // в сусле ограничена — модель Тинсета продолжает расти линейно, а реальная утилизация
  // выходит на плато. Предупреждаем, а не молчим про завышение.
  it("warns when total IBU exceeds the solubility ceiling, stays quiet below it", () => {
    const massiveAdditions = [
      { id: "hop-1", name: "Warrior", alphaAcidPercent: 16, weightG: 80, boilTimeMinutes: 60, use: "boil" as const }
    ];
    const modestAdditions = [
      { id: "hop-1", name: "Citra", alphaAcidPercent: 12, weightG: 20, boilTimeMinutes: 60, use: "boil" as const }
    ];

    const massive = calculateBitterness({ formula: "tinseth_classic", og: 1.06, batchVolumeL: 20, hopAdditions: massiveAdditions });
    expect(massive.ibu).toBeGreaterThan(IBU_SOLUBILITY_CEILING);
    expect(massive.warnings).toContain("ibu_above_solubility_ceiling");

    const modest = calculateBitterness({ formula: "tinseth_classic", og: 1.06, batchVolumeL: 20, hopAdditions: modestAdditions });
    expect(modest.ibu).toBeLessThan(IBU_SOLUBILITY_CEILING);
    expect(modest.warnings).not.toContain("ibu_above_solubility_ceiling");
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

  it("matches the Braukaiser speise control (~1.6 L) and auto-derives residual CO2 from temperature", () => {
    const withExplicitResidual = calculateSpeiseKrausen({
      beerVolumeL: 20,
      targetCo2: 2.4,
      residualCo2: 0.86,
      speiseGravity: 1.05,
      temperatureC: 20
    });
    expect(withExplicitResidual.speiseVolumeToAddL).toBeCloseTo(1.6, 1);
    expect(withExplicitResidual.residualCo2).toBe(0.86);

    const withAutoResidual = calculateSpeiseKrausen({
      beerVolumeL: 20,
      targetCo2: 2.4,
      speiseGravity: 1.05,
      temperatureC: 20
    });
    expect(withAutoResidual.residualCo2).toBeCloseTo(0.86, 2);
    expect(withAutoResidual.speiseVolumeToAddL).toBeCloseTo(withExplicitResidual.speiseVolumeToAddL, 1);

    // "Гайл" считается идентично "Шпайзе" явно, а не через побочный эффект else.
    const gyle = calculateSpeiseKrausen({
      beerVolumeL: 20,
      targetCo2: 2.4,
      residualCo2: 0.86,
      speiseGravity: 1.05,
      temperatureC: 20,
      mode: "gyle"
    });
    expect(gyle.speiseVolumeToAddL).toBe(withExplicitResidual.speiseVolumeToAddL);

    // "Краузен" частично выброжен — ему нужно больше объёма на тот же CO2.
    const krausen = calculateSpeiseKrausen({
      beerVolumeL: 20,
      targetCo2: 2.4,
      residualCo2: 0.86,
      speiseGravity: 1.05,
      temperatureC: 20,
      mode: "krausen"
    });
    expect(krausen.speiseVolumeToAddL).toBeGreaterThan(withExplicitResidual.speiseVolumeToAddL);
  });

  // К4 (аудит калькуляторов 2026-07-17): цель CO2 не выше остаточного — деление даёт 0 л
  // добавки молча, как будто это нормальный результат, а не "добавка не нужна".
  it("warns instead of silently returning 0 L when the speise target CO2 is already reached", () => {
    const alreadyCarbonated = calculateSpeiseKrausen({
      beerVolumeL: 20,
      targetCo2: 0.8,
      residualCo2: 0.86,
      speiseGravity: 1.05,
      temperatureC: 20
    });
    expect(alreadyCarbonated.speiseVolumeToAddL).toBe(0);
    expect(alreadyCarbonated.warnings).toContain("speise_target_already_reached");

    const exactMatch = calculateSpeiseKrausen({
      beerVolumeL: 20,
      targetCo2: 0.86,
      residualCo2: 0.86,
      speiseGravity: 1.05,
      temperatureC: 20
    });
    expect(exactMatch.warnings).toContain("speise_target_already_reached");

    const stillNeedsSpeise = calculateSpeiseKrausen({
      beerVolumeL: 20,
      targetCo2: 2.4,
      residualCo2: 0.86,
      speiseGravity: 1.05,
      temperatureC: 20
    });
    expect(stillNeedsSpeise.warnings).not.toContain("speise_target_already_reached");
  });

  // К4: потери при розливе, покрывающие весь объём, раньше молча давали "0 бутылок" —
  // неотличимо от честного расчёта на маленький объём.
  it("warns instead of silently returning 0 bottles when packaging loss consumes the whole volume", () => {
    const allLost = calculateBottling({ beerVolumeL: 5, packagingLossL: 5, bottleSizesL: [0.5] });
    expect(allLost.bottlesNeeded).toBe(0);
    expect(allLost.warnings).toContain("bottling_loss_exceeds_volume");

    const overLost = calculateBottling({ beerVolumeL: 5, packagingLossL: 6, bottleSizesL: [0.5] });
    expect(overLost.warnings).toContain("bottling_loss_exceeds_volume");

    const normal = calculateBottling({ beerVolumeL: 20, packagingLossL: 0.5, bottleSizesL: [0.5] });
    expect(normal.warnings).not.toContain("bottling_loss_exceeds_volume");
  });

  // К16 (аудит калькуляторов 2026-07-17): смешанная тара — второй размер забирает остаток
  // после основного, финальный неполный остаток предлагается округлить вверх до бутылки
  // МЕНЬШЕГО из двух размеров (доказательство в calculateBottling: это всегда достаточно).
  it("distributes bottling across two bottle sizes and advises rounding up the remainder", () => {
    const mixed = calculateBottling({ beerVolumeL: 20.4, bottleSizesL: [0.5, 0.33] });

    expect(mixed.breakdown).toEqual([
      { sizeL: 0.5, bottlesNeeded: 40 },
      { sizeL: 0.33, bottlesNeeded: 1 }
    ]);
    expect(mixed.bottlesNeeded).toBe(41);
    expect(mixed.remainingVolumeL).toBeCloseTo(0.07, 2);
    expect(mixed.roundUpBottleSizeL).toBe(0.33);

    // Порядок размеров не подразумевает "основной ≥ второй" — совет всё равно указывает
    // на физически меньшую тару, даже если она передана первой.
    const reversedOrder = calculateBottling({ beerVolumeL: 20.4, bottleSizesL: [0.33, 0.5] });
    expect(reversedOrder.roundUpBottleSizeL).toBe(0.33);

    // Ровное деление на оба размера — округлять нечего, совет молчит (0, не "0 л").
    const evenSplit = calculateBottling({ beerVolumeL: 20, bottleSizesL: [0.5, 0.33] });
    expect(evenSplit.remainingVolumeL).toBe(0);
    expect(evenSplit.roundUpBottleSizeL).toBe(0);

    // Второй размер пуст/отсутствует — поведение как с одним размером (без регрессии).
    const singleSize = calculateBottling({ beerVolumeL: 20.4, bottleSizesL: [0.5] });
    expect(singleSize.breakdown).toEqual([{ sizeL: 0.5, bottlesNeeded: 40 }]);
    expect(singleSize.roundUpBottleSizeL).toBe(0.5);
  });

  it("guards yeast starter against zero viable cells and hop freshness against double-counting opened age", () => {
    const noViableCells = calculateYeastStarter({
      wortVolumeL: 20,
      gravity: 1.05,
      fermentationType: "ale",
      yeastType: "liquid",
      packsCount: 0,
      cellsPerPackBillion: 100,
      starterMode: "stirPlate"
    });
    expect(noViableCells.viableCellsBillion).toBe(0);
    expect(noViableCells.starterVolumeL).toBe(0);
    expect(noViableCells.warnings).toContain("no_viable_cells");

    const stillOpen = calculateHopFreshness({
      originalAlphaAcidPercent: 10,
      packageDate: new Date("2025-01-01"),
      openedDate: new Date("2026-01-01"),
      storageTemperatureC: 20,
      packaging: "vacuum",
      form: "pellet",
      today: new Date("2026-04-01")
    });
    const neverOpened = calculateHopFreshness({
      originalAlphaAcidPercent: 10,
      packageDate: new Date("2025-01-01"),
      storageTemperatureC: 20,
      packaging: "vacuum",
      form: "pellet",
      today: new Date("2026-04-01")
    });
    // Opening the package should only make freshness worse, never better, and the
    // effect must be bounded by the packaging→opened factor ratio (no double counting).
    expect(stillOpen.estimatedCurrentAA).toBeLessThan(neverOpened.estimatedCurrentAA);

    const openedFromDayOne = calculateHopFreshness({
      originalAlphaAcidPercent: 10,
      packageDate: new Date("2025-01-01"),
      openedDate: new Date("2025-01-01"),
      storageTemperatureC: 20,
      packaging: "vacuum",
      form: "pellet",
      today: new Date("2026-04-01")
    });
    const openedPackaging = calculateHopFreshness({
      originalAlphaAcidPercent: 10,
      packageDate: new Date("2025-01-01"),
      storageTemperatureC: 20,
      packaging: "opened",
      form: "pellet",
      today: new Date("2026-04-01")
    });
    // Opened on day one == the whole period counted at the "opened" factor, same as
    // choosing packaging="opened" with no explicit openedDate.
    expect(openedFromDayOne.estimatedCurrentAA).toBeCloseTo(openedPackaging.estimatedCurrentAA, 1);

    // openedDate before packageDate must clamp to ageYears, not go negative — same result
    // as opening exactly on the packaging date for the same package/today pair.
    const clamped = calculateHopFreshness({
      originalAlphaAcidPercent: 10,
      packageDate: new Date("2025-01-01"),
      openedDate: new Date("2020-01-01"),
      storageTemperatureC: 20,
      packaging: "vacuum",
      form: "pellet",
      today: new Date("2026-04-01")
    });
    expect(clamped.estimatedCurrentAA).toBeCloseTo(openedFromDayOne.estimatedCurrentAA, 2);
  });

  it("flags hops_too_old once the unclamped freshness factor drops below the 0.05 floor", () => {
    const fresh = calculateHopFreshness({
      originalAlphaAcidPercent: 10,
      packageDate: new Date("2026-01-01"),
      storageTemperatureC: 4,
      packaging: "vacuum",
      form: "pellet",
      today: new Date("2026-04-01")
    });
    expect(fresh.warnings).toEqual([]);

    // К14: с непрерывной температурной экспонентой при 25°C множитель (~1.23) мягче
    // прежней плоской "ступеньки" 1.8 для всего, что выше 20°C, — поэтому те же 3 года
    // из старого теста уже не пробивают пол 0.05. Взяли 4 года, чтобы сохранить запас.
    const wayTooOld = calculateHopFreshness({
      originalAlphaAcidPercent: 10,
      packageDate: new Date("2021-01-01"),
      storageTemperatureC: 25,
      packaging: "loose",
      form: "leaf",
      today: new Date("2025-01-01")
    });
    expect(wayTooOld.freshnessFactor).toBe(0.05);
    expect(wayTooOld.warnings).toContain("hops_too_old");
  });

  // К14 (аудит калькуляторов, notes/calculators-fixes.md): tempFactor раньше был
  // ступенькой (0.25/0.55/1/1.8 с порогами -10/4/20°C) — сдвиг всего на 1°C через порог
  // почти удваивал модельную деградацию. Заменили на непрерывную экспоненту
  // f(T) = exp(0.042 · (T − 20)); эти тесты фиксируют форму кривой и близость к старым
  // характерным точкам, а не точное совпадение (степенька и экспонента принципиально
  // разные формы — совпадение возможно только в единичных точках).
  it("hopStorageTemperatureFactor is a continuous, monotonically increasing curve anchored at f(20)=1", () => {
    expect(hopStorageTemperatureFactor(20)).toBeCloseTo(1, 6);

    const samples = [-30, -18, -10, -5, 0, 4, 5, 12, 20, 25, 30, 40];
    for (let i = 1; i < samples.length; i += 1) {
      expect(hopStorageTemperatureFactor(samples[i])).toBeGreaterThan(hopStorageTemperatureFactor(samples[i - 1]));
    }
  });

  it("hopStorageTemperatureFactor stays close to the old step values at the characteristic temperatures", () => {
    // Допуски широкие там, где старая ступенька была плоской в середине диапазона
    // (0°C и 12°C приходились на плато 0.55/1 — непрерывная кривая там неизбежно
    // расходится сильнее, это и есть цель замены "ступеньки" на плавный переход).
    expect(hopStorageTemperatureFactor(-18)).toBeCloseTo(0.25, 1); // было 0.25 (T<=-10)
    expect(hopStorageTemperatureFactor(-10)).toBeCloseTo(0.28, 1); // было 0.25 (T<=-10)
    expect(hopStorageTemperatureFactor(0)).toBeGreaterThan(0.3);
    expect(hopStorageTemperatureFactor(0)).toBeLessThan(0.6); // было 0.55 (T<=4)
    expect(hopStorageTemperatureFactor(4)).toBeCloseTo(0.51, 1); // было 0.55 (T<=4)
    expect(hopStorageTemperatureFactor(12)).toBeGreaterThan(0.6);
    expect(hopStorageTemperatureFactor(12)).toBeLessThan(1); // было 1 (T<=20)
    expect(hopStorageTemperatureFactor(20)).toBeCloseTo(1, 6); // якорь f(20)=1
    expect(hopStorageTemperatureFactor(25)).toBeGreaterThan(1);
    expect(hopStorageTemperatureFactor(25)).toBeLessThan(1.8); // было 1.8 (T>20)
    expect(hopStorageTemperatureFactor(30)).toBeCloseTo(1.5, 1); // было 1.8 (T>20)
  });

  it("has no cliff around the old 4°C/20°C thresholds — a 1°C shift barely moves the factor", () => {
    const f4 = hopStorageTemperatureFactor(4);
    const f5 = hopStorageTemperatureFactor(5);
    expect(f5 / f4).toBeLessThan(1.1);

    const f20 = hopStorageTemperatureFactor(20);
    const f21 = hopStorageTemperatureFactor(21);
    expect(f21 / f20).toBeLessThan(1.1);

    const fMinus11 = hopStorageTemperatureFactor(-11);
    const fMinus10 = hopStorageTemperatureFactor(-10);
    expect(fMinus10 / fMinus11).toBeLessThan(1.1);
  });

  it("does not let opening improve freshness when packaging is looser than 'opened' (loose)", () => {
    // packagingFactor.loose (1.6) is WORSE than packagingFactor.opened (1.25), so switching
    // to the "opened" factor partway through must not read as an improvement.
    const looseNeverOpened = calculateHopFreshness({
      originalAlphaAcidPercent: 10,
      packageDate: new Date("2025-01-01"),
      storageTemperatureC: 20,
      packaging: "loose",
      form: "pellet",
      today: new Date("2025-07-01")
    });
    const looseOpenedHalfway = calculateHopFreshness({
      originalAlphaAcidPercent: 10,
      packageDate: new Date("2025-01-01"),
      openedDate: new Date("2025-04-01"),
      storageTemperatureC: 20,
      packaging: "loose",
      form: "pellet",
      today: new Date("2025-07-01")
    });

    expect(looseOpenedHalfway.estimatedCurrentAA).toBeCloseTo(looseNeverOpened.estimatedCurrentAA, 2);
    expect(looseOpenedHalfway.estimatedCurrentAA).not.toBeGreaterThan(looseNeverOpened.estimatedCurrentAA);
  });

  it("calculates brewing water volume warnings for a suspicious shrinkage typo and a capped mash volume", () => {
    const typo = calculateBrewingWaterVolume({
      targetFermenterVolumeL: 20,
      grainWeightKg: 5,
      mashThicknessLPerKg: 3,
      boilTimeMinutes: 60,
      boilOffRateLPerHour: 4,
      grainAbsorptionLPerKg: 0.8,
      coolingShrinkagePercent: 40,
      methodPreset: "mashTunWithSparge"
    });
    expect(typo.warnings).toContain("shrinkage_suspiciously_high");

    const capped = calculateBrewingWaterVolume({
      targetFermenterVolumeL: 5,
      grainWeightKg: 5,
      mashThicknessLPerKg: 3,
      boilTimeMinutes: 30,
      boilOffRateLPerHour: 2,
      grainAbsorptionLPerKg: 0.8,
      methodPreset: "mashTunWithSparge"
    });
    expect(capped.warnings).toContain("mash_water_capped");
    expect(capped.spargeWaterL).toBe(0);
  });

  it("returns post-acid pH, the target pH constant and propagates solver warnings", () => {
    const result = calculateWaterPh({
      sourceWaterProfile: testWaterProfile,
      targetWaterProfile: testWaterProfile,
      mashWaterVolumeL: 15,
      salts: [],
      acid: "lactic_acid",
      totalGrainKg: 5,
      colorCategory: "dark"
    });

    expect(result.targetPh).toBe(5.35);
    expect(result.postAcidPh).not.toBeNull();
    expect(result.postAcidPh as number).toBeLessThanOrEqual(result.estimatedMashPh);
    expect(result.warnings).toContain("mash_acid_model_practical_approximation");

    const withoutAcid = calculateWaterPh({
      sourceWaterProfile: testWaterProfile,
      targetWaterProfile: testWaterProfile,
      mashWaterVolumeL: 15,
      salts: []
    });
    expect(withoutAcid.postAcidPh).toBeNull();
  });
});
