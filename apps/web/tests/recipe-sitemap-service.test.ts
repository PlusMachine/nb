import { beforeEach, describe, expect, it, vi } from "vitest";

// Изолированный мок @nb/db только под listRecipeSitemapEntries: до трёх select-выборок
// в фиксированном порядке — 1) кандидаты published-рецептов, 2) батч подтверждённых
// варок по id (4-й сигнал качества, resolveCompletedBrewCountsByRecipeId), 3) батч
// clone-источников по id (только если есть clonedFromRecipeId). Не переиспользуем
// общий мок recipe-service.test.ts — тот заточен под query.recipes.findFirst/findMany
// (createRecipe/updateRecipe), а не под последовательность db.select(...).
vi.mock("server-only", () => ({}));

const { mockState } = vi.hoisted(() => ({
  mockState: {
    candidateRows: [] as Array<{
      id: string;
      slug: string;
      updatedAt: Date;
      title: string;
      description: string | null;
      heroImageId: string | null;
      ratingCount: number;
      clonedFromRecipeId: string | null;
    }>,
    brewCountRows: [] as Array<{ recipeId: string; completedCount: number }>,
    cloneSourceRows: [] as Array<{ id: string; title: string; publicationState: string }>,
    selectCallCount: 0
  }
}));

vi.mock("@nb/db", () => {
  const tableToken = (name: string) =>
    new Proxy({} as Record<string, string>, {
      get: (_target, prop) => `${name}.${String(prop)}`
    });

  const makeBuilder = (rows: unknown[]) => {
    const builder: Record<string, unknown> = {
      from: () => builder,
      where: () => builder,
      groupBy: () => builder,
      then: (onFulfilled: (rows: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(rows).then(onFulfilled, onRejected)
    };
    return builder;
  };

  const db = {
    // 1й вызов select(...) в listRecipeSitemapEntries — кандидаты (published-рецепты),
    // 2й — батч подтверждённых варок по id кандидатов (пропускается только если
    // кандидатов нет вовсе), 3й (если есть clonedFromRecipeId) — батч
    // clone-источников по id.
    select: (_projection: Record<string, unknown>) => {
      mockState.selectCallCount += 1;
      const rows = mockState.selectCallCount === 1
        ? mockState.candidateRows
        : mockState.selectCallCount === 2
          ? mockState.brewCountRows
          : mockState.cloneSourceRows;
      return makeBuilder(rows);
    }
  };

  return {
    db,
    and: (...args: unknown[]) => args,
    eq: (...args: unknown[]) => args,
    inArray: (...args: unknown[]) => args,
    isNull: (...args: unknown[]) => args,
    count: () => "completedCount",
    recipes: tableToken("recipes"),
    brewBatches: tableToken("brewBatches")
  };
});

import { listRecipeSitemapEntries } from "../features/recipes/service";

const baseCandidate = {
  id: "recipe-1",
  slug: "rich-recipe",
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
  title: "Hazy IPA",
  description: null,
  heroImageId: null,
  ratingCount: 0,
  clonedFromRecipeId: null
};

describe("features/recipes/service — listRecipeSitemapEntries (S1/S2 фильтр sitemap)", () => {
  beforeEach(() => {
    mockState.candidateRows = [];
    mockState.brewCountRows = [];
    mockState.cloneSourceRows = [];
    mockState.selectCallCount = 0;
  });

  it("бедный рецепт (без описания/фото/оценок) — исключён из sitemap", () => {
    mockState.candidateRows = [{ ...baseCandidate }];

    return listRecipeSitemapEntries().then((entries) => {
      expect(entries).toEqual([]);
    });
  });

  it("рецепт с фото — попадает в sitemap", () => {
    mockState.candidateRows = [{ ...baseCandidate, heroImageId: "img-1" }];

    return listRecipeSitemapEntries().then((entries) => {
      expect(entries).toEqual([{ slug: "rich-recipe", updatedAt: baseCandidate.updatedAt }]);
    });
  });

  it("рецепт с оценкой — попадает в sitemap", () => {
    mockState.candidateRows = [{ ...baseCandidate, ratingCount: 2 }];

    return listRecipeSitemapEntries().then((entries) => {
      expect(entries).toEqual([{ slug: "rich-recipe", updatedAt: baseCandidate.updatedAt }]);
    });
  });

  it("рецепт с описанием ≥150 символов — попадает в sitemap", () => {
    mockState.candidateRows = [{ ...baseCandidate, description: "а".repeat(150) }];

    return listRecipeSitemapEntries().then((entries) => {
      expect(entries).toEqual([{ slug: "rich-recipe", updatedAt: baseCandidate.updatedAt }]);
    });
  });

  it("рецепт без описания/фото/оценок, но с подтверждённой варкой — попадает в sitemap (4-й сигнал качества)", () => {
    mockState.candidateRows = [{ ...baseCandidate }];
    mockState.brewCountRows = [{ recipeId: baseCandidate.id, completedCount: 1 }];

    return listRecipeSitemapEntries().then((entries) => {
      expect(entries).toEqual([{ slug: "rich-recipe", updatedAt: baseCandidate.updatedAt }]);
    });
  });

  it("смешанная выборка — только прошедшие порог остаются, порядок сохраняется", () => {
    mockState.candidateRows = [
      { ...baseCandidate, slug: "poor", heroImageId: null, ratingCount: 0, description: null },
      { ...baseCandidate, slug: "rich", heroImageId: "img-2" }
    ];

    return listRecipeSitemapEntries().then((entries) => {
      expect(entries.map((entry) => entry.slug)).toEqual(["rich"]);
    });
  });

  it("клон без переименования, источник опубликован — исключён из sitemap (canonical на источник)", () => {
    mockState.candidateRows = [
      { ...baseCandidate, slug: "clone", heroImageId: "img-clone", clonedFromRecipeId: "src-1", title: "Hazy IPA" }
    ];
    mockState.cloneSourceRows = [{ id: "src-1", title: "Hazy IPA", publicationState: "published" }];

    return listRecipeSitemapEntries().then((entries) => {
      expect(entries).toEqual([]);
    });
  });

  it("переименованный клон — остаётся в sitemap (если сам проходит порог качества)", () => {
    mockState.candidateRows = [
      {
        ...baseCandidate,
        slug: "clone-renamed",
        heroImageId: "img-clone",
        clonedFromRecipeId: "src-1",
        title: "Моя версия Hazy IPA"
      }
    ];
    mockState.cloneSourceRows = [{ id: "src-1", title: "Hazy IPA", publicationState: "published" }];

    return listRecipeSitemapEntries().then((entries) => {
      expect(entries.map((entry) => entry.slug)).toEqual(["clone-renamed"]);
    });
  });

  it("клон без переименования, но источник не опубликован — остаётся в sitemap (если проходит порог)", () => {
    mockState.candidateRows = [
      { ...baseCandidate, slug: "clone-orphan", heroImageId: "img-clone", clonedFromRecipeId: "src-1", title: "Hazy IPA" }
    ];
    mockState.cloneSourceRows = [{ id: "src-1", title: "Hazy IPA", publicationState: "draft" }];

    return listRecipeSitemapEntries().then((entries) => {
      expect(entries.map((entry) => entry.slug)).toEqual(["clone-orphan"]);
    });
  });
});
