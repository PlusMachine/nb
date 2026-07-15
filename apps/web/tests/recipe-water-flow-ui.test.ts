import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  RecipeWaterAdditivesSection,
  getRecipeWaterSetupToggleLabel,
  groupRecipeWaterAdditiveRows,
  resolveRecipeWaterAcidStockConcentrationSuggestion,
  resolveRecipeWaterAdditiveStockStatus,
} from "../components/recipes/recipe-water-additives-section";
import {
  applyRecipeWaterSavedSourceProfile,
  applyRecipeWaterCatalogTargetProfile,
  applyRecipeWaterSourcePreset,
  createRecipeWaterPlanResetMeta,
  ensureRecipeWaterPlanConfigured,
  getNextSavedSourceWaterProfileName,
  isRecipeWaterAutoBakingSodaEnabled,
  removeRecipeWaterManualSaltAddition,
  resolveRecipeWaterTargetModeSelection,
  sanitizeSavedSourceWaterProfiles,
  setRecipeWaterManualSourceProfile,
  setRecipeWaterAutoBakingSodaEnabled,
  setRecipeWaterSaltCalculationMode,
  setRecipeWaterSourceDilutionPct,
  setRecipeWaterTargetMashPh,
  setRecipeWaterVolumeMode,
  WaterSetupWizard,
} from "../components/recipes/water-setup-wizard";
import {
  recipeWaterPlanMetaSchema,
  type RecipeWaterPlanMeta,
} from "../features/recipes/contracts";
import { buildRecipeWaterPlanResult } from "../features/recipes/water-plan";
import { findBuiltInSourceWaterProfile } from "../features/recipes/water-profiles";
import {
  getAlternativeTargetProfilesForBjcpStyle,
  getDefaultTargetProfileForBjcpStyle,
  resolveWaterTargetBjcpStyleKey,
  searchWaterTargetProfiles,
} from "../features/recipes/water-target-profiles";

const buildResult = (waterPlanMeta: RecipeWaterPlanMeta) =>
  buildRecipeWaterPlanResult({
    waterPlanMeta,
    fallbackBatchVolumeL: 20,
    grainKg: 5,
    beerSrm: 8,
    fermentables: [
      { name: "Pale Malt", subtype: "malt", weightKg: 4.5 },
      { name: "Caramel 60", subtype: "crystal", weightKg: 0.5 },
    ],
  });

const completeWaterTargetProfile = {
  ca: 80,
  mg: 10,
  na: 15,
  cl: 90,
  so4: 150,
  hco3: 70,
  ph: null,
};

const withManualTargetProfile = (
  waterPlanMeta: RecipeWaterPlanMeta,
): RecipeWaterPlanMeta => ({
  ...waterPlanMeta,
  setupEnabled: true,
  targetProfileMode: "manual",
  targetProfilePresetId: null,
  targetProfileSlug: null,
  targetProfileSavedId: null,
  targetProfileName: "Тестовый профиль",
  targetProfileSource: "manual",
  targetProfileIsOverridden: true,
  targetProfile: completeWaterTargetProfile,
});

const renderWaterBlock = (waterPlanMeta: RecipeWaterPlanMeta) =>
  renderToStaticMarkup(
    React.createElement(WaterSetupWizard, {
      waterPlanMeta,
      waterPlanResult: buildResult(waterPlanMeta),
      onChange: () => undefined,
    }),
  );

