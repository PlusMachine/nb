import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PublicRecipeMashSection,
  PublicRecipeFermentationSection
} from "../components/recipes/public-recipe-process-section";
import type { RecipeProcessMeta } from "../features/recipes/contracts";

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
const renderFerment = (meta: RecipeProcessMeta) =>
  renderToStaticMarkup(React.createElement(PublicRecipeFermentationSection, { processMeta: meta }));

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
});
