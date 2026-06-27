import { DeviceRecipeSchema } from "@nb/brewforge-protocol";
import { describe, expect, it } from "vitest";

import { brewPlanV1ToDeviceRecipe } from "./translator";

// Слепок одной добавки в форме buildBrewPlanSnapshot (boil/whirlpool).
const addition = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  linePersistentKey: "k",
  name: "Cascade",
  category: "hops",
  stage: "boil",
  timeOffsetMinutes: 15,
  amount: { quantity: 25, unit: "g" },
  stepMeta: null,
  ...overrides,
});

// Минимально валидный brew_plan_v1 (как его строит buildBrewPlanSnapshot).
const makeSnapshot = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  version: "brew_plan_v1",
  recipe: { id: "r1", title: "West Coast IPA", versionNumber: 1, batchSizeL: 20 },
  equipmentProfileSnapshot: null,
  waterPlanMeta: null,
  mashSteps: [
    { id: "m1", name: "Saccharification", targetTemperatureC: 66, durationMinutes: 60 },
    { id: "m2", name: "Mash out rest", targetTemperatureC: 76, durationMinutes: 10 },
  ],
  boilPlan: {
    boilTimeMinutes: 60,
    timedAdditions: [
      addition({ name: "Magnum", amount: { quantity: 30, unit: "g" }, timeOffsetMinutes: 60 }),
      addition({ name: "Cascade", amount: { quantity: 25, unit: "g" }, timeOffsetMinutes: 15 }),
      addition({ name: "Citra", amount: { quantity: 25, unit: "g" }, timeOffsetMinutes: 0 }),
    ],
  },
  whirlpoolPlan: [
    addition({
      name: "Citra WP",
      stage: "whirlpool",
      amount: { quantity: 50, unit: "g" },
      stepMeta: { useType: "whirlpool", temperatureC: 80, timeMinutes: 20 },
    }),
  ],
  fermentationPlan: { primaryTemperatureC: 19, primaryDurationDays: 14 },
  packagingPlan: null,
  deviceHints: [],
  ...overrides,
});