describe("recipe water flow UI", () => {
  it("labels the water setup toggle according to the embedded wizard state", () => {
    expect(getRecipeWaterSetupToggleLabel(false)).toBe("Настроить воду");
    expect(getRecipeWaterSetupToggleLabel(true)).toBe("Скрыть настройку");
  });

  it("groups split water additive rows by water bucket instead of repeating target labels", () => {
    const grouped = groupRecipeWaterAdditiveRows(
      [
        {
          key: "mash-gypsum",
          kind: "salt",
          saltId: "gypsum",
          catalogIngredientId: null,
          title: "Гипс",
          formula: "CaSO4",
          concentrationPct: null,
          amountText: "2.00 г",
          amountValue: 2,
          target: "mash",
          saltTarget: "mash",
          removable: false,
          manualSaltIndex: null,
          acidTarget: null,
        },
        {
          key: "sparge-lactic",
          kind: "acid",
          saltId: null,
          catalogIngredientId: null,
          title: "Молочная кислота",
          formula: "88%",
          concentrationPct: 88,
          amountText: "1.20 мл",
          amountValue: 1.2,
          target: "sparge",
          saltTarget: null,
          removable: false,
          manualSaltIndex: null,
          acidTarget: "sparge",
        },
      ],
      true,
    );

    expect(grouped.map((group) => group.label)).toEqual([
      "Затор",
      "Промывка",
    ]);
    expect(grouped[0]?.rows[0]?.formula).toBe("CaSO4");
    expect(grouped[1]?.rows[0]?.title).toBe("Молочная кислота");
  });

  it("matches acid stock by concentration and suggests the only stocked concentration", () => {
    const acidRow = {
      key: "mash-lactic",
      kind: "acid" as const,
      saltId: null,
      catalogIngredientId: "lactic-acid",
      title: "Молочная кислота",
      formula: "85%",
      concentrationPct: 85,
      amountText: "1.20 мл",
      amountValue: 1.2,
      target: "mash" as const,
      saltTarget: null,
      removable: false,
      manualSaltIndex: null,
      acidTarget: "mash" as const,
    };
    const stock75 = {
      catalogIngredientId: "lactic-acid",
      inventoryItemId: "stock-75",
      displayName: "Молочная кислота 75%",
      availableNormalizedQuantity: 100,
      normalizedUnit: "ml" as const,
      concentrationPct: 75,
    };
    const stock85 = {
      ...stock75,
      inventoryItemId: "stock-85",
      displayName: "Молочная кислота 85%",
      concentrationPct: 85,
    };

    expect(resolveRecipeWaterAdditiveStockStatus(acidRow, [stock75])).toBeNull();
    expect(resolveRecipeWaterAdditiveStockStatus(acidRow, [stock75, stock85])?.inventoryItemId).toBe("stock-85");
    expect(resolveRecipeWaterAcidStockConcentrationSuggestion({
      waterPlanMeta: {
        ...createRecipeWaterPlanResetMeta(),
        setupEnabled: true,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: null,
      },
      statuses: [stock75],
    })).toBe(75);
  });

  it("renders the new source -> target -> split -> result flow", () => {
    const meta = {
      ...withManualTargetProfile(
        ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      ),
      targetMashPh: 5.35,
    } satisfies RecipeWaterPlanMeta;
    const html = renderWaterBlock(meta);

    expect(html).toContain('<section class="rounded-2xl');
    expect(html).toContain("Настройка воды");
    expect(html).toContain("1. Исходная вода");
    expect(html).toContain("2. Целевой профиль");
    expect(html).toContain("3. Объем воды");
    expect(html).not.toContain("Редактировать исходную воду вручную");
    expect(html).toContain("Водопоглощение дробиной, л/кг");
    expect(html).toContain("Сейчас: 0.80 л/кг");
    expect(html).not.toContain("Итоговый профиль воды");
    expect(html).toContain("4. pH и подкисление");
    expect(html).not.toContain("5. Что добавить");
    expect(html).toContain("Из каталога");
    expect(html).toContain("Ионы вручную");
    expect(html).not.toContain("Сохраненные");
    expect(html).not.toContain("Сбалансированный лагер");
    expect(html).not.toContain("IPA, lager, blanche, стаут...");
    expect(html).toContain("Осмос");
    expect(html).toContain("Дистиллированная вода");
    expect(html).toContain("Ввести вручную");
    expect(html).toContain("Корректировать pH затора");
    expect(html).toContain("Целевой pH затора");
    expect(html.indexOf("Целевой pH затора")).toBeLessThan(
      html.indexOf("Расширенные настройки"),
    );
    expect(html).toContain("Молочная кислота");
    expect(html).toContain("Считать пищевую соду (NaHCO3) в авторасчете");
    expect(html).not.toContain("добавки рассчитаны");
    expect(html).not.toContain("Lactic Acid");
    expect(html).not.toContain("Только минерализация");
    expect(html).not.toContain("Авторасчет солей + pH");
    expect(html).not.toContain("Настроить водоподготовку?");
    expect(html).not.toContain("Найти исходный профиль");
    expect(html).not.toContain("Примерные исторические профили");
    expect(html).not.toContain("Ничего не найдено");
    expect(html).not.toContain("Выберите обычный стартовый вариант");
    expect(html).not.toContain("Почти нулевая минерализация");
    expect(html).not.toContain("По стилю");
    expect(html).not.toContain("Показывать добавки воды в списке ингредиентов");
  });

  it("treats RO / distilled water as a configured zero-mineral source", () => {
    const meta = ensureRecipeWaterPlanConfigured(
      createRecipeWaterPlanResetMeta(),
    );
    const result = buildResult(meta);

    expect(meta.sourceProfileMode).toBe("ro_distilled");
    expect(meta.sourceProfilePresetId).toBe("ro_distilled");
    expect(result.warnings).not.toContain("source_profile_missing_or_zero");
  });

  it("treats distilled water as a configured zero-mineral source", () => {
    const preset = findBuiltInSourceWaterProfile("distilled_water");
    expect(preset).not.toBeNull();

    const meta = applyRecipeWaterSourcePreset(
      createRecipeWaterPlanResetMeta(),
      preset!,
    );
    const result = buildResult(meta);

    expect(meta.sourceProfileMode).toBe("distilled");
    expect(meta.sourceProfilePresetId).toBe("distilled_water");
    expect(result.warnings).not.toContain("source_profile_missing_or_zero");
  });

  it("does not enable mash pH correction just by selecting source water", () => {
    const preset = findBuiltInSourceWaterProfile("ro_distilled");
    expect(preset).not.toBeNull();

    const meta = applyRecipeWaterSourcePreset(
      recipeWaterPlanMetaSchema.parse({}),
      preset!,
    );
    const result = buildResult(meta);
    const html = renderWaterBlock(meta);

    expect(meta.setupEnabled).toBe(true);
    expect(meta.sourceProfileMode).toBe("ro_distilled");
    expect(meta.targetMashPh).toBeNull();
    expect(result.mashPhEstimate).toBeNull();
    expect(result.mashAcidAddition).toBeNull();
    expect(html).toContain("Корректировать pH затора");
    expect(html).not.toContain("Целевой pH затора");
    expect(html).not.toContain("Кислота");
    expect(html).not.toContain("Концентрация кислоты");
  });

  it("keeps the wizard accessible even before target profile is selected", () => {
    const meta = ensureRecipeWaterPlanConfigured(
      createRecipeWaterPlanResetMeta(),
    );
    const html = renderWaterBlock(meta);

    expect(html).toContain("Настройка воды");
    expect(html).toContain("1. Исходная вода");
    expect(html).toContain("2. Целевой профиль");
  });

  it("shows water defaults as editable options, not as selected setup, before user action", () => {
    const meta = createRecipeWaterPlanResetMeta();
    const html = renderToStaticMarkup(
      React.createElement(WaterSetupWizard, {
        waterPlanMeta: meta,
        waterPlanResult: buildResult(meta),
        styleId: "21B-belgian-ipa",
        onChange: () => undefined,
      }),
    );

    expect(meta.setupEnabled).toBe(false);
    expect(html).toContain("Настройка воды");
    expect(html).toContain("1. Исходная вода");
    expect(html).toContain("2. Целевой профиль");
    expect(html).toContain("источник, цель, объемы и pH");
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).not.toContain("Выбранный профиль");
    expect(html).not.toContain("3. Объем воды");
    expect(html).not.toContain("4. pH и подкисление");
    expect(html).not.toContain("Подходит по стилю");
  });

  it("keeps target profile mode buttons mutually exclusive while catalog picker is open", () => {
    const selection = resolveRecipeWaterTargetModeSelection({
      hasActiveWaterSetup: true,
      hasTargetProfile: true,
      targetCatalogPickerOpen: true,
      targetProfileMode: "manual",
    });

    expect(selection).toEqual({
      saved: false,
      catalog: true,
      manual: false,
    });
  });

  it("reset clears persisted water setup state instead of hiding stale profiles", () => {
    const configured = {
      ...ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      mashWaterVolumeL: 13,
      spargeWaterVolumeL: 7,
      manualSaltAdditions: [{ salt: "gypsum", grams: 2 }],
      spargeAcidificationEnabled: true,
      showWaterAdditivesInIngredients: true,
    } satisfies RecipeWaterPlanMeta;
    const reset = createRecipeWaterPlanResetMeta();
    const html = renderWaterBlock(reset);

    expect(configured.sourceProfile).not.toBeNull();
    expect(reset.setupEnabled).toBe(false);
    expect(reset.sourceProfile).toBeNull();
    expect(reset.targetProfile).toBeNull();
    expect(reset.mashWaterVolumeL).toBeNull();
    expect(reset.spargeWaterVolumeL).toBeNull();
    expect(reset.manualSaltAdditions).toEqual([]);
    expect(reset.targetMashPh).toBeNull();
    expect(reset.spargeAcidificationEnabled).toBe(false);
    expect(reset.acidConcentrationPct).toBeNull();
    expect(reset.showWaterAdditivesInIngredients).toBe(false);
    expect(html).toContain("Осмос");
    expect(html).toContain("Дистиллированная вода");
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).not.toContain("Добавить в воду");
    expect(html).not.toContain("Настроить воду");
  });

  it("supports saved source water profile metadata", () => {
    const savedProfiles = sanitizeSavedSourceWaterProfiles([
      {
        id: "profile-1",
        name: "Моя вода",
        profile: { ca: 42, mg: 8, na: 12, cl: 60, so4: 40, hco3: 90, ph: 7.4 },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      { id: "broken", name: "", profile: null },
    ]);
    const meta = applyRecipeWaterSavedSourceProfile(
      ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      savedProfiles[0],
    );

    expect(savedProfiles).toHaveLength(1);
    expect(getNextSavedSourceWaterProfileName(savedProfiles)).toBe(
      "Сохраненный профиль 2",
    );
    expect(meta.sourceProfileMode).toBe("saved");
    expect(meta.sourceProfileSavedId).toBe("profile-1");
    expect(meta.sourceProfileName).toBe("Моя вода");
    expect(meta.sourceProfile?.ca).toBe(42);
  });

  it("shows source ions for preset water and switches edited source to manual", () => {
    const configured = ensureRecipeWaterPlanConfigured(
      createRecipeWaterPlanResetMeta(),
    );
    const html = renderWaterBlock(configured);
    const edited = setRecipeWaterManualSourceProfile(configured, {
      ca: 12,
      mg: 3,
      na: 4,
      cl: 15,
      so4: 20,
      hco3: 30,
      ph: 7,
    });

    expect(html).toContain('value="0"');
    expect(edited.sourceProfileMode).toBe("manual");
    expect(edited.sourceProfilePresetId).toBeNull();
    expect(edited.sourceProfileSavedId).toBeNull();
    expect(edited.sourceProfile?.ca).toBe(12);
  });

  it("renders split mode as separate mash and sparge result cards", () => {
    const meta = setRecipeWaterVolumeMode(
      withManualTargetProfile(
        ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      ),
      "split",
      20,
    );
    const html = renderWaterBlock(meta);

    expect(meta.mashWaterVolumeL).toBe(13);
    expect(meta.spargeWaterVolumeL).toBe(7);
    expect(html).toContain("Заторная вода, л");
    expect(html).toContain("Промывочная вода, л");
    expect(html.indexOf("Целевой pH затора")).toBeLessThan(
      html.indexOf("Расширенные настройки"),
    );
    expect(html.indexOf("Подкислить промывочную воду")).toBeLessThan(
      html.indexOf("Расширенные настройки"),
    );
  });

  it("uses equipment suggested split when switching to mash and sparge volumes", () => {
    const meta = setRecipeWaterVolumeMode(
      ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      "split",
      28.625,
      { mashWaterL: 15, spargeWaterL: 13.625 },
    );

    expect(meta.mashWaterVolumeL).toBe(15);
    expect(meta.spargeWaterVolumeL).toBe(13.6);
  });

  it("keeps zero-sparge equipment suggestions when switching volume mode", () => {
    const meta = setRecipeWaterVolumeMode(
      ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      "split",
      24,
      { mashWaterL: 24, spargeWaterL: 0 },
    );

    expect(meta.mashWaterVolumeL).toBe(24);
    expect(meta.spargeWaterVolumeL).toBe(0);
  });

  it("renders one-volume mode as one additions result and clears sparge-only acid settings", () => {
    const split = {
      ...setRecipeWaterVolumeMode(
        withManualTargetProfile(
          ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
        ),
        "split",
        20,
      ),
      spargeAcidificationEnabled: true,
      manualSaltAdditions: [
        { salt: "gypsum", grams: 2, target: "sparge" },
      ],
    } satisfies RecipeWaterPlanMeta;
    const single = setRecipeWaterVolumeMode(split, "single", 20);
    const html = renderWaterBlock(single);

    expect(single.mashWaterVolumeL).toBeNull();
    expect(single.spargeWaterVolumeL).toBeNull();
    expect(single.spargeAcidificationEnabled).toBe(false);
    expect(single.manualSaltAdditions[0]?.target).toBe("all");
    expect(html).toContain("Считать одним объемом");
  });

  it("lets users disable mash pH calculation from the target pH field", () => {
    const meta = setRecipeWaterTargetMashPh(
      ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      null,
    );
    const result = buildResult(meta);
    const html = renderWaterBlock(meta);

    expect(meta.engine).toBe("profile_only");
    expect(result.engine).toBe("profile_only");
    expect(result.mashPhEstimate).toBeNull();
    expect(result.mashAcidAddition).toBeNull();
    expect(html).toContain("Корректировать pH затора");
    expect(html).not.toContain("Целевой pH затора");
    expect(html).not.toContain("Кислота");
    expect(html).not.toContain("Концентрация кислоты");
    expect(html).not.toContain("Калибровка pH");
    expect(html).not.toContain("Подкислить промывочную воду");
  });

  it("keeps sparge acidification available when mash pH correction is off", () => {
    const split = setRecipeWaterVolumeMode(
      ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      "split",
      20,
    );
    const meta = setRecipeWaterTargetMashPh(split, null);
    const html = renderWaterBlock(meta);

    expect(meta.spargeAcidificationEnabled).toBe(false);
    expect(html).toContain("Корректировать pH затора");
    expect(html).not.toContain("Целевой pH затора");
    expect(html).toContain("Подкислить промывочную воду");
    expect(html).not.toContain("Кислота");
  });

  it("hides advanced settings when the current mode has no advanced controls", () => {
    const meta = {
      ...setRecipeWaterTargetMashPh(
        ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
        null,
      ),
      engine: "advanced_manual",
      manualSaltAdditions: [],
    } satisfies RecipeWaterPlanMeta;
    const html = renderWaterBlock(meta);

    expect(html).not.toContain("Расширенные настройки");
  });

  it("allows manual salt rows to be deleted", () => {
    const meta = {
      ...ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      engine: "advanced_manual",
      manualSaltAdditions: [
        { salt: "gypsum", grams: 2 },
        { salt: "chalk", grams: 1 },
      ],
    } satisfies RecipeWaterPlanMeta;

    const next = removeRecipeWaterManualSaltAddition(meta, 0);

    expect(next.manualSaltAdditions).toEqual([{ salt: "chalk", grams: 1 }]);
  });

  it("toggles baking soda for auto salt calculation explicitly", () => {
    const meta = ensureRecipeWaterPlanConfigured(
      createRecipeWaterPlanResetMeta(),
    );
    const enabled = setRecipeWaterAutoBakingSodaEnabled(meta, true);
    const disabled = setRecipeWaterAutoBakingSodaEnabled(enabled, false);

    expect(isRecipeWaterAutoBakingSodaEnabled(meta)).toBe(false);
    expect(enabled.allowedSalts).toEqual([
      "gypsum",
      "calcium_chloride",
      "epsom_salt",
      "baking_soda",
    ]);
    expect(isRecipeWaterAutoBakingSodaEnabled(enabled)).toBe(true);
    expect(disabled.allowedSalts).toEqual([]);
    expect(isRecipeWaterAutoBakingSodaEnabled(disabled)).toBe(false);
  });

  it("copies calculated salts into editable additives and can return to live calculation", () => {
    const autoMeta = withManualTargetProfile(
      ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
    );
    const autoResult = buildResult(autoMeta);
    const manualMeta = setRecipeWaterSaltCalculationMode(
      autoMeta,
      "manual",
      autoResult,
    );
    const autoAgainMeta = setRecipeWaterSaltCalculationMode(
      manualMeta,
      "auto",
      buildResult(manualMeta),
    );

    expect(autoResult.totalSaltAdditions.length).toBeGreaterThan(0);
    expect(manualMeta.engine).toBe("advanced_manual");
    expect(manualMeta.manualSaltAdditions.length).toBe(
      autoResult.totalSaltAdditions.length,
    );
    expect(autoAgainMeta.engine).not.toBe("advanced_manual");
  });

  it("keeps advanced settings secondary while preserving editable salt behavior", () => {
    const meta = {
      ...ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      engine: "advanced_manual",
      manualSaltAdditions: [{ salt: "gypsum", grams: 2 }],
      targetMashPh: 5.35,
      calibrationOffset: 0.05,
    } satisfies RecipeWaterPlanMeta;
    const result = buildResult(meta);
    const html = renderWaterBlock(meta);

    expect(result.totalSaltAdditions).toEqual([
      expect.objectContaining({ salt: "gypsum", grams: 2 }),
    ]);
    expect(html).toContain("Расширенные настройки");
    expect(html).toContain("Калибровка pH");
    expect(html).not.toContain("Итоговый профиль воды");
    expect(html).not.toContain("Режим солей");
    expect(html).not.toContain("Ручные добавки солей");
    expect(html).not.toContain("CaSO4·2H2O");
    expect(html).not.toContain("Gypsum");
  });

  it("renders editable water salts as catalog-matched additive rows", () => {
    const meta = {
      ...withManualTargetProfile(
        ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      ),
      engine: "advanced_manual",
      manualSaltAdditions: [
        { salt: "calcium_chloride", grams: 3, target: "all" },
      ],
    } satisfies RecipeWaterPlanMeta;
    const html = renderToStaticMarkup(
      React.createElement(RecipeWaterAdditivesSection, {
        waterPlanMeta: meta,
        waterPlanResult: buildResult(meta),
        onUpdateManualSalt: () => undefined,
        onRemoveManualSalt: () => undefined,
      }),
    );

    expect(html).toContain("Хлорид кальция");
    expect(html).toContain("CaCl2");
    expect(html).toContain("Нет на складе");
    expect(html).toContain("Итоговый профиль воды");
    expect(html).toContain("к цели");
    expect(html).not.toContain("Сравнение с целью");
    expect(html).not.toContain("RA ");
    expect(html).not.toContain("SO4/Cl");
    expect(html).toContain('value="3"');
    expect(html).toContain("Удалить Хлорид кальция");
    expect(html).not.toContain("Редактировать Хлорид кальция");
    expect(html).not.toContain("Редактировать Молочная кислота");
    expect(html).not.toContain("Не привязано к каталогу");
  });

  it("keeps calculated salts out of the applied plan until the user applies the calculation", () => {
    const meta = withManualTargetProfile(
      ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
    );
    const result = buildResult(meta);
    const firstSalt = result.totalSaltAdditions[0];
    if (!firstSalt) {
      throw new Error("Expected auto salt additions");
    }
    const html = renderToStaticMarkup(
      React.createElement(RecipeWaterAdditivesSection, {
        waterPlanMeta: meta,
        waterPlanResult: result,
        onUpdateManualSalt: () => undefined,
        onRemoveManualSalt: () => undefined,
        onAddManualSalt: () => undefined,
      }),
    );

    expect(html).toContain("Добавки воды");
    expect(html).toContain("Нет добавок воды");
    expect(html).not.toContain("Примененный план");
    expect(html).not.toContain("Применен");
    expect(html).not.toContain("Не применен");
    expect(html).not.toContain("Итоговый профиль воды");
    expect(html).not.toContain(`Количество ${firstSalt.label}, г`);
    expect(html).not.toContain(`Удалить ${firstSalt.label}`);
  });

  it("shows calculated additions as a proposal inside the water setup wizard", () => {
    const meta = {
      ...withManualTargetProfile(
        ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      ),
      targetMashPh: 5.35,
    } satisfies RecipeWaterPlanMeta;
    const result = buildResult(meta);
    const html = renderToStaticMarkup(
      React.createElement(WaterSetupWizard, {
        waterPlanMeta: meta,
        waterPlanResult: result,
        calculatedWaterPlanResult: result,
        onChange: () => undefined,
      }),
    );

    expect(result.mashAcidAddition?.mashAcidMl ?? 0).toBeGreaterThan(0);
    expect(html).toContain("Расчет");
    expect(html).toContain("Применить расчет");
    expect(html).toContain("Молочная кислота");
    expect(html).not.toContain("Удалить Молочная кислота");
  });

  it("does not show the water result summary for an empty default setup", () => {
    const meta = {
      ...createRecipeWaterPlanResetMeta(),
      setupEnabled: true,
      targetProfileMode: "manual",
      targetProfile: null,
      targetMashPh: null,
      manualSaltAdditions: [],
    } satisfies RecipeWaterPlanMeta;
    const html = renderToStaticMarkup(
      React.createElement(RecipeWaterAdditivesSection, {
        waterPlanMeta: meta,
        waterPlanResult: buildResult(meta),
        onUpdateManualSalt: () => undefined,
        onRemoveManualSalt: () => undefined,
      }),
    );

    expect(html).toContain("Нет добавок воды");
    expect(html).not.toContain("Итоговый профиль воды");
  });

  it("shows a target selector for manual salts in split water mode", () => {
    const split = setRecipeWaterVolumeMode(
      ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      "split",
      20,
    );
    const meta = {
      ...split,
      engine: "advanced_manual",
      manualSaltAdditions: [{ salt: "gypsum", grams: 2, target: "mash" }],
    } satisfies RecipeWaterPlanMeta;
    const html = renderToStaticMarkup(
      React.createElement(RecipeWaterAdditivesSection, {
        waterPlanMeta: meta,
        waterPlanResult: buildResult(meta),
        onUpdateManualSalt: () => undefined,
        onRemoveManualSalt: () => undefined,
      }),
    );

    expect(html).toContain("Куда добавить Гипс");
    expect(html).toContain("Весь объем");
    expect(html).toContain("Затор");
    expect(html).toContain("Промывка");
    expect(html).toContain('value="mash" selected=""');
  });

  it("keeps existing saved waterPlanMeta compatible, including legacy style mode", () => {
    const legacy = recipeWaterPlanMetaSchema.parse({
      setupEnabled: true,
      engine: "balanced_default",
      phModel: "hybrid_mash_ph_v1",
      sourceProfileMode: "preset",
      sourceProfilePresetId: "pilsen_example",
      sourceProfile: { ca: 7, mg: 3, na: 2, cl: 5, so4: 5, hco3: 25, ph: null },
      targetProfileMode: "style",
      targetProfilePresetId: null,
      targetProfile: {
        ca: 80,
        mg: 5,
        na: 25,
        cl: 75,
        so4: 80,
        hco3: 100,
        ph: null,
      },
      manualSaltAdditions: [],
    });

    const normalized = ensureRecipeWaterPlanConfigured(legacy);
    const result = buildResult(normalized);
    const html = renderWaterBlock(normalized);

    expect(normalized.targetProfileMode).toBe("catalog");
    expect(result.targetProfile?.ca).toBe(80);
    expect(html).toContain('value="80"');
    expect(html).toContain("Выбранный профиль");
    expect(html).not.toContain("По стилю");
  });

  it("labels automatically selected BJCP target profiles as style matches", () => {
    const styleKey = resolveWaterTargetBjcpStyleKey("21B-belgian-ipa");
    const defaultProfile = getDefaultTargetProfileForBjcpStyle(styleKey);
    expect(defaultProfile).not.toBeNull();

    const meta = applyRecipeWaterCatalogTargetProfile(
      ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      defaultProfile!,
      "auto_style",
      styleKey,
      false,
    );
    const html = renderWaterBlock(meta);

    expect(html).toContain("Подходит по стилю");
    expect(html).not.toContain("Выбрано из поиска");
  });

  it("offers manual profile saving with a default name", () => {
    const manual = {
      ...ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      sourceProfileMode: "manual",
      sourceProfilePresetId: null,
      sourceProfile: { ca: 10, mg: 2, na: 3, cl: 12, so4: 14, hco3: 55, ph: 7 },
    } satisfies RecipeWaterPlanMeta;
    const html = renderWaterBlock(manual);

    expect(getNextSavedSourceWaterProfileName([])).toBe(
      "Сохраненный профиль 1",
    );
    expect(html).toContain("Сохранить");
    expect(html).not.toContain("Название профиля");
    expect(html).not.toContain("Найти");
  });

  it("resolves BJCP style defaults and keeps alternatives deduped by slug", () => {
    const styleKey = resolveWaterTargetBjcpStyleKey("21B-belgian-ipa");
    const defaultProfile = getDefaultTargetProfileForBjcpStyle(styleKey);
    const alternatives = getAlternativeTargetProfilesForBjcpStyle(styleKey);

    expect(styleKey).toBe("21B-belgian");
    expect(defaultProfile?.slug).toBe("yellow-hoppy-brewfather");
    expect(alternatives.map((profile) => profile.slug)).not.toContain(
      defaultProfile?.slug,
    );
    expect(new Set(alternatives.map((profile) => profile.slug)).size).toBe(
      alternatives.length,
    );
  });

  it("searches target water profile catalog through profile, intent and source aliases", () => {
    expect(searchWaterTargetProfiles("ipa")[0]?.slug).toBeTruthy();
    expect(searchWaterTargetProfiles("lager")[0]?.slug).toBeTruthy();
    expect(searchWaterTargetProfiles("blanche").map((item) => item.slug)).toContain(
      "balanced-electric-brewery",
    );
    expect(searchWaterTargetProfiles("бланш").map((item) => item.slug)).toContain(
      "balanced-electric-brewery",
    );
    expect(searchWaterTargetProfiles("janish").map((item) => item.slug)).toContain(
      "scott-janish-2015-ipa",
    );
    expect(searchWaterTargetProfiles("porter").map((item) => item.slug)).toContain(
      "london-porter-bf",
    );
  });

  it("writes an RO dilution percentage into a tap/RO blendRatio and clears it back to null (Ф8 UI)", () => {
    const configured = ensureRecipeWaterPlanConfigured(
      createRecipeWaterPlanResetMeta(),
    );

    const diluted = setRecipeWaterSourceDilutionPct(configured, 30);
    expect(diluted.setupEnabled).toBe(true);
    expect(diluted.blendRatio).toEqual({ tap: 0.7, ro: 0.3, distilled: 0 });

    const clearedByZero = setRecipeWaterSourceDilutionPct(diluted, 0);
    expect(clearedByZero.blendRatio).toBeNull();

    const clearedByNull = setRecipeWaterSourceDilutionPct(diluted, null);
    expect(clearedByNull.blendRatio).toBeNull();
  });

  it("saves the source water pH through the manual profile setter (needed for a fair Ct instead of the pH 7 default)", () => {
    const configured = ensureRecipeWaterPlanConfigured(
      createRecipeWaterPlanResetMeta(),
    );

    const withSourcePh = setRecipeWaterManualSourceProfile(configured, {
      ...(configured.sourceProfile ?? {
        ca: 0,
        mg: 0,
        na: 0,
        cl: 0,
        so4: 0,
        hco3: 0,
        ph: null,
      }),
      ph: 7.6,
    });

    expect(withSourcePh.sourceProfile?.ph).toBe(7.6);

    const html = renderWaterBlock(withSourcePh);
    expect(html).toContain('value="7.6"');

    const cleared = setRecipeWaterManualSourceProfile(withSourcePh, {
      ...withSourcePh.sourceProfile!,
      ph: null,
    });
    expect(cleared.sourceProfile?.ph).toBeNull();
  });
});
