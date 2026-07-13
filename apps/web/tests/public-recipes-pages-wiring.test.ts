import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultRecipeProcessMeta, type RecipeDetailDto } from "../features/recipes/contracts";

// React 18 (используемый в vitest/node) не экспортирует `cache` — это API
// React-канала, который Next.js полифиллит собственной сборкой React только
// внутри своего рантайма. [slug]/page.tsx использует `cache` для дедупа
// generateMetadata/страницы — под простым node-рендером в тестах его нужно
// подменить identity-обёрткой (см. тот же приём в articles-detail-page-wiring.test.ts).
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: actual.cache ?? (<T extends (...args: any[]) => any>(fn: T) => fn)
  };
});

const publicRecipe: RecipeDetailDto = {
  id: "r-public",
  authorId: "u-1",
  recipeFamilyId: "rf-1",
  versionNumber: 1,
  versionCount: 1,
  publicationState: "published",
  hiddenAt: null,
  hiddenReason: null,
  title: "Public IPA",
  slug: "public-ipa",
  styleId: "21A", // American IPA — реальный BJCP-фикстур id (без БД, из @nb/brewing-core)
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 75,
  boilTimeMinutes: 60,
  og: 1.06,
  fg: 1.012,
  abv: 6.2,
  ibu: 45,
  color: 9.5,
  description: "Public desc",
  authorNotes: "Public notes",
  authorDisplayName: "Иван Пивовар",
  processMeta: defaultRecipeProcessMeta,
  heroImageId: "img-42",
  rating: { average: 4.5, count: 12 },
  versions: [{ id: "r-1", versionNumber: 1, updatedAt: new Date("2026-01-02T00:00:00.000Z") }],
  completedBrewCount: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ingredients: [
    {
      id: "ri-1",
      recipeId: "r-public",
      persistentKey: "00000000-0000-4000-8000-000000000021",
      displayOrder: 0,
      ingredientCatalogItemId: "cat-1",
      userCustomIngredientId: null,
      type: "hop",
      amountEnteredQuantity: 50,
      amountEnteredUnit: "g",
      amountNormalizedQuantity: 50,
      amountNormalizedUnit: "g",
      stage: "boil",
      timeOffset: 20,
      stepMeta: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    }
  ]
};

// Детальный документ НЕ читает сессию/cookie (персональная оценка тянется клиентом
// после гидрации) → нет мока `lib/auth`: если бы роут читал cookie, рендер упал бы
// «cookies outside request scope». Успешный рендер здесь и есть guard кэшируемости.
const mocks = vi.hoisted(() => ({
  getPublicRecipeBySlug: vi.fn(async () => publicRecipe),
  listPublicRecipesForStyle: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  })
}));

