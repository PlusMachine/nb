import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PublicRecipeBoilSection,
  PublicRecipeFermentationSection,
  PublicRecipeMashSection
} from "../components/recipes/public-recipe-process-section";
import type { RecipeIngredientDto, RecipeProcessMeta } from "../features/recipes/contracts";

const buildProcessMeta = (overrides: Partial<RecipeProcessMeta> = {}): RecipeProcessMeta => ({
  mashProfile: { steps: [] },
  fermentationProfile: {
    primaryTemperatureC: 20,
    primaryDurationDays: 10,
    extraSteps: [],
    coldCrash: { enabled: false, temperatureC: 2, durationDays: 2 },
    conditioning: { enabled: false, temperatureC: 12, durationDays: 14 }
  },
  ...overrides
});

const renderMash = (meta: RecipeProcessMeta) =>
  renderToStaticMarkup(React.createElement(PublicRecipeMashSection, { processMeta: meta }));
const renderFerment = (meta: RecipeProcessMeta, ingredients?: RecipeIngredientDto[]) =>
  renderToStaticMarkup(React.createElement(PublicRecipeFermentationSection, { processMeta: meta, ingredients }));

let ingredientSeq = 0;
const buildIngredient = (overrides: Partial<RecipeIngredientDto>): RecipeIngredientDto => ({
  id: `ri-${ingredientSeq += 1}`,
  recipeId: "r-1",
  persistentKey: `00000000-0000-4000-8000-0000000000${String(ingredientSeq).padStart(2, "0")}`,
  displayOrder: ingredientSeq,
  ingredientCatalogItemId: null,
  userCustomIngredientId: null,
  type: "hop",
  ingredientCategory: "hop",
  ingredientSubtype: "hop",
  ingredientDisplayName: "Citra",
  amountEnteredQuantity: 50,
  amountEnteredUnit: "g",
  amountNormalizedQuantity: 50,
  amountNormalizedUnit: "g",
  stage: "boil",
  timeOffset: null,
  stepMeta: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides
});

describe("PublicRecipeMashSection", () => {
  it("не рендерится, если шагов затора нет (обратная совместимость с экстракт-рецептами)", () => {
    expect(renderMash(buildProcessMeta())).toBe("");
  });

  it("показывает шаги с температурой и длительностью + итог по минутам", () => {
    const html = renderMash(buildProcessMeta({
      mashProfile: {
        steps: [
          { id: "m1", name: "Белковая пауза", temperatureC: 52, durationMinutes: 15 },
          { id: "m2", name: "Осахаривание", temperatureC: 66, durationMinutes: 60 }
        ]
      }
    }));
    expect(html).toContain("Затирание");
    // Осмысленное имя из импорта показываем как есть.
    expect(html).toContain("Белковая пауза");
    expect(html).toContain("Осахаривание");
    expect(html).toContain("52 °C");
    expect(html).toContain("15 мин");
    expect(html).toContain("66 °C");
    expect(html).toContain("60 мин");
    // Итог: 2 шага · 75 мин.
    expect(html).toContain("75 мин");
    expect(html).toContain("2 шага");
  });

  it("генерик-имя шага заменяет на «Шаг N»", () => {
    const html = renderMash(buildProcessMeta({
      mashProfile: { steps: [{ id: "m1", name: "Инфузия", temperatureC: 67, durationMinutes: 60 }] }
    }));
    expect(html).toContain("Шаг 1");
    expect(html).not.toContain("Инфузия");
  });

  it("дробную температуру показывает с одним знаком", () => {
    const html = renderMash(buildProcessMeta({
      mashProfile: { steps: [{ id: "m1", name: "Шаг 1", temperatureC: 66.5, durationMinutes: 45 }] }
    }));
    expect(html).toContain("66.5 °C");
  });
});

