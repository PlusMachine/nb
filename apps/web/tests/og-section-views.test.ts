import { describe, expect, it } from "vitest";

import { catalogCategoryLandings } from "../features/ingredients/seo";
import { buildBrandSpectrumStops, buildRecipeOgView } from "../features/og/models";
import { getSectionOgImage, listSectionOgKeys, resolveSectionOgView } from "../features/og/section";
import type { RecipeOgData } from "../features/recipes/contracts";

const OPTS = { domain: "hmelo.example", wordmark: "NB" };

const HUB_KEYS = [
  "home",
  "recipes",
  "catalog",
  "calculators",
  "bjcp",
  "articles",
  "market",
  "demo",
  "labels",
  "brewforge"
];

const TITLE_FONT_STEPS = [104, 92, 76, 64, 54, 46];

describe("resolveSectionOgView", () => {
  it("все 10 хаб-ключей резолвятся в непустой view", () => {
    for (const key of HUB_KEYS) {
      const view = resolveSectionOgView(key, OPTS);
      expect(view, `hub key: ${key}`).not.toBeNull();
    }
  });

  it("все ключи категорийных лендингов каталога резолвятся в непустой view", () => {
    for (const landing of catalogCategoryLandings) {
      const view = resolveSectionOgView(`catalog-${landing.slug}`, OPTS);
      expect(view, `landing key: catalog-${landing.slug}`).not.toBeNull();
    }
  });

  it("количество лендинг-ключей в реестре равно длине catalogCategoryLandings", () => {
    const landingKeys = listSectionOgKeys().filter((key) => key.startsWith("catalog-"));
    expect(landingKeys).toHaveLength(catalogCategoryLandings.length);
  });

  it("неизвестный ключ -> null (resolveSectionOgView принимает сырой строковый вход из URL роута)", () => {
    expect(resolveSectionOgView("no-such-section", OPTS)).toBeNull();
  });

  it("у каждого view градиент фирменного спектра, непустой заголовок, кегль из ступеней, прокинутые domain/wordmark", () => {
    const stops = buildBrandSpectrumStops();
    for (const key of listSectionOgKeys()) {
      const view = resolveSectionOgView(key, OPTS);
      expect(view, key).not.toBeNull();
      expect(view!.strip).toEqual({ kind: "gradient", stops });
      expect(view!.title.length).toBeGreaterThan(0);
      expect(TITLE_FONT_STEPS).toContain(view!.titleFontSize);
      expect(view!.domain).toBe(OPTS.domain);
      expect(view!.wordmark).toBe(OPTS.wordmark);
    }
  });

  it("home имеет eyebrow «Домашнее пивоварение»", () => {
    const view = resolveSectionOgView("home", OPTS);
    expect(view!.eyebrow).toBe("Домашнее пивоварение");
  });

  it("лендинги каталога имеют eyebrow «Каталог ингредиентов»", () => {
    const view = resolveSectionOgView("catalog-malts", OPTS);
    expect(view!.eyebrow).toBe("Каталог ингредиентов");
  });

  it("recipes — без eyebrow (пустая строка)", () => {
    const view = resolveSectionOgView("recipes", OPTS);
    expect(view!.eyebrow).toBe("");
  });

  it("Ф3: обложка раздела (хаб и лендинг) центрирует eyebrow+title — нет строки статов, иначе холст пустует сверху", () => {
    expect(resolveSectionOgView("recipes", OPTS)!.centered).toBe(true);
    expect(resolveSectionOgView("catalog-malts", OPTS)!.centered).toBe(true);
  });

  it("Ф3 регресс-гард: сущностная карточка рецепта флаг центрирования НЕ проставляет (raскладка Ф1 не меняется)", () => {
    const recipe: RecipeOgData = {
      title: "Курский пилснер",
      slug: "kursky-pilsner",
      styleId: "3B",
      og: 1.048,
      abv: 4.9,
      ibu: 35,
      color: 4,
      batchSizeNormalizedQuantity: 20000,
      batchSizeNormalizedUnit: "ml",
      rating: null,
      completedBrewCount: 0,
      heroImageId: null
    };
    const view = buildRecipeOgView(recipe, null, OPTS);
    // RecipeOgView не объявляет поле centered вовсе — hasOwnProperty, а не
    // прямой доступ к .centered (иначе tsc отказал бы: свойства нет в типе).
    expect(Object.prototype.hasOwnProperty.call(view, "centered")).toBe(false);
  });
});

describe("getSectionOgImage", () => {
  it("catalog-malts -> корректные url/размеры/alt (упражняет ленивый реестр лендингов)", () => {
    const image = getSectionOgImage("catalog-malts");
    expect(image.url).toBe("/api/og/sections/catalog-malts");
    expect(image.width).toBe(1200);
    expect(image.height).toBe(630);
    expect(image.alt.length).toBeGreaterThan(0);
  });
});
