import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EquipmentProfileFormFields } from "../components/equipment/equipment-profile-form-basic";
import { equipmentPresets } from "../features/equipment/presets";
import { buildRecipeWaterPlanResult } from "../features/recipes/water-plan";
import { equipmentProfilePayloadSchema } from "../features/equipment-profiles/contracts";
import { calculateEquipmentVolumePlan } from "../features/equipment-profiles/volume-plan";
import { buildEquipmentProfileSummarySnapshot } from "../features/equipment/summary";

/**
 * Пресеты — это данные, а не код, и ошибка в них молча уезжает в каждый рецепт
 * пользователя. Поэтому проверяем не «числа записаны», а что пресет не противоречит
 * сам себе, когда его прогоняешь через настоящий движок расчёта объёмов.
 */
describe("пресеты пивоварен", () => {
  it("уникальные id и названия", () => {
    const ids = equipmentPresets.map((item) => item.id);
    const names = equipmentPresets.map((item) => item.profile.name);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(equipmentPresets.map((item) => [item.profile.name, item] as const))(
    "%s — валидный профиль оборудования",
    (_name, item) => {
      expect(() => equipmentProfilePayloadSchema.parse(item.profile)).not.toThrow();
    }
  );

  it.each(equipmentPresets.map((item) => [item.profile.name, item] as const))(
    "%s — выход не больше объёма бака",
    (_name, item) => {
      // У большинства брендов число в названии — объём бака, и выход в ферментер
      // физически не может быть больше: если стало больше, значит в пресет затащили
      // маркетинговый литраж. У Braumeister бак не опубликован (vesselVolumeL = null),
      // а число в названии — литры готового пива, так что проверять нечего.
      if (item.vesselVolumeL == null) {
        return;
      }

      expect(item.profile.targetBatchVolumeL).toBeLessThanOrEqual(item.vesselVolumeL);
    }
  );

  it.each(equipmentPresets.map((item) => [item.profile.name, item] as const))(
    "%s — реальная варка помещается в котёл",
    (_name, item) => {
      // Гоняем пресет на его же максимальной засыпи: pre-boil объём должен влезать
      // в котёл, иначе пресет предупреждал бы о переполнении на каждой варке.
      const plan = calculateEquipmentVolumePlan(
        buildEquipmentProfileSummarySnapshot(item.profile),
        item.maxGrainKg
      );

      // Ни котёл, ни заторник не должны переполняться на рабочей засыпи: эти warnings
      // рендерятся пользователю бейджами «Лимит котла» / «Лимит затора», и пресет,
      // который жалуется на самого себя, — сломанный пресет.
      expect(plan.warnings).toEqual([]);
      expect(plan.preBoilHotL).toBeGreaterThan(item.profile.targetBatchVolumeL);
      expect(plan.spargeWaterL).toBeGreaterThanOrEqual(0);
    }
  );

  it.each(equipmentPresets.map((item) => [item.profile.name, item] as const))(
    "%s — заливает фиксированный объём независимо от засыпи",
    (_name, item) => {
      // Braumeister заливает штатные 12 / 23 / 55 л и не даёт пивовару это менять.
      // Проверяем на всём рабочем диапазоне засыпи, а не только на максимуме: именно
      // на малой засыпи обычная модель «гидромодуль × засыпь» недоливает в разы.
      if (item.systemKind !== "malt_pipe") {
        return;
      }

      const expected = item.profile.maxMashVolumeL!;

      for (const grainKg of [1.5, item.maxGrainKg / 2, item.maxGrainKg]) {
        const plan = calculateEquipmentVolumePlan(
          buildEquipmentProfileSummarySnapshot(item.profile),
          grainKg
        );

        expect(plan.mashWaterL).toBeCloseTo(expected, 1);
      }
    }
  );

  it.each(equipmentPresets.map((item) => [item.profile.name, item] as const))(
    "%s — предупреждает, когда засыпь не влезает",
    (_name, item) => {
      // Пересчёт чужого плотного рецепта на большой объём легко требует засыпи, которая
      // не помещается в корзину. По воде такой план выглядит здоровым, поэтому ловится
      // только отдельной проверкой — без неё пользователь получал план, который не сварить.
      const plan = calculateEquipmentVolumePlan(
        buildEquipmentProfileSummarySnapshot(item.profile),
        item.maxGrainKg * 1.5
      );

      expect(plan.warnings).toContain("grain_bill_limit_exceeded");
    }
  );

  it.each(equipmentPresets.map((item) => [item.profile.name, item] as const))(
    "%s — минимум воды в заторнике достижим",
    (_name, item) => {
      // Поле есть только у систем с ТЭНом на стенке («Бавария»): ниже минимума ТЭН
      // оголяется. Профиль, в котором минимум выше максимума, физически неисполним.
      const { minMashVolumeL, maxMashVolumeL } = item.profile;

      if (minMashVolumeL == null) {
        return;
      }

      expect(minMashVolumeL).toBeGreaterThan(0);
      expect(minMashVolumeL).toBeLessThanOrEqual(maxMashVolumeL ?? Infinity);
    }
  );

  it.each(equipmentPresets.map((item) => [item.profile.name, item] as const))(
    "%s — параметры в правдоподобных границах",
    (_name, item) => {
      const { profile } = item;

      // Эффективность варочного цеха. Ниже 55% — сломанный процесс, выше 85% — это
      // почти наверняка перепутанная mash efficiency (классическая ошибка Braumeister).
      expect(profile.brewhouseEfficiencyPct).toBeGreaterThanOrEqual(55);
      expect(profile.brewhouseEfficiencyPct).toBeLessThanOrEqual(85);

      // Испарение: 0 л/ч означало бы кипячение без кипения.
      expect(profile.evaporationRateLPerHr).toBeGreaterThan(0);
      expect(profile.evaporationRateLPerHr).toBeLessThanOrEqual(8);

      // Поглощение воды дробиной — физика зерна, а не свойство бренда.
      expect(profile.grainAbsorptionLPerKg).toBeGreaterThanOrEqual(0.6);
      expect(profile.grainAbsorptionLPerKg).toBeLessThanOrEqual(1.1);

      // Гидромодуль: 2.0 — предельно густой затор, 6.0 — предельно жидкий.
      expect(profile.mashThicknessLPerKg).toBeGreaterThanOrEqual(2);
      expect(profile.mashThicknessLPerKg).toBeLessThanOrEqual(6);

      expect(profile.trubChillerLossL).toBeGreaterThan(0);
      expect(item.maxGrainKg).toBeGreaterThan(0);
    }
  );

  it("выбор модели показывается при создании профиля и скрыт при редактировании", () => {
    const starter = equipmentPresets[0]!.profile;

    const createMarkup = renderToStaticMarkup(
      React.createElement(EquipmentProfileFormFields, { profile: starter, showPresets: true })
    );
    const editMarkup = renderToStaticMarkup(
      React.createElement(EquipmentProfileFormFields, { profile: starter })
    );

    expect(createMarkup).toContain("Модель пивоварни");
    expect(createMarkup).toContain("Grainfather G30");
    expect(createMarkup).toContain("Braumeister 20 л");
    expect(editMarkup).not.toContain("Модель пивоварни");
  });

  it("предупреждения оборудования доходят до плана варки, а не теряются", () => {
    // Раньше warnings объёмного плана считались и молча выбрасывались: показать их
    // было негде. Тест держит проброс — вместе с числами, без которых предупреждение
    // не подсказывает, что делать.
    const preset = equipmentPresets.find((item) => item.id === "brewzilla_35")!;
    const grainKg = preset.maxGrainKg * 2;
    const volumePlan = calculateEquipmentVolumePlan(
      buildEquipmentProfileSummarySnapshot(preset.profile),
      grainKg
    );

    const result = buildRecipeWaterPlanResult({
      waterPlanMeta: { setupEnabled: true } as never,
      fallbackBatchVolumeL: preset.profile.targetBatchVolumeL,
      equipmentVolumePlan: volumePlan,
      grainKg
    });

    expect(result.warnings).toContain("grain_bill_limit_exceeded");
    expect(result.equipmentLimits?.maxGrainKg).toBe(preset.maxGrainKg);
    expect(result.equipmentLimits?.grainKg).toBeCloseTo(grainKg, 1);
  });

  it("Easy Brew и iBrew описывают одно и то же железо одинаково", () => {
    // Это буквально один аппарат под двумя шильдиками. Если цифры разъедутся —
    // значит кто-то правил один бренд и забыл про второй.
    const byVolume = (brand: string) => new Map(
      equipmentPresets
        .filter((item) => item.brand === brand)
        .map((item) => [item.vesselVolumeL, item.profile])
    );

    const easyBrew = byVolume("Easy Brew");
    const iBrew = byVolume("iBrew");

    expect(easyBrew.size).toBeGreaterThan(0);
    expect(iBrew.size).toBe(easyBrew.size);

    for (const [volume, profile] of easyBrew) {
      const twin = iBrew.get(volume);
      expect(twin).toBeDefined();
      expect({ ...twin, name: null }).toEqual({ ...profile, name: null });
    }
  });
});
