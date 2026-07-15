import { describe, expect, it } from "vitest";

import { recipeWaterPlanMetaSchema } from "../features/recipes/contracts";
import {
  buildRecipeWaterPlanResult,
  classifyFermentable,
  summarizeFermentablesForMashPh,
} from "../features/recipes/water-plan";

describe("classifyFermentable", () => {
  it("classifies dark-roasted malts as roasted even with the 'cara' keyword lurking nearby", () => {
    expect(
      classifyFermentable({ name: "Chocolate Malt", weightKg: 1 }),
    ).toBe("roasted");
    expect(
      classifyFermentable({
        name: "Carafa III",
        weightKg: 1,
        maltType: "roasted",
      }),
    ).toBe("roasted");
    expect(
      classifyFermentable({ name: "Carafa III", weightKg: 1 }),
    ).toBe("roasted");
    expect(
      classifyFermentable({ name: "Жжёный солод", weightKg: 1 }),
    ).toBe("roasted");
  });

  it("uses maltType + color as arbiter for crystal/caramel malts tagged 'special'", () => {
    expect(
      classifyFermentable({
        name: "Карамельный солод 150",
        weightKg: 1,
        maltType: "special",
        colorEbcMin: 150,
        colorEbcMax: 150,
      }),
    ).toBe("crystal");
    expect(classifyFermentable({ name: "CaraMunich", weightKg: 1 })).toBe(
      "crystal",
    );
  });

  it("classifies kilned malts (Munich/Vienna) by name keyword", () => {
    expect(classifyFermentable({ name: "Munich Malt", weightKg: 1 })).toBe(
      "kilned",
    );
    expect(classifyFermentable({ name: "Vienna Malt", weightKg: 1 })).toBe(
      "kilned",
    );
  });

  it("classifies acidulated malt by keyword", () => {
    expect(classifyFermentable({ name: "Кислый солод", weightKg: 1 })).toBe(
      "acidulated",
    );
    expect(
      classifyFermentable({ name: "Acidulated Malt", weightKg: 1 }),
    ).toBe("acidulated");
  });

  it("classifies sugar/adjuncts by keyword", () => {
    expect(classifyFermentable({ name: "Сахар", weightKg: 1 })).toBe(
      "adjunct",
    );
    expect(classifyFermentable({ name: "Rice Hulls", weightKg: 1 })).toBe(
      "adjunct",
    );
  });

  it("falls back to base when nothing matches", () => {
    expect(classifyFermentable({ name: "Pale Ale Malt", weightKg: 1 })).toBe(
      "base",
    );
  });

  it("classifies non-malt fermentables (subtype=fermentable) as adjunct regardless of malty-looking names", () => {
    expect(
      classifyFermentable({
        name: "Blackberry",
        subtype: "fermentable",
        weightKg: 1,
      }),
    ).toBe("adjunct");
    expect(
      classifyFermentable({
        name: "Черная смородина",
        subtype: "fermentable",
        weightKg: 1,
      }),
    ).toBe("adjunct");
    expect(
      classifyFermentable({
        name: "Chocolate Cookie Syrup",
        subtype: "fermentable",
        weightKg: 1,
      }),
    ).toBe("adjunct");
    expect(
      classifyFermentable({
        name: "Рисовая шелуха",
        subtype: "fermentable",
        weightKg: 1,
      }),
    ).toBe("adjunct");
  });

  it("does not let short Cyrillic keyword homographs match mid-word (Кристальный/Кристалл)", () => {
    expect(
      classifyFermentable({
        name: "Кристальный 40",
        subtype: "malt",
        maltType: "special",
        weightKg: 1,
        colorEbcMin: 80,
        colorEbcMax: 80,
      }),
    ).toBe("crystal");
    expect(
      classifyFermentable({
        name: "Кристалл Т-50",
        subtype: "malt",
        maltType: "special",
        weightKg: 1,
      }),
    ).toBe("crystal");
  });

  it("matches a known malt's name keywords before falling through to the adjunct-only path", () => {
    expect(
      classifyFermentable({
        name: "Honey Biscuit",
        subtype: "malt",
        maltType: "special",
        weightKg: 1,
        colorEbcMin: 84,
        colorEbcMax: 84,
      }),
    ).toBe("kilned");
    expect(
      classifyFermentable({
        name: "Chocolate Rye",
        subtype: "malt",
        maltType: "roasted",
        weightKg: 1,
      }),
    ).toBe("roasted");
  });

  it("does not apply adjunct keywords to name-only malt (subtype=malt, no maltType) — 'Honey Malt' stays base, not adjunct", () => {
    expect(
      classifyFermentable({
        name: "Honey Malt",
        subtype: "malt",
        weightKg: 1,
      }),
    ).toBe("base");
  });

  it("matches only the 'чёрный/черный' adjective for roasted, not berry/fruit names sharing the 'черн' root", () => {
    expect(
      classifyFermentable({ name: "Чёрный солод", weightKg: 1 }),
    ).toBe("roasted");
    // "Черный ржаной" не называет себя «солодом»/«malt» и не несёт maltType/subtype —
    // после ремедиации Black Treacle цветовое прилагательное «черны» само по себе
    // больше не даёт roasted в этой ветке (см. docstring classifyFermentable, ветка В).
    // Осознанная деградация: base вместо roasted — умеренный буфер безопаснее ложного
    // крайнего класса.
    expect(
      classifyFermentable({ name: "Черный ржаной", weightKg: 1 }),
    ).toBe("base");
    expect(
      classifyFermentable({ name: "Черничный", weightKg: 1 }),
    ).not.toBe("roasted");
    expect(
      classifyFermentable({ name: "Черносмородиновый", weightKg: 1 }),
    ).not.toBe("roasted");
    expect(
      classifyFermentable({ name: "Чернослив", weightKg: 1 }),
    ).not.toBe("roasted");
  });

  it("classifies 'Медовое Печенье' (RU Honey Biscuit, maltType special) as kilned via the RU 'печенье' keyword", () => {
    expect(
      classifyFermentable({
        name: "Медовое Печенье",
        subtype: "malt",
        maltType: "special",
        weightKg: 1,
        colorEbcMin: 84,
        colorEbcMax: 84,
      }),
    ).toBe("kilned");
  });

  it("classifies name-only fruit/juice additions (subtype=null) as adjunct via the fruit keyword set", () => {
    expect(
      classifyFermentable({ name: "Черничный сок", weightKg: 1 }),
    ).toBe("adjunct");
    expect(
      classifyFermentable({ name: "Вишнёвое пюре", weightKg: 1 }),
    ).toBe("adjunct");
  });

  it("classifies plural BeerXML fruit-adjunct names (subtype=null) as adjunct via fruit stems, not base — verification finding", () => {
    // "cherry"/"berry" были ключами в единственном числе и не матчили импортные
    // BeerXML-имена во множественном ("Black Cherries", "Blackberries",
    // "Raspberries") — y→ies меняет хвост слова. Стемы "cherr"/"berr" покрывают
    // обе формы.
    expect(
      classifyFermentable({ name: "Black Cherries", weightKg: 1 }),
    ).toBe("adjunct");
    expect(
      classifyFermentable({ name: "Blackberries", weightKg: 1 }),
    ).toBe("adjunct");
    expect(
      classifyFermentable({ name: "Raspberries", weightKg: 1 }),
    ).toBe("adjunct");
    // Регресс: единственное число по-прежнему adjunct.
    expect(
      classifyFermentable({ name: "Cherry Puree", weightKg: 1 }),
    ).toBe("adjunct");
  });

  it("checks adjunct keywords before malt keywords for name-only inputs (subtype=null) with no malt/солод hint in the name — 'Blackstrap Molasses' and 'Black Currant juice concentrate' no longer get caught by the roasted 'black' keyword", () => {
    expect(
      classifyFermentable({ name: "Blackstrap Molasses", weightKg: 1 }),
    ).toBe("adjunct");
    expect(
      classifyFermentable({
        name: "Black Currant juice concentrate",
        weightKg: 1,
      }),
    ).toBe("adjunct");
  });

  it("keeps name-only inputs (subtype=null) that call themselves malt as malt — adjunct keywords do not apply", () => {
    expect(classifyFermentable({ name: "Honey Malt", weightKg: 1 })).toBe(
      "base",
    );
    expect(
      classifyFermentable({ name: "Dry Malt Extract", weightKg: 1 }),
    ).toBe("base");
    expect(
      classifyFermentable({ name: "Солодовый экстракт", weightKg: 1 }),
    ).toBe("base");
  });

  it("still finds malt keywords for name-only inputs (subtype=null) without a 'malt'/'солод' hint, after adjunct keywords miss", () => {
    expect(classifyFermentable({ name: "Carafa III", weightKg: 1 })).toBe(
      "roasted",
    );
    expect(
      classifyFermentable({ name: "Чёрный солод", weightKg: 1 }),
    ).toBe("roasted");
  });

  describe("ремедиация Black Treacle (notes/water-wizard-fixes.md)", () => {
    it("classifies 'Black Treacle' and its RU transliteration as adjunct via the treacle keyword, not roasted via 'black'", () => {
      expect(
        classifyFermentable({ name: "Black Treacle", weightKg: 1 }),
      ).toBe("adjunct");
      expect(
        classifyFermentable({ name: "Тёмный тритл", weightKg: 1 }),
      ).toBe("adjunct");
    });

    // Осознанная деградация: имя без «malt»/«солод» в названии и без maltType/
    // subtype="malt" — единственный сигнал, что это солод, был бы цветовым словом
    // (black/chocolate), а это слишком слабый сигнал для крайнего класса roasted
    // (B=69, pHi 4.64). Такие засыпи уходят в base — умеренный буфер безопаснее
    // ложного roasted. Полный набор ключей (включая цветовые) остаётся на ветках с
    // maltType, subtype="malt" и с «malt»/«солод» в имени — см. тесты ниже.
    it("degrades name-only roasted malts without a 'malt'/'солод' hint and without maltType to base, not roasted (weak color-only signal)", () => {
      expect(classifyFermentable({ name: "Black Patent", weightKg: 1 })).toBe(
        "base",
      );
      expect(classifyFermentable({ name: "Chocolate Rye", weightKg: 1 })).toBe(
        "base",
      );
    });

    it("keeps roasted for strong roasted keywords (carafa/roast/жжён) even without a 'malt'/'солод' hint", () => {
      expect(classifyFermentable({ name: "Carafa III", weightKg: 1 })).toBe(
        "roasted",
      );
      expect(classifyFermentable({ name: "Roasted Barley", weightKg: 1 })).toBe(
        "roasted",
      );
    });

    it("keeps roasted via the full keyword set when the name claims 'malt'/'солод'", () => {
      expect(classifyFermentable({ name: "Chocolate Malt", weightKg: 1 })).toBe(
        "roasted",
      );
      expect(classifyFermentable({ name: "Чёрный солод", weightKg: 1 })).toBe(
        "roasted",
      );
    });

    it("keeps roasted for 'Chocolate Rye' when maltType is known (branch A untouched)", () => {
      expect(
        classifyFermentable({
          name: "Chocolate Rye",
          maltType: "roasted",
          weightKg: 1,
        }),
      ).toBe("roasted");
    });
  });
});

