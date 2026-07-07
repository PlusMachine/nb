import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  listResult: null as any,
  hubResult: null as any,
  detailItem: null as any,
  similarItems: [] as any[],
  brandItems: [] as any[],
  recipesResult: { total: 0, items: [] } as any
}));

// React 18 (используемый в vitest/node) не экспортирует `cache` — это API
// React-канала, который Next.js полифиллит собственной сборкой React только
// внутри своего рантайма. [source]/[id]/page.tsx использует `cache` для дедупа
// generateMetadata/страницы — под простым node-рендером в тестах его нужно
// подменить identity-обёрткой, иначе импорт страницы падает на этапе загрузки модуля.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: actual.cache ?? (<T extends (...args: any[]) => any>(fn: T) => fn)
  };
});

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => React.createElement("a", {
    href: typeof href === "string" ? href : String(href),
    ...props
  }, children)
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  }
}));

vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: "user-1" }),
  getSessionUser: async () => ({ id: "user-1" })
}));

vi.mock("@/features/ingredients/catalog-service", () => ({
  listUserCatalogIngredients: async () => mockState.listResult,
  listCatalogHubSections: async () => mockState.hubResult,
  getUserCatalogIngredientByRef: async () => mockState.detailItem,
  listSimilarCatalogIngredients: async () => mockState.similarItems,
  listSameBrandCatalogIngredients: async () => mockState.brandItems
}));

vi.mock("@/features/recipes/service", () => ({
  listPublicRecipesForIngredient: async () => mockState.recipesResult
}));

vi.mock("@/components/recipes/recipes-grid", () => ({
  RecipesGrid: ({ recipes }: any) => React.createElement("div", null, `recipes-grid:${recipes?.length ?? 0}`)
}));

vi.mock("@/components/ingredients/ingredient-favorite-toggle", () => ({
  IngredientFavoriteToggle: ({ label, initialFavorite }: any) => React.createElement("button", {
    type: "button",
    "data-favorite": initialFavorite ? "1" : "0"
  }, label)
}));

vi.mock("@/components/ingredients/ingredient-purchase-links-manager", () => ({
  IngredientPurchaseLinksEditor: ({ initialLinks }: any) => React.createElement("div", null, `purchase-links:${initialLinks?.length ?? 0}`)
}));

vi.mock("@/components/ingredients/delete-custom-catalog-ingredient-button", () => ({
  DeleteCustomCatalogIngredientButton: ({ label }: any) => React.createElement("button", { type: "button" }, label ?? "Удалить")
}));

vi.mock("@/components/ingredients/ingredient-catalog-toolbar", () => ({
  IngredientCatalogToolbar: () => React.createElement("div", null, "toolbar")
}));

vi.mock("@/components/shared/country-flag", () => ({
  CountryFlagLabel: ({ label }: any) => React.createElement("span", null, label)
}));

// Страница детали ингредиента рендерит FeedbackReportLink, который вызывает
// useFeedback() — этот хук требует FeedbackProvider (components/providers.tsx)
// в дереве, которого простой node-рендер страницы здесь не поднимает. Как и
// остальные leaf-компоненты выше, мокаем сам FeedbackReportLink лёгкой заглушкой,
// не завязанной на контекст, вместо того чтобы монтировать полноценный провайдер
// (с Sheet/тостами/next/navigation) только ради статической разметки.
vi.mock("@/components/feedback/feedback-report-link", () => ({
  FeedbackReportLink: ({ children }: any) => React.createElement("button", { type: "button" }, children ?? "Сообщить о неточности")
}));

import { IngredientCatalogContent } from "../app/(public)/catalog/content";
import IngredientDetailPage from "../app/(public)/catalog/[source]/[id]/page";
import { catalogCategoryLandings } from "../features/ingredients/seo";

