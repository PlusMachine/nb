import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ navState: { searchParams: "" } }));

// CalculatorPageClient — единственный потребитель next/navigation в этом дереве
// (useSearchParams, читает shared-ссылки вида ?og=…&fg=…). notFound нужен только
// для сигнатуры импорта в page.tsx — в обычном (найденном) сценарии он не вызывается.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.navState.searchParams),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  }
}));

import { CalculatorPageClient } from "../components/calculators/calculator-page-client";
import { calculatorSections, calculators } from "../features/calculators/catalog";

const calculatorIndexTitles = [
  "Крепость и сбраживание",
  "Поправка рефрактометра",
  "Поправка ареометра",
  "Конвертер единиц",
  "Объем и плотность сусла",
  "Горечь (IBU)",
  "Вода на варку",
  "Цвет пива (SRM / EBC)",
  "Вода и pH",
  "Засев дрожжей",
  "Свежесть хмеля",
  "Карбонизация сахаром",
  "Карбонизация в кеге",
  "Бутылки и розлив",
  "Шпайзе и кройцен"
];

beforeEach(() => {
  mocks.navState.searchParams = "";
});

describe("calculator catalog seoTitle", () => {
  it("every calculator has a seoTitle starting with «Калькулятор» and within 60 chars", () => {
    for (const calculator of calculators) {
      expect(calculator.seoTitle.startsWith("Калькулятор")).toBe(true);
      expect(calculator.seoTitle.length).toBeLessThanOrEqual(60);
    }
  });
});