describe("brewPlanV1ToDeviceRecipe", () => {
  it("переводит обычный рецепт корректно", () => {
    const recipe = brewPlanV1ToDeviceRecipe(makeSnapshot());

    expect(recipe.schema).toBe(1);
    expect(recipe.units).toBe("C");
    expect(recipe.name).toBe("West Coast IPA");

    expect(recipe.mash.steps).toEqual([
      { name: "Saccharification", tempC: 66, timeMin: 60 },
      { name: "Mash out rest", tempC: 76, timeMin: 10 },
    ]);

    expect(recipe.boil.boilTimeMin).toBe(60);
    expect(recipe.boil.hops).toEqual([
      { name: "Magnum", amountG: 30, atMinBeforeEnd: 60 },
      { name: "Cascade", amountG: 25, atMinBeforeEnd: 15 },
      { name: "Citra", amountG: 25, atMinBeforeEnd: 0 },
    ]);

    expect(recipe.hopStand).toEqual([{ tempC: 80, timeMin: 20 }]);
    expect(recipe.whirlpool).toBe("hot");
    expect(recipe.cooling.targetC).toBe(19);
  });

  it("нормализует количества хмеля (g/kg/oz) в граммы", () => {
    const recipe = brewPlanV1ToDeviceRecipe(
      makeSnapshot({
        boilPlan: {
          boilTimeMinutes: 60,
          timedAdditions: [
            addition({ name: "G", amount: { quantity: 50, unit: "g" } }),
            addition({ name: "KG", amount: { quantity: 1, unit: "kg" } }),
            addition({ name: "OZ", amount: { quantity: 1, unit: "oz" } }),
          ],
        },
      }),
    );

    const byName = Object.fromEntries(recipe.boil.hops.map((hop) => [hop.name, hop.amountG]));
    expect(byName.G).toBe(50);
    expect(byName.KG).toBe(1000);
    expect(byName.OZ).toBe(28.3); // 28.349523125 г → округление до 0.1
  });

  it("отдаёт приоритет stepMeta.timeMinutes над timeOffsetMinutes", () => {
    const recipe = brewPlanV1ToDeviceRecipe(
      makeSnapshot({
        boilPlan: {
          boilTimeMinutes: 60,
          timedAdditions: [
            addition({
              name: "FWH",
              timeOffsetMinutes: 5,
              stepMeta: { timeMinutes: 60 },
            }),
          ],
        },
      }),
    );

    expect(recipe.boil.hops[0]?.atMinBeforeEnd).toBe(60);
  });

  it("обрезает > 8 мэш-шагов и > 12 хмелей", () => {
    const recipe = brewPlanV1ToDeviceRecipe(
      makeSnapshot({
        mashSteps: Array.from({ length: 10 }, (_, i) => ({
          id: `m${i}`,
          name: `Step ${i}`,
          targetTemperatureC: 60 + i,
          durationMinutes: 10,
        })),
        boilPlan: {
          boilTimeMinutes: 90,
          timedAdditions: Array.from({ length: 15 }, (_, i) =>
            addition({ name: `Hop ${i}`, timeOffsetMinutes: i, amount: { quantity: 10, unit: "g" } }),
          ),
        },
      }),
    );

    expect(recipe.mash.steps).toHaveLength(8);
    expect(recipe.boil.hops).toHaveLength(12);
  });

  it("обрезает > 5 hop-стендов и схлопывает идентичные", () => {
    const recipe = brewPlanV1ToDeviceRecipe(
      makeSnapshot({
        whirlpoolPlan: [
          // два хмеля в одном стенде (80 °C / 20 мин) → один стенд
          addition({ name: "A", stage: "whirlpool", stepMeta: { temperatureC: 80, timeMinutes: 20 } }),
          addition({ name: "B", stage: "whirlpool", stepMeta: { temperatureC: 80, timeMinutes: 20 } }),
          addition({ name: "C", stage: "whirlpool", stepMeta: { temperatureC: 75, timeMinutes: 30 } }),
          addition({ name: "D", stage: "whirlpool", stepMeta: { temperatureC: 70, timeMinutes: 15 } }),
          addition({ name: "E", stage: "whirlpool", stepMeta: { temperatureC: 65, timeMinutes: 10 } }),
          addition({ name: "F", stage: "whirlpool", stepMeta: { temperatureC: 60, timeMinutes: 5 } }),
          addition({ name: "G", stage: "whirlpool", stepMeta: { temperatureC: 55, timeMinutes: 2 } }),
        ],
      }),
    );

    // 7 внесений → 6 уникальных стендов (A/B схлопнуты) → clamp до BF_MAX_HOP_STANDS=5.
    expect(recipe.hopStand.length).toBeLessThanOrEqual(5);
  });

  it("вирпул 'off' при отсутствии whirlpoolPlan", () => {
    const recipe = brewPlanV1ToDeviceRecipe(makeSnapshot({ whirlpoolPlan: [] }));
    expect(recipe.whirlpool).toBe("off");
    expect(recipe.hopStand).toEqual([]);
  });

  it("вирпул 'cool', когда температура стенда ниже 80 °C", () => {
    const recipe = brewPlanV1ToDeviceRecipe(
      makeSnapshot({
        whirlpoolPlan: [
          addition({ name: "Cool", stage: "whirlpool", stepMeta: { temperatureC: 70, timeMinutes: 30 } }),
        ],
      }),
    );
    expect(recipe.whirlpool).toBe("cool");
    expect(recipe.hopStand).toEqual([{ tempC: 70, timeMin: 30 }]);
  });

  it("оставляет вычисляемые устройством поля null", () => {
    const recipe = brewPlanV1ToDeviceRecipe(makeSnapshot());
    expect(recipe.mash.doughInTempC).toBeNull();
    expect(recipe.mash.mashOut).toBeNull();
    expect(recipe.boil.boilTempC).toBeNull();
  });

  it("обрезает имя до 32 символов", () => {
    const recipe = brewPlanV1ToDeviceRecipe(
      makeSnapshot({ recipe: { id: "r", title: "x".repeat(50), versionNumber: 1, batchSizeL: 20 } }),
    );
    expect(recipe.name.length).toBe(32);
  });

  it("результат всегда проходит DeviceRecipeSchema (в т.ч. на мусоре)", () => {
    const inputs: unknown[] = [
      makeSnapshot(),
      {},
      null,
      undefined,
      42,
      "nope",
      { recipe: { title: 123 }, mashSteps: "bad", boilPlan: 7, whirlpoolPlan: {} },
      makeSnapshot({ mashSteps: [{ name: "no temp", durationMinutes: 30 }] }),
    ];
    for (const input of inputs) {
      const recipe = brewPlanV1ToDeviceRecipe(input);
      expect(() => DeviceRecipeSchema.parse(recipe)).not.toThrow();
    }
  });

  it("даёт безопасные дефолты для пустого снимка", () => {
    const recipe = brewPlanV1ToDeviceRecipe({});
    expect(recipe.name).toBe("Brew");
    expect(recipe.mash.steps).toEqual([]);
    expect(recipe.boil.boilTimeMin).toBe(60);
    expect(recipe.boil.hops).toEqual([]);
    expect(recipe.hopStand).toEqual([]);
    expect(recipe.whirlpool).toBe("off");
    expect(recipe.cooling.targetC).toBe(20);
  });
});