const buildCatalogItem = (overrides: Record<string, unknown> = {}) => ({
  id: "catalog-hop-1",
  source: "catalog",
  type: "hop",
  category: "hop",
  subtype: null,
  familyId: null,
  primaryLabelRu: "Citra",
  secondaryLabelRu: "Цитра",
  displayName: "Citra",
  displayNameRu: "Citra",
  displayNameEn: "Citra",
  nameRu: "Citra",
  nameEn: "Citra",
  displayModeRu: "localized_first",
  displayNameOverrideRu: null,
  secondaryNameOverrideRu: null,
  hideSecondaryNameRu: false,
  brand: "Yakima Chief",
  producer: "Yakima Chief",
  brandName: "Yakima Chief",
  manufacturer: "Yakima Chief",
  country: "США",
  countryCode: "US",
  countryName: "США",
  productCode: null,
  aliases: [],
  sources: [],
  packageVariants: [],
  notes: null,
  properties: null,
  technicalData: {
    type: "hop",
    alphaAcidPctTypical: 12.5,
    betaAcidPctTypical: 4.2,
    hopForm: "pellet"
  },
  defaultUnit: "g",
  defaultDisplayUnit: "g",
  allowedUnits: ["g"],
  measurementDimension: "weight",
  completenessLevel: "recommended",
  quantityDefaults: null,
  unitPreferred: null,
  derivedFromIngredientId: null,
  derivedFromDisplayName: null,
  inventoryUsageCount: 1,
  recipeUsageCount: 2,
  inventoryInUse: true,
  recipeInUse: true,
  isFavorite: false,
  hopAlphaAcidPct: 12.5,
  hopBetaAcidPct: 4.2,
  hopForm: "pellet",
  fermentableColorLovibond: null,
  fermentableExtractYieldPct: null,
  yeastAttenuationPct: null,
  yeastMinFermentationTempC: null,
  yeastMaxFermentationTempC: null,
  purchaseLinks: [],
  isActive: true,
  status: "active",
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z"),
  ...overrides
});

// Хаб /catalog (IngredientCatalogContent без landing) рендерит секции по
// catalogCategoryLandings — дефолт для мока: все 6 секций пустые (total=0),
// презентационные тесты подставляют элементы в одну подходящую секцию через
// setHubSection.
const buildEmptyHubSections = () => catalogCategoryLandings.map((landing) => ({
  slug: landing.slug,
  category: landing.category,
  subtype: landing.subtype,
  items: [] as any[],
  total: 0
}));

const buildHubResult = () => ({
  sections: buildEmptyHubSections(),
  facets: {
    catalogCount: 0,
    customCount: 0,
    byCategory: {
      fermentable: 0,
      hop: 0,
      yeast: 0,
      consumable: 0,
      water_treatment: 0
    },
    byFermentableSubtype: {
      malt: 0,
      fermentable: 0
    }
  },
  total: 0
});

const setHubSection = (slug: string, patch: { items: any[]; total?: number }) => {
  mockState.hubResult = {
    ...mockState.hubResult,
    sections: mockState.hubResult.sections.map((section: any) => (
      section.slug === slug
        ? { ...section, items: patch.items, total: patch.total ?? patch.items.length }
        : section
    ))
  };
};

