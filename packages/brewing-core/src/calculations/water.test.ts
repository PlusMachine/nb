import { describe, expect, it } from "vitest";

import {
  alkalinityAsCaCO3FromHco3,
  applySaltAdditions,
  acidNeutralizationMeqPerMl,
  carbonateChargeFraction,
  estimateMashPh,
  MASH_BUFFER_MEQ_PER_KG_PH,
  residualAlkalinityAsCaCO3,
  solveMashAcidAddition,
  solveSpargeAcidAddition,
  solveWaterTargetProfile,
  sulfateChlorideRatio,
  totalCarbonateMmolPerL,
  type BrewingSaltId,
  type WaterProfile
} from "./water";

const softWater: WaterProfile = {
  ca: 20,
  mg: 5,
  na: 10,
  cl: 20,
  so4: 25,
  hco3: 60,
  ph: 7.4
};

describe("water chemistry", () => {
  it("applies strict salt mass fractions to ion deltas", () => {
    const profile = applySaltAdditions(softWater, 20, [
      { salt: "gypsum", grams: 2 },
      { salt: "calcium_chloride", grams: 1 }
    ]);

    expect(profile.ca).toBeCloseTo(56.91, 2);
    expect(profile.so4).toBeCloseTo(80.8, 1);
    expect(profile.cl).toBeCloseTo(44.12, 1);
  });

  it("calculates alkalinity and residual alkalinity helpers", () => {
    expect(alkalinityAsCaCO3FromHco3(60)).toBe(49.18);
    expect(residualAlkalinityAsCaCO3(softWater)).toBe(31.95);
  });

  it("solves toward a target profile with allowed salts", () => {
    const result = solveWaterTargetProfile({
      sourceProfile: softWater,
      targetProfile: { ca: 80, mg: 12, na: 10, cl: 90, so4: 150, hco3: 60 },
      waterLiters: 25,
      allowedSalts: ["gypsum", "calcium_chloride", "epsom_salt"]
    });

    expect(result.additions.length).toBeGreaterThan(0);
    expect(result.finalProfile.ca).toBeGreaterThan(softWater.ca);
    expect(result.finalProfile.so4).toBeGreaterThan(softWater.so4);
    expect(result.finalProfile.cl).toBeGreaterThan(softWater.cl);
  });

  it("keeps default auto salts Brewfather-like and avoids target overshoot", () => {
    const result = solveWaterTargetProfile({
      sourceProfile: softWater,
      targetProfile: { ca: 80, mg: 12, na: 50, cl: 90, so4: 150, hco3: 160 },
      waterLiters: 25
    });

    expect(result.additions.map((addition) => addition.salt)).not.toContain("baking_soda");
    expect(result.finalProfile.hco3).toBe(softWater.hco3);
    expect(result.finalProfile.ca).toBeLessThanOrEqual(80.01);
    expect(result.finalProfile.mg).toBeLessThanOrEqual(12.01);
    expect(result.finalProfile.cl).toBeLessThanOrEqual(90.01);
    expect(result.finalProfile.so4).toBeLessThanOrEqual(150.01);
  });

  it("can optimize linked ions when a target requires some overshoot", () => {
    const input = {
      sourceProfile: softWater,
      targetProfile: { ca: 55, mg: 8, na: 10, cl: 180, so4: 260, hco3: 60 },
      waterLiters: 25,
      allowedSalts: ["gypsum", "calcium_chloride", "epsom_salt"] satisfies BrewingSaltId[]
    };

    const strict = solveWaterTargetProfile({
      ...input,
      preventTargetOvershoot: true
    });
    const optimized = solveWaterTargetProfile({
      ...input,
      preventTargetOvershoot: false
    });

    expect(optimized.score).toBeLessThan(strict.score);
    expect(optimized.finalProfile.cl).toBeGreaterThan(strict.finalProfile.cl);
    expect(optimized.finalProfile.so4).toBeGreaterThan(strict.finalProfile.so4);
    expect(optimized.finalProfile.ca).toBeGreaterThan(input.targetProfile.ca);
  });

  it("can include baking soda when explicitly allowed", () => {
    const result = solveWaterTargetProfile({
      sourceProfile: softWater,
      targetProfile: { ca: 80, mg: 12, na: 80, cl: 90, so4: 150, hco3: 160 },
      waterLiters: 25,
      allowedSalts: ["gypsum", "calcium_chloride", "epsom_salt", "baking_soda"]
    });

    expect(result.additions.map((addition) => addition.salt)).toContain("baking_soda");
    expect(result.finalProfile.na).toBeGreaterThan(softWater.na);
    expect(result.finalProfile.hco3).toBeGreaterThan(softWater.hco3);
    expect(result.finalProfile.na).toBeLessThanOrEqual(80.01);
    expect(result.finalProfile.hco3).toBeLessThanOrEqual(160.01);
  });

  // Ф10 (notes/water-wizard-fixes.md): солвер — warnings на упор в кэп, вес Mg/Na + асимметричный
  // штраф за овершут, мультистарт против ловушки порядка обхода солей.
  describe("Ф10 solver improvements", () => {
    const burtonTarget: WaterProfile = { ca: 275, mg: 40, na: 25, cl: 35, so4: 610, hco3: 260 };

    it("never scores worse when allowedSalts is widened (Burton, 3 vs 5 salts)", () => {
      const withThreeSalts = solveWaterTargetProfile({
        sourceProfile: softWater,
        targetProfile: burtonTarget,
        waterLiters: 25,
        allowedSalts: ["gypsum", "calcium_chloride", "epsom_salt"],
        preventTargetOvershoot: false
      });
      const withFiveSalts = solveWaterTargetProfile({
        sourceProfile: softWater,
        targetProfile: burtonTarget,
        waterLiters: 25,
        allowedSalts: ["gypsum", "calcium_chloride", "epsom_salt", "baking_soda", "table_salt"],
        preventTargetOvershoot: false
      });

      // Раньше score считался только по ионам, которых касаются allowedSalts — расширение
      // набора солей включало в счёт новые (ранее бесплатные) ионы и делало score «хуже» чисто
      // формально. Теперь score всегда по полному набору ионов, поэтому больше солей не может
      // быть хуже: лишние соли всегда можно оставить на 0 г.
      expect(withFiveSalts.score).toBeLessThanOrEqual(withThreeSalts.score);
    });

    it("caps magnesium overshoot when sulfate demand forces heavier epsom salt use", () => {
      const source: WaterProfile = { ca: 20, mg: 2, na: 10, cl: 20, so4: 25, hco3: 60 };
      // Профиль American IPA/Pale Ale из каталога воды (mg 18 при высоком SO4 275) — эпсом-соль
      // тянет и SO4, и Mg разом, из-за чего Mg легко перелить ради сульфата.
      const target: WaterProfile = { ca: 110, mg: 18, na: 16, cl: 50, so4: 275, hco3: 0 };

      const result = solveWaterTargetProfile({
        sourceProfile: source,
        targetProfile: target,
        waterLiters: 25,
        allowedSalts: ["gypsum", "calcium_chloride", "epsom_salt"],
        preventTargetOvershoot: false
      });

      expect(result.finalProfile.mg).toBeLessThanOrEqual(25);
      expect(result.finalProfile.mg).toBeGreaterThan(target.mg);
    });

    it("flags salt_addition_capped when a salt hits maxGramsPerSalt on a hard target", () => {
      const result = solveWaterTargetProfile({
        sourceProfile: softWater,
        targetProfile: burtonTarget,
        waterLiters: 25,
        allowedSalts: ["gypsum", "calcium_chloride", "epsom_salt"],
        maxGramsPerSalt: 2,
        preventTargetOvershoot: false
      });

      expect(result.warnings).toContain("salt_addition_capped");
      expect(result.additions.every((addition) => addition.grams <= 2)).toBe(true);
    });

    it("does not flag salt_addition_capped when the target is easily reachable", () => {
      const result = solveWaterTargetProfile({
        sourceProfile: softWater,
        targetProfile: { ca: 40, mg: 8, na: 10, cl: 30, so4: 60, hco3: 60 },
        waterLiters: 25,
        allowedSalts: ["gypsum", "calcium_chloride", "epsom_salt"],
        maxGramsPerSalt: 20
      });

      expect(result.warnings).not.toContain("salt_addition_capped");
    });
  });

  // Ремедиация верификации (blocker, 2026-07-14): координатный спуск из 4 пермутаций не находил
  // точку «гипс=20, остальное=0» на 15-20 л — эпсом застревал из-за переплетения so4 и
  // овершут-штрафа, из-за чего [gypsum] давал лучший score, чем [gypsum, calcium_chloride,
  // epsom_salt] (48205 vs 48388 на 18.9 л). Фикс: одномерное сидирование по каждой соли +
  // post-pass prune-and-reoptimize. Инвариант «супермножество солей не хуже подмножества»
  // проверяется на всех объёмах, где было сломано (включая канонический 18.9 л).
  describe("prune-and-reoptimize seeding (ремедиация, 2026-07-14)", () => {
    const burtonTarget: WaterProfile = { ca: 275, mg: 40, na: 25, cl: 35, so4: 610, hco3: 260 };

    it.each([15, 18.9, 20, 25])(
      "gypsum-only score is never better than [gypsum, calcium_chloride, epsom_salt] at %s L",
      (waterLiters) => {
        const oneSalt = solveWaterTargetProfile({
          sourceProfile: softWater,
          targetProfile: burtonTarget,
          waterLiters,
          allowedSalts: ["gypsum"]
        });
        const threeSalts = solveWaterTargetProfile({
          sourceProfile: softWater,
          targetProfile: burtonTarget,
          waterLiters,
          allowedSalts: ["gypsum", "calcium_chloride", "epsom_salt"]
        });

        expect(threeSalts.score).toBeLessThanOrEqual(oneSalt.score);
      }
    );
  });

  it("estimates mash pH with RA and grist class weighting", () => {
    const estimate = estimateMashPh({
      sourceProfile: softWater,
      mashWaterLiters: 15,
      grainKg: 5,
      pctRoasted: 6,
      pctCrystalCaramel: 5
    });

    expect(estimate.model).toBe("hybrid_mash_ph_v1");
    expect(estimate.predictedMashPh20C).toBeLessThan(5.8);
    expect(estimate.warnings).toContain("mash_ph_ballpark_estimate");
  });

  it("calculates sulfate chloride ratio", () => {
    expect(sulfateChlorideRatio({ ...softWater, so4: 120, cl: 60 })).toBe(2);
  });

  it("solves mash acid additions with a bounded monotonic search", () => {
    const result = solveMashAcidAddition({
      unadjustedMashPh20C: 5.72,
      targetMashPh20C: 5.35,
      mashWaterLiters: 16,
      grainKg: 5,
      alkalinityAsCaCO3: alkalinityAsCaCO3FromHco3(softWater.hco3),
      acid: "lactic_acid",
      concentrationPct: 88
    });

    expect(acidNeutralizationMeqPerMl("lactic_acid", 88)).toBeGreaterThan(10);
    expect(result.mashAcidMl).toBeGreaterThan(0);
    expect(result.predictedMashPh20C).toBeCloseTo(5.35, 1);
    expect(result.warnings).toContain("mash_acid_model_practical_approximation");
  });
});