describe("calculator pages", () => {
  it("/calculators renders all calculators grouped into section headings with an intro paragraph", async () => {
    const { default: CalculatorsPage } = await import("../app/(public)/calculators/page");
    const html = renderToStaticMarkup(React.createElement(CalculatorsPage));

    expect(html).toContain("Калькуляторы для пивоварения");
    expect(html).toContain("Расчеты для домашнего пивоварения");
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

    const sectionCounts = calculatorSections.map(
      (section) => calculators.filter((calculator) => calculator.section === section).length
    );
    expect(sectionCounts).toEqual([4, 4, 3, 4]);

    const h2Headings = [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((match) => match[1]);
    expect(h2Headings).toEqual(calculatorSections);

    for (const calculator of calculators) {
      expect(html).toContain(`data-calculator-card="${calculator.slug}"`);
    }
    for (const title of calculatorIndexTitles) {
      expect(html).toContain(title);
    }
  });

  it("/calculators metadata has a self-canonical", async () => {
    const { metadata } = await import("../app/(public)/calculators/page");

    expect(metadata.alternates?.canonical).toBe("/calculators");
  });

  it("calculator routes render through the dynamic route with seoTitle metadata, canonical and visible/JSON-LD breadcrumbs", async () => {
    const routeModule = await import("../app/(public)/calculators/[slug]/page");
    const { default: CalculatorRoute, generateMetadata } = routeModule;

    for (const calculator of calculators) {
      const metadata = await generateMetadata({ params: Promise.resolve({ slug: calculator.slug }) });
      expect(metadata.title).toBe(calculator.seoTitle);
      expect(metadata.alternates?.canonical).toBe(`/calculators/${calculator.slug}`);
      expect((metadata.openGraph as { url?: string } | undefined)?.url).toBe(`/calculators/${calculator.slug}`);

      const view = await CalculatorRoute({ params: Promise.resolve({ slug: calculator.slug }) });
      const html = renderToStaticMarkup(view);

      expect(html).toContain(calculator.title);
      expect(html).toContain("Сбросить");
      expect(html).toContain("Как считаем?");
      expect(html).not.toContain("Что это значит");
      expect(html).not.toContain("Что сделать дальше");
      expect(html).not.toContain("Формула и допущения");
      // Блок «Частые ошибки» показывается только там, где в каталоге есть реальные
      // ошибки; пустой список = блок скрыт (не выдумываем проблемы ради заполнения).
      if (calculator.commonMistakes.length > 0) {
        expect(html).toContain("Частые ошибки");
      } else {
        expect(html).not.toContain("Частые ошибки");
      }

      // Видимые крошки + синхронный BreadcrumbList JSON-LD с той же сущностью.
      expect(html).toContain('aria-label="Breadcrumb"');
      expect(html).toContain("Калькуляторы");
      expect(html).toContain(calculator.shortTitle);
      expect(html).toContain('"@type":"BreadcrumbList"');
    }
  });

  it("generateMetadata throws notFound() for an unknown calculator slug", async () => {
    const { generateMetadata } = await import("../app/(public)/calculators/[slug]/page");

    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "not-a-real-calculator" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("formula and common mistakes render in the server HTML even when the client component renders nothing (static-generation fallback case)", async () => {
    vi.resetModules();
    vi.doMock("@/components/calculators/calculator-page-client", () => ({
      CalculatorPageClient: () => null
    }));

    try {
      const { default: CalculatorRoute } = await import("../app/(public)/calculators/[slug]/page");
      const calculator = calculators.find((item) => item.slug === "abv-attenuation")!;
      const view = await CalculatorRoute({ params: Promise.resolve({ slug: calculator.slug }) });
      const html = renderToStaticMarkup(view);

      // Шапка (h1+intro), формула/допущения и частые ошибки — из CalculatorHeading /
      // FormulaDetails / CommonMistakesDetails, серверных компонентов вне Suspense.
      expect(html).toContain(calculator.title);
      expect(html).toContain(calculator.intro);
      expect(html).toContain("Как считаем?");
      expect(html).toContain("ABV ≈ (OG − FG) × 131,25");
      expect(html).toContain("Частые ошибки");
      expect(html).toContain("FG снята рефрактометром без поправки на спирт");
      // Интерактивная часть (поля/результаты/related) отрендерена мок-заглушкой в null.
      expect(html).not.toContain("Сбросить");
    } finally {
      vi.doUnmock("@/components/calculators/calculator-page-client");
      vi.resetModules();
    }
  });

  it("calculator route canonical stays on the clean slug regardless of shared-link query state", async () => {
    mocks.navState.searchParams = "og=1.064&fg=1.014";
    const { generateMetadata } = await import("../app/(public)/calculators/[slug]/page");

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "abv-attenuation" }) });
    expect(metadata.alternates?.canonical).toBe("/calculators/abv-attenuation");
  });

  it("query param prefill works for scalar fields via useSearchParams", async () => {
    mocks.navState.searchParams = "og=1.064&fg=1.014";
    const { default: CalculatorRoute } = await import("../app/(public)/calculators/[slug]/page");
    const view = await CalculatorRoute({ params: Promise.resolve({ slug: "abv-attenuation" }) });
    const html = renderToStaticMarkup(view);

    expect(html).toContain('value="1.064"');
    expect(html).toContain('value="1.014"');
  });

  it("yeast-starter, speise-krausen and ibu expose a gravity scale switcher including Brix", async () => {
    const { default: CalculatorRoute } = await import("../app/(public)/calculators/[slug]/page");

    for (const slug of ["yeast-starter", "speise-krausen", "ibu"] as const) {
      const view = await CalculatorRoute({ params: Promise.resolve({ slug }) });
      const html = renderToStaticMarkup(view);

      expect(html).toContain('aria-label="Шкала плотности"');
      expect(html).toContain("°Bx");
    }
  });

  it("localStorage fallback code does not run during SSR", () => {
    const html = renderToStaticMarkup(
      React.createElement(CalculatorPageClient, { slug: "priming-sugar" })
    );

    // Шапка (h1/intro) и статичные секции больше не часть CalculatorPageClient —
    // они вынесены в calculator-static-sections.tsx и рендерятся из page.tsx.
    // Тут проверяем только то, что реально осталось в клиенте: интерактивные поля/результат.
    expect(html).toContain("Сбросить");
    expect(html).toContain("Всего праймера");
    expect(html).not.toContain("Как считаем?");
  });
});

describe("calculator seoDescription", () => {
  it("every calculator has a seoDescription (120-220 chars) used as the metadata/OG description", async () => {
    const { buildCalculatorMetadata } = await import("../features/calculators/seo");

    for (const calculator of calculators) {
      expect(calculator.seoDescription, `${calculator.slug} is missing seoDescription`).toBeDefined();
      const length = calculator.seoDescription!.length;
      expect(length).toBeGreaterThanOrEqual(120);
      expect(length).toBeLessThanOrEqual(220);

      const metadata = buildCalculatorMetadata(calculator);
      expect(metadata.description).toBe(calculator.seoDescription);
      expect((metadata.openGraph as { description?: string } | undefined)?.description).toBe(calculator.seoDescription);
    }
  });
});