describe("ingredient catalog metadata ui", () => {
  beforeEach(() => {
    mockState.listResult = {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      facets: {
        catalogCount: 0,
        customCount: 0,
        byCategory: {
          fermentable: 0,
          hop: 0,
          yeast: 0,
          consumable: 0,
          water_treatment: 0
        },
        byFermentableSubtype: {
          malt: 0,
          fermentable: 0
        }
      }
    };
    mockState.hubResult = buildHubResult();
    mockState.detailItem = null;
    mockState.similarItems = [];
    mockState.brandItems = [];
    mockState.recipesResult = { total: 0, items: [] };
  });

  it("renders favorite toggles in the catalog list without introducing a text badge", async () => {
    setHubSection("hops", {
      items: [
        buildCatalogItem({
          isFavorite: true
        })
      ]
    });

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({})
    }));

    expect(html).toContain("Убрать из избранного");
    expect(html).not.toContain(">ИЗБРАННОЕ<");
  });

  it("renders favorite toggle and purchase-links section on the ingredient detail page", async () => {
    mockState.detailItem = buildCatalogItem({
      isFavorite: false,
      purchaseLinks: [
        {
          id: "link-1",
          url: "https://ozon.ru/product/citra",
          normalizedUrl: "https://ozon.ru/product/citra",
          host: "ozon.ru",
          displayHost: "ozon.ru",
          marketplace: "ozon",
          marketplaceLabel: "Ozon",
          position: 0
        }
      ]
    });

    const html = renderToStaticMarkup(await IngredientDetailPage({
      params: Promise.resolve({
        source: "system",
        id: "catalog-hop-1"
      })
    }));

    expect(html).toContain("Добавить в избранное");
    expect(html).toContain("Где купить");
    expect(html).toContain("purchase-links:1");
  });

  it("shows the Описание section first when descriptionRu is set, split into paragraphs", async () => {
    mockState.detailItem = buildCatalogItem({
      descriptionRu: "Цитра — американский ароматный хмель с яркими нотами цитрусовых.\n\nХорошо подходит для позднего внесения и сухого охмеления."
    });

    const html = renderToStaticMarkup(await IngredientDetailPage({
      params: Promise.resolve({
        source: "system",
        id: "catalog-hop-1"
      })
    }));

    expect(html).toContain("Описание");
    expect(html).toContain("Цитра — американский ароматный хмель с яркими нотами цитрусовых.");
    expect(html).toContain("Хорошо подходит для позднего внесения и сухого охмеления.");
    expect(html.indexOf("Описание")).toBeLessThan(html.indexOf("Параметры"));
  });

  it("omits the Описание section entirely when descriptionRu is empty", async () => {
    mockState.detailItem = buildCatalogItem({ descriptionRu: null });

    const html = renderToStaticMarkup(await IngredientDetailPage({
      params: Promise.resolve({
        source: "system",
        id: "catalog-hop-1"
      })
    }));

    expect(html).not.toContain(">Описание<");
  });

  it("shows producer as the brand label for fermentables on the detail page", async () => {
    mockState.detailItem = buildCatalogItem({
      id: "catalog-fermentable-1",
      type: "fermentable",
      category: "fermentable",
      subtype: "fermentable",
      primaryLabelRu: "Баварский пилснер",
      secondaryLabelRu: "Bavarian Pilsner",
      displayName: "Баварский пилснер",
      displayNameRu: "Баварский пилснер",
      displayNameEn: "Bavarian Pilsner",
      nameRu: "Баварский пилснер",
      nameEn: "Bavarian Pilsner",
      brand: null,
      producer: "Weyermann",
      brandName: null,
      manufacturer: "Weyermann",
      technicalData: {
        type: "fermentable",
        extractPctDryBasis: 75,
        colorLovibond: 6.1
      },
      fermentableColorLovibond: 6.1,
      fermentableExtractYieldPct: 75
    });

    const html = renderToStaticMarkup(await IngredientDetailPage({
      params: Promise.resolve({
        source: "system",
        id: "catalog-fermentable-1"
      })
    }));

    expect(html).toContain("Weyermann");
    expect(html).toContain("Бренд");
  });

  it("drops the Тип/Использование columns from the catalog list table", async () => {
    setHubSection("hops", { items: [buildCatalogItem()] });

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({})
    }));

    expect(html).toContain("Параметры");
    expect(html).not.toContain(">Тип<");
    expect(html).not.toContain("Использование");
  });

  it("shows a hop-form badge near the name only for non-standard forms and translates the form in parameters", async () => {
    setHubSection("hops", {
      items: [
        buildCatalogItem({
          id: "hop-standard",
          hopForm: "standard",
          technicalData: { type: "hop", alphaAcidPctTypical: 12.5, hopForm: "standard" }
        }),
        buildCatalogItem({
          id: "hop-cryo",
          primaryLabelRu: "Citra Cryo",
          hopForm: "cryo",
          technicalData: { type: "hop", alphaAcidPctTypical: 15, hopForm: "cryo" }
        })
      ]
    });

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({})
    }));

    expect(html).toContain("гранулы T-90");
    expect(html).toContain("крио");
    expect(html).not.toContain(">standard<");
    expect(html).not.toContain(">cryo<");
  });

  it("shows usage badges near the name only when inventory/recipe counts are positive", async () => {
    setHubSection("hops", {
      items: [
        buildCatalogItem({ id: "used", inventoryUsageCount: 2, recipeUsageCount: 3 }),
        buildCatalogItem({ id: "unused", inventoryUsageCount: 0, recipeUsageCount: 0 })
      ]
    });

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({})
    }));

    // Разметка рендерится дважды (desktop-таблица + mobile-карточки, переключение через CSS) —
    // бейдж «использован» должен встретиться по разу в каждой, «не использован» — ни разу.
    expect(html.match(/На складе/g) ?? []).toHaveLength(2);
    expect(html.match(/В рецептах 3/g) ?? []).toHaveLength(2);
  });

  it("shows a malt subtype badge, a color swatch and full parameter labels", async () => {
    setHubSection("malts", {
      items: [
        buildCatalogItem({
          id: "malt-1",
          type: "malt",
          category: "fermentable",
          subtype: "malt",
          primaryLabelRu: "Пилснер солод",
          technicalData: { type: "malt", extractPctDryBasis: 80, colorEbcMin: 3, colorEbcMax: 4 },
          fermentableExtractYieldPct: 80,
          fermentableColorLovibond: 2
        })
      ]
    });

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({})
    }));

    expect(html).toContain("Солод");
    expect(html).toContain("Экстракт 80%");
    expect(html).not.toContain("Экст-ть");
    expect(html).toContain("linear-gradient(180deg");
  });

  it("translates yeast flocculation and attenuation and shows the yeast-form badge near the name", async () => {
    setHubSection("yeast", {
      items: [
        buildCatalogItem({
          id: "yeast-1",
          type: "yeast",
          category: "yeast",
          subtype: "yeast",
          primaryLabelRu: "US-05",
          technicalData: { type: "yeast", attenuationPctTypical: 78, flocculation: "very high", form: "dry" },
          yeastAttenuationPct: 78,
          yeastForm: "dry"
        })
      ]
    });

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({})
    }));

    expect(html).toContain("Аттенюация 78%");
    expect(html).toContain("Флокуляция очень высокая");
    expect(html).toContain("сухие");
    expect(html).not.toContain("Атт.");
  });

  it("carries the consumable subtype into parameters now that the Тип column is gone", async () => {
    setHubSection("consumables", {
      items: [
        buildCatalogItem({
          id: "consumable-1",
          type: "consumable",
          category: "consumable",
          subtype: "sanitizer",
          primaryLabelRu: "Star San",
          hopForm: null,
          technicalData: { type: "consumable", commonForms: ["liquid"] },
          unitPreferred: "ml"
        })
      ]
    });

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({})
    }));

    expect(html).toContain("санитайзер");
  });

  it("hides catalog hub sections with zero total", async () => {
    setHubSection("hops", { items: [buildCatalogItem()] });
    // Остальные секции остаются total=0 (дефолт beforeEach) — не должны рендериться.

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({})
    }));

    expect(html).toContain(">Хмель<");
    expect(html).not.toContain(">Солод<");
    expect(html).not.toContain(">Дрожжи<");
    expect(html).not.toContain(">Расходники<");
  });

  it("links the hub section header to the matching category landing with the full section total", async () => {
    setHubSection("hops", { items: [buildCatalogItem()], total: 5 });

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({})
    }));

    expect(html).toContain('href="/catalog/hops"');
    expect(html).toContain("Все 5");
  });

  it("keeps view=mine in the hub section 'Все N' link", async () => {
    setHubSection("hops", { items: [buildCatalogItem()], total: 5 });

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({ view: "mine" })
    }));

    expect(html).toContain('href="/catalog/hops?view=mine"');
  });

  it("groups hub sections by search match and links to the full in-section results", async () => {
    setHubSection("hops", { items: [buildCatalogItem()], total: 12 });
    // Остальные секции остаются total=0 — не должны попасть в выдачу поиска.

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({ q: "citra" })
    }));

    expect(html).toContain(">Хмель<");
    expect(html).not.toContain(">Солод<");
    expect(html).toContain("Все 12 в разделе");
    expect(html).toContain('href="/catalog/hops?q=citra"');
  });

  it("shows the empty state when a hub-wide query matches nothing", async () => {
    // Все секции остаются total=0 (дефолт beforeEach).
    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({ q: "zzz-no-match" })
    }));

    expect(html).toContain("По текущим условиям ничего не найдено");
    expect(html).toContain("Сбросить поиск");
  });

  it("renders an ItemList JSON-LD on the hub when there is no search query and a section has items", async () => {
    setHubSection("hops", { items: [buildCatalogItem()], total: 5 });

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({})
    }));

    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain("ItemList");
  });

  it("omits the hub JSON-LD when a search query is active", async () => {
    setHubSection("hops", { items: [buildCatalogItem()], total: 5 });

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({ q: "citra" })
    }));

    expect(html).not.toContain('type="application/ld+json"');
  });

  it("omits the hub JSON-LD on the 'Мои' (view=mine) tab", async () => {
    setHubSection("hops", { items: [buildCatalogItem()], total: 5 });

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({ view: "mine" })
    }));

    expect(html).not.toContain('type="application/ld+json"');
  });

  it("shows a fallback line on the landing linking to other catalog sections when local matches exist", async () => {
    const hopsLanding = catalogCategoryLandings.find((landing) => landing.slug === "hops")!;
    mockState.listResult = {
      ...mockState.listResult,
      items: [buildCatalogItem()],
      total: 1,
      facets: {
        catalogCount: 1,
        customCount: 0,
        byCategory: {
          fermentable: 4,
          hop: 1,
          yeast: 0,
          consumable: 0,
          water_treatment: 0
        },
        byFermentableSubtype: { malt: 0, fermentable: 0 }
      }
    };

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({ q: "citra" }),
      landing: hopsLanding
    }));

    // otherCount = sum(byCategory) - byCategory.hop = (4+1) - 1 = 4
    expect(html).toContain("Ещё 4 совпадения в других разделах");
    expect(html).toContain('href="/catalog?q=citra"');
  });

  it("shows a fallback button in the landing empty state when there are no local matches", async () => {
    const maltsLanding = catalogCategoryLandings.find((landing) => landing.slug === "malts")!;
    mockState.listResult = {
      ...mockState.listResult,
      items: [],
      total: 0,
      facets: {
        catalogCount: 0,
        customCount: 0,
        byCategory: {
          fermentable: 3,
          hop: 2,
          yeast: 0,
          consumable: 0,
          water_treatment: 0
        },
        byFermentableSubtype: { malt: 0, fermentable: 3 }
      }
    };

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({ q: "zzz" }),
      landing: maltsLanding
    }));

    // otherCount = sum(byCategory) - byFermentableSubtype.malt = (3+2) - 0 = 5
    expect(html).toContain("Показать 5 совпадений в каталоге");
    expect(html).toContain('href="/catalog?q=zzz"');
  });

  it("shows a fallback line on the fermentables landing using the fermentable-subtype count (not the combined fermentable category count)", async () => {
    const fermentablesLanding = catalogCategoryLandings.find((landing) => landing.slug === "fermentables")!;
    mockState.listResult = {
      ...mockState.listResult,
      items: [buildCatalogItem({ category: "fermentable", subtype: "fermentable" })],
      total: 1,
      facets: {
        catalogCount: 1,
        customCount: 0,
        byCategory: {
          fermentable: 5,
          hop: 2,
          yeast: 0,
          consumable: 0,
          water_treatment: 0
        },
        byFermentableSubtype: { malt: 3, fermentable: 2 }
      }
    };

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({ q: "malt-extract" }),
      landing: fermentablesLanding
    }));

    // otherCount = sum(byCategory) - byFermentableSubtype.fermentable = (5+2) - 2 = 5.
    // Если бы fermentables-лендинг ошибочно попал в общую ветку
    // (sum(byCategory) - byCategory.fermentable), вышло бы 7-5=2 — неверно,
    // т.к. byCategory.fermentable объединяет malt- и fermentable-подтипы разом.
    expect(html).toContain("Ещё 5 совпадений в других разделах");
    expect(html).toContain('href="/catalog?q=malt-extract"');
  });

  it("shows a 'В архиве' badge next to the Системный badge for an archived system ingredient", async () => {
    mockState.detailItem = buildCatalogItem({ isActive: false, status: "archived" });

    const html = renderToStaticMarkup(await IngredientDetailPage({
      params: Promise.resolve({ source: "system", id: "catalog-hop-1" })
    }));

    expect(html).toContain("В архиве");
    expect(html).toContain("Системный");
  });

  it("does not show the 'В архиве' badge for an active system ingredient", async () => {
    mockState.detailItem = buildCatalogItem({ isActive: true, status: "active" });

    const html = renderToStaticMarkup(await IngredientDetailPage({
      params: Promise.resolve({ source: "system", id: "catalog-hop-1" })
    }));

    expect(html).not.toContain("В архиве");
  });

  it("wraps the breadcrumb trail in a labeled nav/ol with aria-current and renders a BreadcrumbList JSON-LD", async () => {
    mockState.detailItem = buildCatalogItem();

    const html = renderToStaticMarkup(await IngredientDetailPage({
      params: Promise.resolve({ source: "system", id: "catalog-hop-1" })
    }));

    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("BreadcrumbList");
  });
});