describe("water wizard regression cases (ТЗ notes/water-wizard-fixes.md, verified 2026-07-14)", () => {
  it("meqPerMl matches deLange reference values for both acids", () => {
    expect(acidNeutralizationMeqPerMl("lactic_acid", 88)).toBeCloseTo(11.78, 2);
    expect(acidNeutralizationMeqPerMl("phosphoric_acid", 85)).toBeCloseTo(14.62, 1);
  });

  it("sparge acid: 14 л / щёлочность 172 / pH 7.4→5.7 / молочная 88% ≈ 3.3 мл", () => {
    const result = solveSpargeAcidAddition({
      spargeWaterLiters: 14,
      sourceWaterPh: 7.4,
      targetPh20C: 5.7,
      alkalinityAsCaCO3: 172,
      acid: "lactic_acid",
      concentrationPct: 88
    });

    expect(result.spargeAcidMl).toBeGreaterThanOrEqual(3.0);
    expect(result.spargeAcidMl).toBeLessThanOrEqual(3.6);
    expect(result.warnings).toHaveLength(0);
  });

  it("sparge acid: осмос (щёлочность 13, pH 7.0) ≈ 0.24 мл", () => {
    const result = solveSpargeAcidAddition({
      spargeWaterLiters: 14,
      sourceWaterPh: 7,
      targetPh20C: 5.7,
      alkalinityAsCaCO3: 13,
      acid: "lactic_acid",
      concentrationPct: 88
    });

    expect(result.spargeAcidMl).toBeGreaterThan(0);
    expect(result.spargeAcidMl).toBeLessThanOrEqual(0.4);
  });

  it("mash acid: 17 л Москвы (щёлочность 172, источник pH 7.4), 5.5 кг, pH 5.9→5.4 ≈ 9.5-11 мл", () => {
    const result = solveMashAcidAddition({
      unadjustedMashPh20C: 5.9,
      targetMashPh20C: 5.4,
      mashWaterLiters: 17,
      grainKg: 5.5,
      alkalinityAsCaCO3: 172,
      sourceWaterPh: 7.4,
      acid: "lactic_acid",
      concentrationPct: 88
    });

    expect(result.mashAcidMl).toBeGreaterThanOrEqual(9.5);
    expect(result.mashAcidMl).toBeLessThanOrEqual(11);
    expect(result.predictedMashPh20C).toBeCloseTo(5.4, 2);
    expect(result.iterations).toBe(0);
  });

  it("mash acid: цель уже достигнута → 0 мл, без бисекции", () => {
    const result = solveMashAcidAddition({
      unadjustedMashPh20C: 5.3,
      targetMashPh20C: 5.4,
      mashWaterLiters: 17,
      grainKg: 5.5,
      alkalinityAsCaCO3: 172,
      sourceWaterPh: 7.4,
      acid: "lactic_acid"
    });

    expect(result.mashAcidMl).toBe(0);
    expect(result.iterations).toBe(0);
    expect(result.warnings).toContain("target_already_reached");
  });

  it("mash acid: упор в maxMl запускает бисекцию и не долетает до цели", () => {
    const result = solveMashAcidAddition({
      unadjustedMashPh20C: 5.9,
      targetMashPh20C: 5.4,
      mashWaterLiters: 17,
      grainKg: 5.5,
      alkalinityAsCaCO3: 172,
      sourceWaterPh: 7.4,
      acid: "lactic_acid",
      concentrationPct: 88,
      maxMl: 3
    });

    expect(result.mashAcidMl).toBe(3);
    expect(result.predictedMashPh20C).toBeGreaterThan(5.4);
    expect(result.predictedMashPh20C).toBeLessThan(5.9);
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.warnings).toContain("target_not_reached_within_max_acid");
  });

  it("mash acid: больше щёлочность → больше кислоты (монотонность по Ct)", () => {
    const base = {
      unadjustedMashPh20C: 5.9,
      targetMashPh20C: 5.4,
      mashWaterLiters: 17,
      grainKg: 5.5,
      sourceWaterPh: 7.4,
      acid: "lactic_acid" as const,
      concentrationPct: 88
    };

    const lowAlkalinity = solveMashAcidAddition({ ...base, alkalinityAsCaCO3: 50 });
    const highAlkalinity = solveMashAcidAddition({ ...base, alkalinityAsCaCO3: 200 });

    expect(highAlkalinity.mashAcidMl).toBeGreaterThan(lowAlkalinity.mashAcidMl);
  });

  it("sparge acid: больше щёлочность → больше кислоты", () => {
    const base = {
      spargeWaterLiters: 14,
      sourceWaterPh: 7.4,
      targetPh20C: 5.7,
      acid: "lactic_acid" as const,
      concentrationPct: 88
    };

    const lowAlkalinity = solveSpargeAcidAddition({ ...base, alkalinityAsCaCO3: 50 });
    const highAlkalinity = solveSpargeAcidAddition({ ...base, alkalinityAsCaCO3: 200 });

    expect(highAlkalinity.spargeAcidMl).toBeGreaterThan(lowAlkalinity.spargeAcidMl);
  });

  it("exposes the mash malt buffer constant used by the closed-form model", () => {
    expect(MASH_BUFFER_MEQ_PER_KG_PH).toBe(40);
  });
});