describe("recipe water plan result", () => {
  it("uses batch size volume and solves salts plus mash acid", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      beerSrm: 8,
      fermentables: [
        { name: "Pale Malt", subtype: "malt", weightKg: 4.5 },
        { name: "Caramel 60", subtype: "crystal", weightKg: 0.5 },
      ],
      waterPlanMeta: {
        setupEnabled: true,
        engine: "balanced_default",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 20,
          mg: 5,
          na: 10,
          cl: 20,
          so4: 30,
          hco3: 90,
          ph: 7.6,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: {
          ca: 80,
          mg: 10,
          na: 15,
          cl: 90,
          so4: 150,
          hco3: 70,
          ph: null,
        },
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: null,
        spargeWaterVolumeL: null,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: 5.35,
        spargeAcidificationEnabled: true,
        spargeSourcePh: 7.6,
        targetSpargePh: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: 88,
        calibrationOffset: null,
      },
    });

    expect(result.waterVolumes.source).toBe("estimated_total_water");
    expect(result.waterVolumes.totalWaterL).toBeCloseTo(28.88, 2);
    expect(result.waterVolumes.mashWaterL).toBeCloseTo(28.88, 2);
    expect(result.waterVolumes.spargeWaterL).toBe(0);
    expect(result.waterVolumes.suggestedMashWaterL).toBe(15);
    expect(result.waterVolumes.suggestedSpargeWaterL).toBeCloseTo(13.88, 2);
    expect(result.waterVolumes.grainAbsorptionLPerKg).toBe(0.8);
    expect(result.waterVolumes.grainAbsorptionLossL).toBe(4);
    expect(result.totalSaltAdditions.length).toBeGreaterThan(0);
    expect(result.finalProfile.ca).toBeGreaterThan(20);
    expect(result.mashPhEstimate?.model).toBe("hybrid_mash_ph_v1");
    expect(result.mashAcidAddition?.label).toBe("Молочная кислота");
    expect(result.mashAcidAddition?.mashAcidMl).toBeGreaterThanOrEqual(0);
    expect(result.spargeAcidAddition).toBeNull();
    expect(result.predictedMashPhAfterAcid20C).toBeLessThanOrEqual(
      result.mashPhEstimate?.predictedMashPh20C ?? 99,
    );
  });

  it("uses recipe water grain absorption override for estimated total water", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      boilTimeMinutes: 60,
      waterPlanMeta: recipeWaterPlanMetaSchema.parse({
        setupEnabled: true,
        sourceProfileMode: "ro_distilled",
        sourceProfile: {
          ca: 0,
          mg: 0,
          na: 0,
          cl: 0,
          so4: 0,
          hco3: 0,
          ph: null,
        },
        targetProfileMode: "manual",
        targetProfile: null,
        targetMashPh: null,
        grainAbsorptionLPerKg: 1.1,
      }),
    });

    expect(result.waterVolumes.source).toBe("estimated_total_water");
    expect(result.waterVolumes.totalWaterL).toBeCloseTo(30.38, 2);
    expect(result.waterVolumes.suggestedMashWaterL).toBe(15);
    expect(result.waterVolumes.suggestedSpargeWaterL).toBeCloseTo(15.38, 2);
    expect(result.waterVolumes.grainAbsorptionLPerKg).toBe(1.1);
    expect(result.waterVolumes.grainAbsorptionLossL).toBe(5.5);
  });

  it("does not emit salts or acid while water setup is disabled", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      beerSrm: 8,
      waterPlanMeta: recipeWaterPlanMetaSchema.parse({
        setupEnabled: false,
        engine: "advanced_manual",
        sourceProfileMode: "manual",
        sourceProfile: {
          ca: 20,
          mg: 5,
          na: 10,
          cl: 20,
          so4: 30,
          hco3: 90,
          ph: 7.6,
        },
        targetProfileMode: "manual",
        targetProfile: {
          ca: 80,
          mg: 10,
          na: 15,
          cl: 90,
          so4: 150,
          hco3: 70,
          ph: null,
        },
        targetMashPh: 5.35,
        manualSaltAdditions: [{ salt: "gypsum", grams: 4, target: "all" }],
        selectedAcid: "lactic_acid",
        acidConcentrationPct: 88,
      }),
    });

    expect(result.totalSaltAdditions).toEqual([]);
    expect(result.mashSaltAdditions).toEqual([]);
    expect(result.spargeSaltAdditions).toEqual([]);
    expect(result.mashPhEstimate).toBeNull();
    expect(result.mashAcidAddition).toBeNull();
    expect(result.spargeAcidAddition).toBeNull();
  });

  it("uses manual mash/sparge split and skips pH when target mash pH is not set", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 12,
      grainKg: 3,
      waterPlanMeta: {
        setupEnabled: false,
        engine: "balanced_default",
        phModel: "kolbach_ra_quick",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 15,
          mg: 3,
          na: 8,
          cl: 18,
          so4: 25,
          hco3: 40,
          ph: null,
        },
        targetProfileMode: "balanced",
        targetProfilePresetId: null,
        targetProfile: null,
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: 8,
        spargeWaterVolumeL: 4,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: null,
        spargeAcidificationEnabled: false,
        spargeSourcePh: null,
        targetSpargePh: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: null,
        calibrationOffset: null,
      },
    });

    expect(result.waterVolumes.source).toBe("manual_split");
    expect(result.waterVolumes.totalWaterL).toBe(12);
    expect(result.waterVolumes.mashWaterL).toBe(8);
    expect(result.waterVolumes.spargeWaterL).toBe(4);
    expect(result.engine).toBe("profile_only");
    expect(result.mashPhEstimate).toBeNull();
    expect(result.mashAcidAddition).toBeNull();
  });

  it("scopes manual salt additions to all water, mash or sparge", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "advanced_manual",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 20,
          mg: 5,
          na: 10,
          cl: 20,
          so4: 30,
          hco3: 90,
          ph: 7.6,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: null,
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: 12,
        spargeWaterVolumeL: 8,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [
          { salt: "gypsum", grams: 4, target: "all" },
          { salt: "calcium_chloride", grams: 3, target: "mash" },
          { salt: "epsom_salt", grams: 2, target: "sparge" },
        ],
        targetMashPh: 5.35,
        spargeAcidificationEnabled: false,
        spargeSourcePh: null,
        targetSpargePh: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: 88,
        calibrationOffset: null,
      },
    });
    const grams = (
      items: typeof result.mashSaltAdditions,
      salt: string,
    ) => items.find((addition) => addition.salt === salt)?.grams ?? 0;

    expect(grams(result.mashSaltAdditions, "gypsum")).toBeCloseTo(2.4, 2);
    expect(grams(result.spargeSaltAdditions, "gypsum")).toBeCloseTo(1.6, 2);
    expect(grams(result.mashSaltAdditions, "calcium_chloride")).toBe(3);
    expect(grams(result.spargeSaltAdditions, "calcium_chloride")).toBe(0);
    expect(grams(result.mashSaltAdditions, "epsom_salt")).toBe(0);
    expect(grams(result.spargeSaltAdditions, "epsom_salt")).toBe(2);
    expect(result.totalSaltAdditions.map((addition) => addition.target)).toEqual([
      "all",
      "mash",
      "sparge",
    ]);
    expect(result.finalProfile.ca).toBeGreaterThan(20);
    expect(result.finalProfile.mg).toBeGreaterThan(5);
    expect(result.finalProfile.cl).toBeGreaterThan(20);
    expect(result.finalProfile.so4).toBeGreaterThan(30);
  });

  it("does not include baking soda in auto salts by default", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "balanced_default",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 20,
          mg: 5,
          na: 10,
          cl: 20,
          so4: 30,
          hco3: 60,
          ph: 7.6,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: {
          ca: 80,
          mg: 10,
          na: 80,
          cl: 90,
          so4: 150,
          hco3: 160,
          ph: null,
        },
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: null,
        spargeWaterVolumeL: null,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: null,
        spargeAcidificationEnabled: false,
        spargeSourcePh: null,
        targetSpargePh: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: null,
        calibrationOffset: null,
      },
    });

    expect(result.totalSaltAdditions.map((addition) => addition.salt)).not.toContain(
      "baking_soda",
    );
    expect(result.finalProfile.hco3).toBe(60);
  });

  it("includes baking soda in auto salts only when explicitly enabled", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "balanced_default",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 20,
          mg: 5,
          na: 10,
          cl: 20,
          so4: 30,
          hco3: 60,
          ph: 7.6,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: {
          ca: 80,
          mg: 10,
          na: 80,
          cl: 90,
          so4: 150,
          hco3: 160,
          ph: null,
        },
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: null,
        spargeWaterVolumeL: null,
        totalWaterVolumeL: null,
        allowedSalts: [
          "gypsum",
          "calcium_chloride",
          "epsom_salt",
          "baking_soda",
        ],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: null,
        spargeAcidificationEnabled: false,
        spargeSourcePh: null,
        targetSpargePh: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: null,
        calibrationOffset: null,
      },
    });

    expect(result.totalSaltAdditions.map((addition) => addition.salt)).toContain(
      "baking_soda",
    );
    expect(result.finalProfile.na).toBeGreaterThan(10);
    expect(result.finalProfile.hco3).toBeGreaterThan(60);
    expect(result.finalProfile.na).toBeLessThanOrEqual(80.01);
    expect(result.finalProfile.hco3).toBeGreaterThan(150);
  });

  it("uses equipment water requirements when an equipment volume plan is available", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      equipmentVolumePlan: {
        totalWaterL: 28.625,
        mashWaterL: 15,
        spargeWaterL: 13.625,
      },
      grainKg: 5,
      beerSrm: 8,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "balanced_default",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 20,
          mg: 5,
          na: 10,
          cl: 20,
          so4: 30,
          hco3: 90,
          ph: 7.6,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: {
          ca: 80,
          mg: 10,
          na: 15,
          cl: 90,
          so4: 150,
          hco3: 70,
          ph: null,
        },
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: null,
        spargeWaterVolumeL: null,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: 5.35,
        spargeAcidificationEnabled: false,
        spargeSourcePh: null,
        targetSpargePh: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: 88,
        calibrationOffset: null,
      },
    });

    expect(result.waterVolumes.source).toBe("equipment_profile");
    expect(result.waterVolumes.totalWaterL).toBeCloseTo(28.63, 2);
    expect(result.waterVolumes.suggestedMashWaterL).toBe(15);
    expect(result.waterVolumes.suggestedSpargeWaterL).toBeCloseTo(13.63, 2);
    expect(result.warnings).not.toContain("water_split_below_batch_volume");
  });

  it("allows manual mash and sparge water to exceed batch size", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "balanced_default",
        phModel: "kolbach_ra_quick",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 15,
          mg: 3,
          na: 8,
          cl: 18,
          so4: 25,
          hco3: 40,
          ph: null,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: {
          ca: 50,
          mg: 5,
          na: 10,
          cl: 70,
          so4: 90,
          hco3: 40,
          ph: null,
        },
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: 17,
        spargeWaterVolumeL: 12,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: null,
        spargeAcidificationEnabled: false,
        spargeSourcePh: null,
        targetSpargePh: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: null,
        calibrationOffset: null,
      },
    });

    expect(result.waterVolumes.source).toBe("manual_split");
    expect(result.waterVolumes.totalWaterL).toBe(29);
    expect(result.waterVolumes.mashWaterL).toBe(17);
    expect(result.waterVolumes.spargeWaterL).toBe(12);
    expect(result.warnings).not.toContain("water_split_below_batch_volume");
  });

  it("warns only when manual mash and sparge water are below batch size", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "balanced_default",
        phModel: "kolbach_ra_quick",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 15,
          mg: 3,
          na: 8,
          cl: 18,
          so4: 25,
          hco3: 40,
          ph: null,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: null,
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: 8,
        spargeWaterVolumeL: 4,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: null,
        spargeAcidificationEnabled: false,
        spargeSourcePh: null,
        targetSpargePh: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: null,
        calibrationOffset: null,
      },
    });

    expect(result.waterVolumes.totalWaterL).toBe(12);
    expect(result.warnings).toContain("water_split_below_batch_volume");
  });

  it("Ф11: warns mash_water_volume_zero when mash pH target is on but manual split leaves 0 л for the mash", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "balanced_default",
        phModel: "kolbach_ra_quick",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 15,
          mg: 3,
          na: 8,
          cl: 18,
          so4: 25,
          hco3: 40,
          ph: null,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: null,
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: 0,
        spargeWaterVolumeL: 20,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: 5.35,
        spargeAcidificationEnabled: false,
        spargeSourcePh: null,
        targetSpargePh: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: null,
        calibrationOffset: null,
      },
    });

    expect(result.warnings).toContain("mash_water_volume_zero");
  });

  it("Ф11: warns mash_water_volume_zero for a manual split with no grain bill even without mash pH correction (audit's «сплит без засыпи»)", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 0,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "profile_only",
        phModel: "kolbach_ra_quick",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 15,
          mg: 3,
          na: 8,
          cl: 18,
          so4: 25,
          hco3: 40,
          ph: null,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: null,
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: 0,
        spargeWaterVolumeL: 20,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: null,
        spargeAcidificationEnabled: false,
        spargeSourcePh: null,
        targetSpargePh: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: null,
        calibrationOffset: null,
      },
    });

    expect(result.warnings).toContain("mash_water_volume_zero");
  });

  it("does not warn mash_water_volume_zero when there is a grain bill and mash pH correction is off", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "profile_only",
        phModel: "kolbach_ra_quick",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 15,
          mg: 3,
          na: 8,
          cl: 18,
          so4: 25,
          hco3: 40,
          ph: null,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: null,
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: 0,
        spargeWaterVolumeL: 20,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: null,
        spargeAcidificationEnabled: false,
        spargeSourcePh: null,
        targetSpargePh: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: null,
        calibrationOffset: null,
      },
    });

    expect(result.warnings).not.toContain("mash_water_volume_zero");
  });

  it("allows sparge acidification without mash pH correction", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "profile_only",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 15,
          mg: 3,
          na: 8,
          cl: 18,
          so4: 25,
          hco3: 90,
          ph: 7.6,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: {
          ca: 50,
          mg: 5,
          na: 10,
          cl: 70,
          so4: 90,
          hco3: 40,
          ph: null,
        },
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: 13,
        spargeWaterVolumeL: 7,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: null,
        spargeAcidificationEnabled: true,
        spargeSourcePh: 7.6,
        targetSpargePh: 5.7,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: 88,
        calibrationOffset: null,
      },
    });

    expect(result.mashPhEstimate).toBeNull();
    expect(result.mashAcidAddition).toBeNull();
    expect(result.spargeAcidAddition?.spargeAcidMl).toBeGreaterThan(0);
  });

  it("does not auto-solve salts in manual additions mode when no manual salts are entered", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      beerSrm: 8,
      fermentables: [
        { name: "Pale Malt", subtype: "malt", weightKg: 4.5 },
        { name: "Caramel 60", subtype: "crystal", weightKg: 0.5 },
      ],
      waterPlanMeta: {
        setupEnabled: true,
        engine: "advanced_manual",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 20,
          mg: 5,
          na: 10,
          cl: 20,
          so4: 30,
          hco3: 90,
          ph: 7.6,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: {
          ca: 80,
          mg: 10,
          na: 15,
          cl: 90,
          so4: 150,
          hco3: 70,
          ph: null,
        },
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: null,
        spargeWaterVolumeL: null,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: 5.35,
        spargeAcidificationEnabled: false,
        spargeSourcePh: null,
        targetSpargePh: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: 88,
        calibrationOffset: null,
      },
    });

    expect(result.totalSaltAdditions).toEqual([]);
    expect(result.finalProfile.ca).toBe(20);
    expect(result.finalProfile.so4).toBe(30);
    expect(result.mashPhEstimate?.model).toBe("hybrid_mash_ph_v1");
  });

  it("counts baking soda added to the sparge bucket toward sparge acidification", () => {
    const buildResult = (manualSaltAdditions: { salt: string; grams: number; target: "all" | "mash" | "sparge" }[]) =>
      buildRecipeWaterPlanResult({
        fallbackBatchVolumeL: 20,
        grainKg: 5,
        waterPlanMeta: {
          setupEnabled: true,
          engine: "advanced_manual",
          phModel: "hybrid_mash_ph_v1",
          sourceProfileMode: "manual",
          sourceProfilePresetId: null,
          sourceProfile: {
            ca: 0,
            mg: 0,
            na: 0,
            cl: 0,
            so4: 0,
            hco3: 209.84,
            ph: 7.4,
          },
          targetProfileMode: "manual",
          targetProfilePresetId: null,
          targetProfile: null,
          showWaterAdditivesInIngredients: false,
          blendRatio: null,
          mashWaterVolumeL: 3,
          spargeWaterVolumeL: 14,
          totalWaterVolumeL: null,
          allowedSalts: [],
          allowedAcids: [],
          manualSaltAdditions,
          targetMashPh: null,
          spargeAcidificationEnabled: true,
          spargeSourcePh: 7.4,
          targetSpargePh: 5.7,
          selectedAcid: "lactic_acid",
          acidConcentrationPct: 88,
          calibrationOffset: null,
        },
      });

    const withoutSoda = buildResult([]);
    const withSoda = buildResult([{ salt: "baking_soda", grams: 2, target: "sparge" }]);

    // 14 л промывочной воды, щёлочность 172 ppm CaCO3 (deLange): без соды доза кислоты
    // близка к эталону ТЗ (3,3±0,3 мл); сода поднимает щёлочность промывочного bucket-профиля,
    // так что доза заметно растёт.
    expect(withoutSoda.spargeAcidAddition?.spargeAcidMl).toBeCloseTo(3.31, 1);
    expect(withSoda.spargeAcidAddition?.spargeAcidMl).toBeCloseTo(4.95, 1);
    expect(withSoda.spargeAcidAddition?.spargeAcidMl ?? 0).toBeGreaterThan(
      withoutSoda.spargeAcidAddition?.spargeAcidMl ?? 0,
    );
  });

  it("warns about the lactic acid taste threshold on hard Moscow-style water", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5.5,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "balanced_default",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 20,
          mg: 5,
          na: 10,
          cl: 20,
          so4: 30,
          hco3: 210,
          ph: 7.4,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: null,
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: 17,
        spargeWaterVolumeL: 3,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: 5.4,
        spargeAcidificationEnabled: true,
        spargeSourcePh: 7.4,
        targetSpargePh: 5.7,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: 88,
        calibrationOffset: null,
      },
    });

    expect(result.warnings).toContain("lactic_acid_taste_threshold");
    expect(result.lactatePpmEstimate).not.toBeNull();
    expect(result.lactatePpmEstimate ?? 0).toBeGreaterThan(400);
  });

  it("does not warn about lactate taste on soft water", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "balanced_default",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 20,
          mg: 5,
          na: 5,
          cl: 20,
          so4: 30,
          hco3: 20,
          ph: 7,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: null,
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: 17,
        spargeWaterVolumeL: 3,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: 5.4,
        spargeAcidificationEnabled: true,
        spargeSourcePh: 7,
        targetSpargePh: 5.7,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: 88,
        calibrationOffset: null,
      },
    });

    expect(result.warnings).not.toContain("lactic_acid_taste_threshold");
    expect(result.lactatePpmEstimate === null || result.lactatePpmEstimate < 400).toBe(true);
  });

  it("estimates stout mash pH (80% base + 12% roasted Carafa + 8% caramel special) at RA~125", () => {
    // 5,5 кг засыпи: 4,4 кг база (80%) + 0,66 кг Carafa III (12%, maltType roasted, EBC 900) +
    // 0,44 кг карамельный солод (8%, maltType special, EBC 150). Вода hco3=152,5/ca=mg=0
    // даёт RA=125 (deLange) — приёмочный кейс Ф6/Ф7 из notes/water-wizard-fixes.md.
    const fermentables = [
      { name: "Pale Ale Malt", subtype: "malt", weightKg: 4.4, maltType: "base" },
      {
        name: "Carafa III",
        subtype: "malt",
        weightKg: 0.66,
        maltType: "roasted",
        colorEbcMin: 900,
        colorEbcMax: 900,
      },
      {
        name: "Карамельный солод 150",
        subtype: "malt",
        weightKg: 0.44,
        maltType: "special",
        colorEbcMin: 150,
        colorEbcMax: 150,
      },
    ];

    const summary = summarizeFermentablesForMashPh(fermentables);
    expect(summary.pctRoasted).toBeCloseTo(12, 1);
    expect(summary.pctCrystalCaramel).toBeCloseTo(8, 1);
    expect(summary.pctKilned).toBe(0);
    expect(summary.pctAcidulated).toBe(0);
    expect(summary.crystalColorEbcAvg).toBeCloseTo(150, 1);

    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5.5,
      fermentables,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "balanced_default",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 0,
          mg: 0,
          na: 0,
          cl: 0,
          so4: 0,
          hco3: 152.5,
          ph: 7.6,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: null,
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: 17,
        spargeWaterVolumeL: 3,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: 5.4,
        spargeAcidificationEnabled: false,
        spargeSourcePh: null,
        targetSpargePh: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: 88,
        calibrationOffset: null,
      },
    });

    expect(result.residualAlkalinityAsCaCO3).toBeCloseTo(125, 0);
    expect(result.mashPhEstimate?.predictedMashPh20C).toBeGreaterThanOrEqual(5.5);
    expect(result.mashPhEstimate?.predictedMashPh20C).toBeLessThanOrEqual(5.7);
    // Эталон обновлён живым прогоном после ремедиации classifyFermentable (Ф6):
    // классификация всех трёх засыпей не изменилась (Carafa III → roasted по прямому
    // maltType, Карамельный солод 150 → crystal по ключу «карамел» — так было и до
    // трёхветочного рефакторинга), поэтому дельта 5,61 → 5,59 не от классификатора,
    // а от того, что 5,61 в исходном ТЗ было ручной оценкой сходимости фикс-поинта;
    // фактическое число движка — 5,59.
    expect(result.mashPhEstimate?.predictedMashPh20C).toBeCloseTo(5.59, 2);
  });
});