describe("PublicRecipeFermentationSection", () => {
  it("показывает основное брожение с правильным склонением дней", () => {
    expect(renderFerment(buildProcessMeta())).toContain("Основное");
    expect(renderFerment(buildProcessMeta())).toContain("20 °C");
    expect(renderFerment(buildProcessMeta())).toContain("10 дней");

    expect(
      renderFerment(buildProcessMeta({
        fermentationProfile: { ...buildProcessMeta().fermentationProfile, primaryDurationDays: 1 }
      }))
    ).toContain("1 день");
    expect(
      renderFerment(buildProcessMeta({
        fermentationProfile: { ...buildProcessMeta().fermentationProfile, primaryDurationDays: 3 }
      }))
    ).toContain("3 дня");
  });

  it("показывает доп-шаги, колд-краш и выдержку только когда заданы/включены", () => {
    const html = renderFerment(buildProcessMeta({
      fermentationProfile: {
        primaryTemperatureC: 19,
        primaryDurationDays: 12,
        extraSteps: [{ id: "f1", name: "Диацетильная пауза", temperatureC: 22, durationDays: 2 }],
        coldCrash: { enabled: true, temperatureC: 2, durationDays: 3 },
        conditioning: { enabled: true, temperatureC: 12, durationDays: 21 }
      }
    }));
    expect(html).toContain("Диацетильная пауза");
    expect(html).toContain("22 °C");
    expect(html).toContain("Колд-краш");
    expect(html).toContain("2 °C");
    expect(html).toContain("3 дня");
    expect(html).toContain("Выдержка");
    expect(html).toContain("21 день");
  });

  it("выключенные колд-краш и выдержку не показывает", () => {
    const html = renderFerment(buildProcessMeta());
    expect(html).not.toContain("Колд-краш");
    expect(html).not.toContain("Выдержка");
  });

  it("показывает сухое охмеление с количеством и днями", () => {
    const html = renderFerment(buildProcessMeta(), [
      buildIngredient({ ingredientDisplayName: "Simcoe", stage: "fermentation", stepMeta: { useType: "dry_hop", durationDays: 4 } }),
      buildIngredient({ ingredientDisplayName: "Magnum", stage: "boil", stepMeta: { useType: "boil", timeMinutes: 60 } })
    ]);
    expect(html).toContain("Сухое охмеление");
    expect(html).toContain("Simcoe");
    expect(html).toContain("4 дня");
    expect(html).toContain("50 г");
    // Хмель кипа в секцию брожения не попадает.
    expect(html).not.toContain("Magnum");
  });
});

describe("PublicRecipeBoilSection", () => {
  const renderBoil = (boilTimeMinutes: number, ingredients: RecipeIngredientDto[]) =>
    renderToStaticMarkup(React.createElement(PublicRecipeBoilSection, { boilTimeMinutes, ingredients }));

  it("показывает длительность кипа и расписание: FWH → минуты по убыванию → вирпул", () => {
    const html = renderBoil(90, [
      buildIngredient({ ingredientDisplayName: "Centennial", stage: "whirlpool", stepMeta: { useType: "whirlpool", timeMinutes: 15 } }),
      buildIngredient({ ingredientDisplayName: "Ирландский мох", type: "consumable", ingredientCategory: "consumable", ingredientSubtype: null, stage: "boil", stepMeta: { timeMinutes: 10 } }),
      buildIngredient({ ingredientDisplayName: "Magnum", stage: "boil", stepMeta: { useType: "boil", timeMinutes: 60 } }),
      buildIngredient({ ingredientDisplayName: "Saaz", stage: "boil", stepMeta: { useType: "first_wort_hop" } }),
      buildIngredient({ ingredientDisplayName: "US-05", type: "yeast", ingredientCategory: "yeast", ingredientSubtype: null, stage: "fermentation" }),
      buildIngredient({ ingredientDisplayName: "Simcoe", stage: "fermentation", stepMeta: { useType: "dry_hop" } })
    ]);

    expect(html).toContain("Кипячение");
    expect(html).toContain("90 мин");
    expect(html).toContain("FWH");
    expect(html).toContain("Вирпул");
    // Порядок внесений: первое сусло → 60 мин → 10 мин → вирпул.
    const order = ["Saaz", "Magnum", "Ирландский мох", "Centennial"].map((name) => html.indexOf(name));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Дрожжи и сухое охмеление в кип не попадают.
    expect(html).not.toContain("US-05");
    expect(html).not.toContain("Simcoe");
  });

  it("без внесений показывает только длительность", () => {
    const html = renderBoil(60, []);
    expect(html).toContain("Кипячение");
    expect(html).toContain("60 мин");
    expect(html).toContain("Внесений на кипячении нет.");
  });
});