describe("hybrid mash pH model v2 (Ф4+Ф5, notes/water-wizard-fixes.md, окна пересчитаны 2026-07-14)", () => {
  const distilledWater: WaterProfile = { ca: 0, mg: 0, na: 0, cl: 0, so4: 0, hco3: 0 };
  // ca=mg=0 → RA = alkalinityAsCaCO3FromHco3(152.5) = 152.5*50/61 = 125 ровно.
  const ra125Water: WaterProfile = { ca: 0, mg: 0, na: 0, cl: 0, so4: 0, hco3: 152.5 };

  it("дистиллят + 100% пилс → 5.75 (окно 5.7-5.85)", () => {
    const estimate = estimateMashPh({
      sourceProfile: distilledWater,
      mashWaterLiters: 15,
      grainKg: 5
    });

    expect(estimate.predictedMashPh20C).toBe(5.75);
    expect(estimate.predictedMashPh20C).toBeGreaterThanOrEqual(5.7);
    expect(estimate.predictedMashPh20C).toBeLessThanOrEqual(5.85);
  });

  it("стаут: 80% база / 12% жжёный / 8% карамель (цвет неизвестен), RA 125, затор 17л/5.5кг → ~5.61 (окно 5.55-5.65, было 5.64 у линейной модели)", () => {
    const estimate = estimateMashPh({
      sourceProfile: ra125Water,
      mashWaterLiters: 17,
      grainKg: 5.5,
      pctRoasted: 12,
      pctCrystalCaramel: 8
    });

    expect(estimate.predictedMashPh20C).toBeGreaterThanOrEqual(5.55);
    expect(estimate.predictedMashPh20C).toBeLessThanOrEqual(5.65);
  });

  it("санити: 100% пилс на воде с RA 125, thickness 3 → ~5.88 (самосогласованная сепциация, было 5.94 у линейной модели)", () => {
    // Линейная модель (0-й волны) предполагала 100%-ю нейтрализацию всей щёлочности солодом:
    // 5.75 + (125/50)×3/40 = 5.94. Самосогласованная модель (Riffe Eq.4 c Z(pH)) учитывает,
    // что карбонат нейтрализуется солодом лишь частично — до pH затора, а не полностью, — и
    // даёт заметно более низкий сдвиг: ~5.88 (см. ремедиацию по итогам верификации кислотных солверов).
    const estimate = estimateMashPh({
      sourceProfile: ra125Water,
      mashWaterLiters: 15,
      grainKg: 5
    });

    expect(estimate.predictedMashPh20C).toBe(5.88);
  });

  it("монотонность: больше roasted → ниже pH", () => {
    const lowRoasted = estimateMashPh({
      sourceProfile: distilledWater,
      mashWaterLiters: 15,
      grainKg: 5,
      pctRoasted: 5
    });
    const highRoasted = estimateMashPh({
      sourceProfile: distilledWater,
      mashWaterLiters: 15,
      grainKg: 5,
      pctRoasted: 20
    });

    expect(highRoasted.predictedMashPh20C).toBeLessThan(lowRoasted.predictedMashPh20C);
  });

  it("монотонность: больше остаточная щёлочность (RA) → выше pH", () => {
    const lowRa = estimateMashPh({
      sourceProfile: distilledWater,
      mashWaterLiters: 15,
      grainKg: 5,
      pctRoasted: 10,
      pctCrystalCaramel: 5
    });
    const highRa = estimateMashPh({
      sourceProfile: ra125Water,
      mashWaterLiters: 15,
      grainKg: 5,
      pctRoasted: 10,
      pctCrystalCaramel: 5
    });

    expect(highRa.predictedMashPh20C).toBeGreaterThan(lowRa.predictedMashPh20C);
  });

  it("монотонность: crystal EBC 300 даёт pH ниже, чем crystal EBC 40", () => {
    const paleCrystal = estimateMashPh({
      sourceProfile: distilledWater,
      mashWaterLiters: 15,
      grainKg: 5,
      pctCrystalCaramel: 15,
      crystalColorEbcAvg: 40
    });
    const darkCrystal = estimateMashPh({
      sourceProfile: distilledWater,
      mashWaterLiters: 15,
      grainKg: 5,
      pctCrystalCaramel: 15,
      crystalColorEbcAvg: 300
    });

    expect(darkCrystal.predictedMashPh20C).toBeLessThan(paleCrystal.predictedMashPh20C);
  });

  it("вырожденный кейс: 100% адъюнкта (сахар) не буферит — фолбэк на буфер базового солода", () => {
    const estimate = estimateMashPh({
      sourceProfile: distilledWater,
      mashWaterLiters: 15,
      grainKg: 5,
      pctAdjunct: 100
    });

    expect(estimate.breakdown.gristDiPh).toBeCloseTo(5.75, 3);
  });
});