vi.mock("../features/recipes/service", () => ({
  getPublicRecipeBySlug: mocks.getPublicRecipeBySlug,
  listPublicRecipesForStyle: mocks.listPublicRecipesForStyle
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));

describe("public recipe pages wiring", () => {
  beforeEach(() => {
    mocks.getPublicRecipeBySlug.mockReset();
    mocks.listPublicRecipesForStyle.mockReset();

    mocks.getPublicRecipeBySlug.mockResolvedValue(publicRecipe);
    mocks.listPublicRecipesForStyle.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 5 });

    mocks.notFound.mockClear();
    mocks.redirect.mockClear();
  });

  it("uses getPublicRecipeBySlug and renders read-only recipe", async () => {
    const { default: PublicRecipeRoute } = await import("../app/(public)/recipes/[slug]/page");
    const view = await PublicRecipeRoute({ params: Promise.resolve({ slug: "public-ipa" }) });

    expect(mocks.getPublicRecipeBySlug).toHaveBeenCalledWith("public-ipa");
    expect(view).toBeTruthy();
  }, 60000);

  it("returns notFound behavior for inaccessible slug recipe", async () => {
    mocks.getPublicRecipeBySlug.mockImplementationOnce(async () => {
      throw new Error("FORBIDDEN");
    });
    const { default: PublicRecipeRoute } = await import("../app/(public)/recipes/[slug]/page");

    await expect(PublicRecipeRoute({ params: Promise.resolve({ slug: "secret" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  }, 60000);

  it("builds metadata from slug-based public recipe: canonical, title, OG-изображение", async () => {
    const { generateMetadata } = await import("../app/(public)/recipes/[slug]/page");
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "public-ipa" }) });

    expect(mocks.getPublicRecipeBySlug).toHaveBeenCalledWith("public-ipa");
    expect(metadata.alternates?.canonical).toBe("/recipes/public-ipa");
    expect(metadata.title).toContain("Public IPA");
    expect(metadata.title).toContain("рецепт");
    expect(metadata.title).toContain("Американский IPA");
    expect(metadata.description).toContain("ABV");
    expect(metadata.openGraph?.images).toEqual(["/api/recipe-images/img-42/large"]);
  });

  it("вызывает notFound() прямо из generateMetadata для NOT_FOUND/FORBIDDEN (без стриминга заглушки)", async () => {
    mocks.getPublicRecipeBySlug.mockImplementationOnce(async () => {
      throw new Error("NOT_FOUND");
    });
    const { generateMetadata } = await import("../app/(public)/recipes/[slug]/page");

    await expect(generateMetadata({ params: Promise.resolve({ slug: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it("рендерит Recipe/BreadcrumbList JSON-LD с aggregateRating, когда есть рейтинг", async () => {
    const { default: PublicRecipeRoute } = await import("../app/(public)/recipes/[slug]/page");
    const view = (await PublicRecipeRoute({ params: Promise.resolve({ slug: "public-ipa" }) })) as React.ReactElement<{
      children: React.ReactElement<{ dangerouslySetInnerHTML: { __html: string } }>[];
    }>;
    const [, recipeScript, breadcrumbScript] = view.props.children;
    const recipeJsonLd = JSON.parse(recipeScript.props.dangerouslySetInnerHTML.__html);
    const breadcrumbJsonLd = JSON.parse(breadcrumbScript.props.dangerouslySetInnerHTML.__html);

    expect(recipeJsonLd["@type"]).toBe("Recipe");
    expect(recipeJsonLd.name).toBe("Public IPA");
    expect(recipeJsonLd.author).toEqual({ "@type": "Person", name: "Иван Пивовар" });
    expect(recipeJsonLd.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: 4.5, ratingCount: 12 });
    expect(breadcrumbJsonLd["@type"]).toBe("BreadcrumbList");
    expect(breadcrumbJsonLd.itemListElement).toHaveLength(3);
    expect(breadcrumbJsonLd.itemListElement[2].item).toBe("http://localhost:3000/recipes/public-ipa");
  });

  it("не добавляет aggregateRating, если у рецепта ещё нет оценок", async () => {
    mocks.getPublicRecipeBySlug.mockResolvedValue({ ...publicRecipe, rating: null });
    const { default: PublicRecipeRoute } = await import("../app/(public)/recipes/[slug]/page");
    const view = (await PublicRecipeRoute({ params: Promise.resolve({ slug: "public-ipa" }) })) as React.ReactElement<{
      children: React.ReactElement<{ dangerouslySetInnerHTML: { __html: string } }>[];
    }>;
    const [, recipeScript] = view.props.children;
    const recipeJsonLd = JSON.parse(recipeScript.props.dangerouslySetInnerHTML.__html);

    expect(recipeJsonLd.aggregateRating).toBeUndefined();
  });

  // «Похожие рецепты» (M8, P2 аудита): резолвим стиль как для metadata и зовём
  // listPublicRecipesForStyle с исключением текущего слага. try/catch — билд без
  // БД не должен падать.
  it("резолвит стиль и вызывает listPublicRecipesForStyle, исключая текущий рецепт из выдачи", async () => {
    mocks.listPublicRecipesForStyle.mockResolvedValue({
      items: [
        { slug: "public-ipa" },
        { slug: "other-ipa-1" },
        { slug: "other-ipa-2" },
        { slug: "other-ipa-3" },
        { slug: "other-ipa-4" }
      ],
      total: 5,
      page: 1,
      pageSize: 5
    });
    const { default: PublicRecipeRoute } = await import("../app/(public)/recipes/[slug]/page");
    const view = (await PublicRecipeRoute({ params: Promise.resolve({ slug: "public-ipa" }) })) as React.ReactElement<{
      children: [React.ReactElement<{ similarRecipes: { slug: string }[] }>, unknown, unknown];
    }>;
    const [publicRecipePageEl] = view.props.children;

    expect(mocks.listPublicRecipesForStyle).toHaveBeenCalledWith("21A", 5);
    expect(publicRecipePageEl.props.similarRecipes.map((item) => item.slug)).toEqual([
      "other-ipa-1",
      "other-ipa-2",
      "other-ipa-3",
      "other-ipa-4"
    ]);
  });

  it("не падает и отдаёт пустой список похожих рецептов, если listPublicRecipesForStyle бросает (БД недоступна на билде)", async () => {
    mocks.listPublicRecipesForStyle.mockRejectedValue(new Error("DB unavailable at build time"));
    const { default: PublicRecipeRoute } = await import("../app/(public)/recipes/[slug]/page");
    const view = (await PublicRecipeRoute({ params: Promise.resolve({ slug: "public-ipa" }) })) as React.ReactElement<{
      children: [React.ReactElement<{ similarRecipes: unknown[] }>, unknown, unknown];
    }>;
    const [publicRecipePageEl] = view.props.children;

    expect(publicRecipePageEl.props.similarRecipes).toEqual([]);
  });

  it("не запрашивает похожие рецепты, если у рецепта нет стиля", async () => {
    mocks.getPublicRecipeBySlug.mockResolvedValue({ ...publicRecipe, styleId: null });
    const { default: PublicRecipeRoute } = await import("../app/(public)/recipes/[slug]/page");
    const view = (await PublicRecipeRoute({ params: Promise.resolve({ slug: "public-ipa" }) })) as React.ReactElement<{
      children: [React.ReactElement<{ similarRecipes: unknown[] }>, unknown, unknown];
    }>;
    const [publicRecipePageEl] = view.props.children;

    expect(mocks.listPublicRecipesForStyle).not.toHaveBeenCalled();
    expect(publicRecipePageEl.props.similarRecipes).toEqual([]);
  });
});
