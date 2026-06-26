import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CalculatorPageClient } from "../components/calculators/calculator-page-client";
import { calculatorSections, calculators } from "../features/calculators/catalog";

const calculatorIndexTitles = [
  "Крепость и сбраживание",
  "Поправка рефрактометра на алкоголь",
  "Поправка ареометра по температуре",
  "Пивоваренный конвертер единиц",
  "Коррекция объема и плотности сусла",
  "Горечь пива (IBU)",
  "Вода на варку",
  "Цвет пива (SRM / EBC)",
  "Вода и pH затора",
  "Засев дрожжей и стартер",
  "Свежесть хмеля",
  "Карбонизация сахаром",
  "Карбонизация в кеге",
  "Бутылки и розлив",
  "Шпайзе и кройцен"
];

describe("calculator pages", () => {
  it("/calculators renders all calculators on one page", async () => {
    const { default: CalculatorsPage } = await import("../app/(public)/calculators/page");
    const html = renderToStaticMarkup(React.createElement(CalculatorsPage));

    expect(html).toContain("Калькуляторы для пивоварения");
    expect(html).not.toContain("Что хотите рассчитать?");
    expect(html).not.toContain("Фильтры калькуляторов");
    expect(html).not.toContain("Быстрые переходы");
    expect(html).not.toContain("Доступно без логина");
    expect(html).not.toContain("Популярные");
    expect(html).not.toContain("Открыть");
    expect(html).not.toContain("Плотность, алкоголь, IBU, вода, дрожжи, карбонизация и розлив");
    expect(html).not.toContain("Не заменяет алкогольную коррекцию");
    expect(html).not.toContain("Быстрый перевод пивоваренных единиц");
    expect(html).toContain("/images/calculators/2-Photoroom.png");
    expect(html).toContain("/images/calculators/3-Photoroom.png");
    expect(html).toContain("/images/calculators/4-Photoroom.png");
    expect(html).toContain("/images/calculators/18-Photoroom.png");
    expect(html.match(/data-calculator-card=/g)).toHaveLength(15);
    expect(calculatorSections.map((section) => calculators.filter((calculator) => calculator.section === section).length)).toEqual([4, 4, 3, 4]);

    for (const calculator of calculators) {
      expect(html).toContain(`data-calculator-card="${calculator.slug}"`);
    }
    for (const title of calculatorIndexTitles) {
      expect(html).toContain(title);
    }
  });

  it("calculator routes render through the dynamic route", async () => {
    const { default: CalculatorRoute } = await import("../app/(public)/calculators/[slug]/page");

    for (const calculator of calculators) {
      const view = await CalculatorRoute({
        params: Promise.resolve({ slug: calculator.slug }),
        searchParams: Promise.resolve({})
      });
      const html = renderToStaticMarkup(view);

      expect(html).toContain(calculator.title);
      expect(html).toContain("Сбросить");
      expect(html).toContain("Метод расчета");
      expect(html).not.toContain("Что это значит");
      expect(html).not.toContain("Что сделать дальше");
      expect(html).not.toContain("Формула и допущения");
      expect(html).not.toContain("Частые ошибки");
    }
  });

  it("query param prefill works for scalar fields", async () => {
    const { default: CalculatorRoute } = await import("../app/(public)/calculators/[slug]/page");
    const view = await CalculatorRoute({
      params: Promise.resolve({ slug: "abv-attenuation" }),
      searchParams: Promise.resolve({ og: "1.064", fg: "1.014" })
    });
    const html = renderToStaticMarkup(view);

    expect(html).toContain('value="1.064"');
    expect(html).toContain('value="1.014"');
  });

  it("localStorage fallback code does not run during SSR", () => {
    const html = renderToStaticMarkup(
      React.createElement(CalculatorPageClient, {
        slug: "priming-sugar",
        initialQuery: {}
      })
    );

    expect(html).toContain("Карбонизация сахаром");
    expect(html).toContain("Всего сахара");
  });
});