describe("hybrid mash pH model self-consistency with the acid solver (ремедиация двойного счёта, 2026-07-14)", () => {
  const acid = "lactic_acid" as const;
  const concentrationPct = 88;
  const meqPerMl = acidNeutralizationMeqPerMl(acid, concentrationPct);
  const mashWaterLiters = 15;
  const grainKg = 5; // 100% base malt → ΣB = MASH_BUFFER_MEQ_PER_KG_PH = 40, совпадает с константой солвера.
  const sourceWaterPh = 7.4;
  const targetMashPh20C = 5.4;

  it("estimateMashPh → solveMashAcidAddition совпадает с независимой формулой «от DI» на диапазоне hco3 100..600 (≤3%)", () => {
    const diffsPct: Array<{ hco3: number; diffPct: number }> = [];

    for (let hco3 = 100; hco3 <= 600; hco3 += 100) {
      const sourceProfile: WaterProfile = { ca: 0, mg: 0, na: 0, cl: 0, so4: 0, hco3, ph: sourceWaterPh };
      const alk = alkalinityAsCaCO3FromHco3(hco3);

      const estimate = estimateMashPh({ sourceProfile, mashWaterLiters, grainKg });
      const solved = solveMashAcidAddition({
        unadjustedMashPh20C: estimate.predictedMashPh20C,
        targetMashPh20C,
        mashWaterLiters,
        grainKg,
        alkalinityAsCaCO3: alk,
        sourceWaterPh,
        acid,
        concentrationPct,
        maxMl: 500 // не даём бисекции по maxMl вмешаться — сверяем именно замкнутую формулу.
      });

      expect(solved.iterations).toBe(0);
      const acidMeqActual = solved.mashAcidMl * meqPerMl;

      // Независимая референсная формула «от DI» (не использует estimateMashPh вообще):
      const chargeDelta = carbonateChargeFraction(sourceWaterPh) - carbonateChargeFraction(targetMashPh20C);
      const totalCarbonate = totalCarbonateMmolPerL(alk, sourceWaterPh);
      const acidMeqRef = MASH_BUFFER_MEQ_PER_KG_PH * grainKg * (5.75 - targetMashPh20C)
        + totalCarbonate * mashWaterLiters * chargeDelta;

      const diffPct = (Math.abs(acidMeqActual - acidMeqRef) / acidMeqRef) * 100;
      diffsPct.push({ hco3, diffPct: Math.round(diffPct * 100) / 100 });
      expect(diffPct).toBeLessThanOrEqual(3);
    }

    // Расхождение (округление pred до 2 знаков + демпфированный фикс-поинт вместо точного корня) —
    // hco3=100..600 → diffPct: 0.67, 0.8, 0.03, 0.64, 0.69, 0.43 (%), все ≤3%.
    expect(diffsPct.every((row) => row.diffPct <= 3)).toBe(true);
  });

  it("отрицательная RA (ca 300, mg 50, hco3 50): предсказанный pH ниже DI-pH базового солода, и доза кислоты меньше, чем при ca=mg=0 при той же щёлочности", () => {
    const hardProfile: WaterProfile = { ca: 300, mg: 50, na: 0, cl: 0, so4: 0, hco3: 50 };
    const softProfile: WaterProfile = { ca: 0, mg: 0, na: 0, cl: 0, so4: 0, hco3: 50 };
    const alk = alkalinityAsCaCO3FromHco3(50);

    const hardEstimate = estimateMashPh({ sourceProfile: hardProfile, mashWaterLiters, grainKg });
    const softEstimate = estimateMashPh({ sourceProfile: softProfile, mashWaterLiters, grainKg });

    // DI-pH базового солода в этой модели — 5.75 (дефолт baseMaltDiPh, засыпь чисто базовая).
    expect(hardEstimate.predictedMashPh20C).toBeLessThan(5.75);
    expect(hardEstimate.predictedMashPh20C).toBeLessThan(softEstimate.predictedMashPh20C);

    const target = 5.3;
    const hardAcid = solveMashAcidAddition({
      unadjustedMashPh20C: hardEstimate.predictedMashPh20C,
      targetMashPh20C: target,
      mashWaterLiters,
      grainKg,
      alkalinityAsCaCO3: alk,
      acid,
      concentrationPct
    });
    const softAcid = solveMashAcidAddition({
      unadjustedMashPh20C: softEstimate.predictedMashPh20C,
      targetMashPh20C: target,
      mashWaterLiters,
      grainKg,
      alkalinityAsCaCO3: alk,
      acid,
      concentrationPct
    });

    expect(hardAcid.mashAcidMl).toBeLessThan(softAcid.mashAcidMl);
  });
});
