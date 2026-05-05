import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  applyRecipeWaterSavedSourceProfile,
  applyRecipeWaterCatalogTargetProfile,
  applyRecipeWaterSourcePreset,
  createRecipeWaterPlanResetMeta,
  ensureRecipeWaterPlanConfigured,
  getNextSavedSourceWaterProfileName,
  removeRecipeWaterManualSaltAddition,
  sanitizeSavedSourceWaterProfiles,
  setRecipeWaterManualSourceProfile,
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

const renderWaterBlock = (waterPlanMeta: RecipeWaterPlanMeta) =>
  renderToStaticMarkup(
    React.createElement(WaterSetupWizard, {
      waterPlanMeta,
      waterPlanResult: buildResult(waterPlanMeta),
      onChange: () => undefined,
    }),
  );

describe("recipe water flow UI", () => {
  it("renders the new source -> target -> split -> result flow", () => {
    const meta = ensureRecipeWaterPlanConfigured(
      createRecipeWaterPlanResetMeta(),
    );
    const html = renderWaterBlock(meta);

    expect(html).not.toContain('<details open="" class="group rounded-2xl');
    expect(html).toContain("1. Исходная вода");
    expect(html).toContain("2. Целевой профиль");
    expect(html).toContain("3. Как вносить соли");
    expect(html).toContain("4. Что добавить");
    expect(html).toContain("Добавить в воду");
    expect(html).toContain("Подобрать профиль");
    expect(html).not.toContain("Сохраненные");
    expect(html).not.toContain("Сбалансированный лагер");
    expect(html).not.toContain("IPA, lager, blanche, стаут...");
    expect(html).toContain("Осмос");
    expect(html).toContain("Дистиллированная вода");
    expect(html).toContain("Вручную");
    expect(html).toContain("Рассчитывать pH затора");
    expect(html).toContain("Целевой pH затора");
    expect(html.indexOf("Целевой pH затора")).toBeLessThan(
      html.indexOf("Расширенные настройки"),
    );
    expect(html).toContain("Молочная кислота");
    expect(html).not.toContain("Lactic Acid");
    expect(html).not.toContain("Только минерализация");
    expect(html).not.toContain("Авторасчет солей + pH");
    expect(html).not.toContain("Настроить водоподготовку?");
    expect(html).not.toContain("Настроить воду");
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
    expect(reset.showWaterAdditivesInIngredients).toBe(false);
    expect(html).toContain("Осмос");
    expect(html).toContain("Дистиллированная вода");
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
      ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      "split",
      20,
    );
    const html = renderWaterBlock(meta);

    expect(meta.mashWaterVolumeL).toBe(13);
    expect(meta.spargeWaterVolumeL).toBe(7);
    expect(html).toContain("В затор");
    expect(html).toContain("В промывку");
    expect(html).toContain("Заторная вода, л");
    expect(html).toContain("Промывочная вода, л");
    expect(html.indexOf("Целевой pH затора")).toBeGreaterThan(
      html.indexOf("В затор"),
    );
    expect(html.indexOf("Целевой pH затора")).toBeLessThan(
      html.indexOf("В промывку"),
    );
  });

  it("renders one-volume mode as one additions result and clears sparge-only acid settings", () => {
    const split = {
      ...setRecipeWaterVolumeMode(
        ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
        "split",
        20,
      ),
      spargeAcidificationEnabled: true,
    } satisfies RecipeWaterPlanMeta;
    const single = setRecipeWaterVolumeMode(split, "single", 20);
    const html = renderWaterBlock(single);

    expect(single.mashWaterVolumeL).toBeNull();
    expect(single.spargeWaterVolumeL).toBeNull();
    expect(single.spargeAcidificationEnabled).toBe(false);
    expect(html).toContain("Добавить в воду");
    expect(html).toContain("Один объем");
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
    expect(html).toContain("pH затора не рассчитывается");
    expect(html).not.toContain("Кислота");
    expect(html).not.toContain("Концентрация кислоты");
    expect(html).not.toContain("Калибровка pH");
    expect(html).not.toContain("Подкислить промывочную воду");
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

  it("keeps advanced settings secondary while preserving manual-salt behavior", () => {
    const meta = {
      ...ensureRecipeWaterPlanConfigured(createRecipeWaterPlanResetMeta()),
      engine: "advanced_manual",
      manualSaltAdditions: [{ salt: "gypsum", grams: 2 }],
      calibrationOffset: 0.05,
    } satisfies RecipeWaterPlanMeta;
    const result = buildResult(meta);
    const html = renderWaterBlock(meta);

    expect(result.totalSaltAdditions).toEqual([
      expect.objectContaining({ salt: "gypsum", grams: 2 }),
    ]);
    expect(html).toContain("Расширенные настройки");
    expect(html).toContain("Калибровка pH");
    expect(html).toContain("Гипс");
    expect(html).toContain("CaSO4·2H2O");
    expect(html).not.toContain("Gypsum");
    expect(html).toContain("Удалить");
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
});