describe("Ф8: дилюция осмосом (blendRatio)", () => {
  const buildMoscowHardWaterCase = (
    blendRatio: { tap: number; ro: number; distilled: number } | null,
  ) =>
    buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5.5,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "balanced_default",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 20,
          mg: 5,
          na: 10,
          cl: 20,
          so4: 30,
          hco3: 210,
          ph: 7.4,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: null,
        showWaterAdditivesInIngredients: false,
        blendRatio,
        mashWaterVolumeL: 17,
        spargeWaterVolumeL: 3,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: 5.4,
        spargeAcidificationEnabled: true,
        spargeSourcePh: 7.4,
        targetSpargePh: 5.7,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: 88,
        calibrationOffset: null,
      },
    });

  it("blends 50% tap / 50% RO on hard Moscow-style water: alkalinity halves, mash acid dose falls, lactate warning fades or its ppm drops", () => {
    const unblended = buildMoscowHardWaterCase(null);
    const blended = buildMoscowHardWaterCase({ tap: 0.5, ro: 0.5, distilled: 0 });

    expect(unblended.sourceProfile.hco3).toBeCloseTo(210, 1);
    expect(unblended.dilutionRoPct).toBeNull();
    expect(blended.sourceProfile.hco3).toBeCloseTo(105, 1);
    expect(blended.dilutionRoPct).toBeCloseTo(50, 1);

    // Щёлочность заторного bucket-профиля падает вдвое, поэтому доза кислоты в затор
    // должна снизиться против неразбавленного случая (Ф2: второе слагаемое acidMeq
    // масштабируется щёлочностью).
    expect(unblended.mashAcidAddition?.mashAcidMl ?? 0).toBeGreaterThan(0);
    expect(blended.mashAcidAddition?.mashAcidMl ?? 0).toBeLessThan(
      unblended.mashAcidAddition?.mashAcidMl ?? 0,
    );

    expect(unblended.warnings).toContain("lactic_acid_taste_threshold");
    if (blended.warnings.includes("lactic_acid_taste_threshold")) {
      // Варнинг не исчез — тогда хотя бы ppm лактата должен заметно упасть.
      expect(blended.lactatePpmEstimate ?? 0).toBeLessThan(
        unblended.lactatePpmEstimate ?? Infinity,
      );
    } else {
      // Варнинг исчез — порог вкуса лактата (braukaiser, 400 ppm) больше не пробит.
      expect(blended.lactatePpmEstimate ?? 0).toBeLessThanOrEqual(400);
    }
  });

  const buildMoscowToPilsenCase = (
    blendRatio: { tap: number; ro: number; distilled: number } | null,
  ) =>
    buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 0,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "balanced_default",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 20,
          mg: 5,
          na: 10,
          cl: 20,
          so4: 30,
          hco3: 210,
          ph: 7.4,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: {
          ca: 7,
          mg: 2,
          na: 2,
          cl: 5,
          so4: 5,
          hco3: 15,
          ph: null,
        },
        showWaterAdditivesInIngredients: false,
        blendRatio,
        mashWaterVolumeL: null,
        spargeWaterVolumeL: null,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: null,
        spargeAcidificationEnabled: false,
        spargeSourcePh: null,
        targetSpargePh: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: 88,
        calibrationOffset: null,
      },
    });

  it("warns to dilute when the Pilsen target is unreachable from Moscow-hard tap water (no blend)", () => {
    const result = buildMoscowToPilsenCase(null);

    expect(result.warnings).toContain("dilution_suggested_target");
    // Честные 1 − 15/210 = 92,9% округляются вверх до кратного 10 (100%) и капаются на 90%.
    expect(result.dilutionSuggestedPct).toBe(90);
  });

  it("stops warning once the configured blend already dilutes at or above the suggested percentage", () => {
    const result = buildMoscowToPilsenCase({ tap: 0.1, ro: 0.9, distilled: 0 });

    expect(result.dilutionRoPct).toBeCloseTo(90, 1);
    expect(result.warnings).not.toContain("dilution_suggested_target");
    expect(result.warnings).not.toContain("dilution_suggested_acid");
    expect(result.dilutionSuggestedPct).toBeNull();
  });

  it("does not suggest dilution on soft water with no diluted or unreachable target", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "balanced_default",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 20,
          mg: 5,
          na: 5,
          cl: 20,
          so4: 30,
          hco3: 20,
          ph: 7,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: null,
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: 17,
        spargeWaterVolumeL: 3,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: 5.4,
        spargeAcidificationEnabled: true,
        spargeSourcePh: 7,
        targetSpargePh: 5.7,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: 88,
        calibrationOffset: null,
      },
    });

    expect(result.warnings).not.toContain("lactic_acid_taste_threshold");
    expect(result.warnings).not.toContain("dilution_suggested_target");
    expect(result.warnings).not.toContain("dilution_suggested_acid");
    expect(result.dilutionSuggestedPct).toBeNull();
    expect(result.dilutionRoPct).toBeNull();
  });
});
