import { describe, expect, it } from "vitest";

import { resolveBrewCompletionRatingSlug } from "../features/brew-batches/completion";
import { buildLabelSlots } from "../features/labels/slots";
import {
  buildAdminRecipesHref,
  parseAdminRecipesQuery,
  resolveAdminRecipeStatus,
  formatAdminRecipeRating,
  type AdminRecipesQuery
} from "../features/recipes/admin-page-model";
import type { RecipeDetailDto } from "../features/recipes/contracts";
import { isRecipeHidden, isRecipePubliclyVisible } from "../features/recipes/visibility";

const HIDDEN_AT = new Date("2026-07-12T10:00:00.000Z");

describe("features/recipes/visibility — правило публичной видимости", () => {
  it("виден публично только опубликованный и не скрытый рецепт", () => {
    expect(isRecipePubliclyVisible({ publicationState: "published", hiddenAt: null })).toBe(true);
    expect(isRecipePubliclyVisible({ publicationState: "published", hiddenAt: HIDDEN_AT })).toBe(false);
    expect(isRecipePubliclyVisible({ publicationState: "private", hiddenAt: null })).toBe(false);
    expect(isRecipePubliclyVisible({ publicationState: "draft", hiddenAt: null })).toBe(false);
  });

  it("скрытие ортогонально публикации: скрыть можно и черновик", () => {
    expect(isRecipeHidden({ hiddenAt: HIDDEN_AT })).toBe(true);
    expect(isRecipeHidden({ hiddenAt: null })).toBe(false);
    expect(isRecipePubliclyVisible({ publicationState: "draft", hiddenAt: HIDDEN_AT })).toBe(false);
  });
});

const labelRecipe = {
  id: "r1",
  title: "Тестовый эль",
  slug: "testovyy-el",
  styleId: null,
  publicationState: "published",
  hiddenAt: null,
  abv: 5,
  ibu: 30,
  color: 6,
  og: 1.048,
  fg: 1.011,
  authorDisplayName: "Артём",
  ingredients: []
} as unknown as RecipeDetailDto;

describe("наклейки — QR скрытого рецепта", () => {
  it("у скрытого рецепта QR не печатается вовсе (страница пива закрыта)", () => {
    const hidden = { ...labelRecipe, hiddenAt: HIDDEN_AT } as RecipeDetailDto;

    expect(buildLabelSlots({ recipe: hidden, baseUrl: "https://nb.example" }).qrUrl).toBeNull();
    // Даже share-ключ не воскрешает QR: /beer/<slug> у скрытого закрыт и по ключу.
    expect(buildLabelSlots({ recipe: hidden, baseUrl: "https://nb.example", shareKey: "abc123" }).qrUrl).toBeNull();
  });

  it("у обычного опубликованного QR на месте (контроль)", () => {
    expect(buildLabelSlots({ recipe: labelRecipe, baseUrl: "https://nb.example" }).qrUrl).toBe(
      "https://nb.example/beer/testovyy-el"
    );
  });
});

describe("итог варки — оценка исходного рецепта", () => {
  const candidate = {
    authorId: "author-1",
    publicationState: "published",
    hiddenAt: null as Date | null,
    slug: "foreign-recipe"
  };

  it("скрытый рецепт нельзя оценить из итога варки", () => {
    expect(
      resolveBrewCompletionRatingSlug("completed", "brewer-1", { ...candidate, hiddenAt: HIDDEN_AT })
    ).toBeNull();
  });

  it("обычный чужой published — форма оценки на месте (контроль)", () => {
    expect(resolveBrewCompletionRatingSlug("completed", "brewer-1", candidate)).toBe("foreign-recipe");
  });
});

describe("features/recipes/admin-page-model", () => {
  it("скрытие перекрывает состояние публикации в статусе строки", () => {
    expect(resolveAdminRecipeStatus({ publicationState: "published", hiddenAt: HIDDEN_AT })).toBe("hidden");
    expect(resolveAdminRecipeStatus({ publicationState: "draft", hiddenAt: HIDDEN_AT })).toBe("hidden");
    expect(resolveAdminRecipeStatus({ publicationState: "published", hiddenAt: null })).toBe("published");
    expect(resolveAdminRecipeStatus({ publicationState: "private", hiddenAt: null })).toBe("private");
    expect(resolveAdminRecipeStatus({ publicationState: "draft", hiddenAt: null })).toBe("draft");
  });

  it("мусор в query-параметрах не роняет список", () => {
    expect(parseAdminRecipesQuery({ status: "nope", sort: "nope", page: "-3", pageSize: "999" })).toEqual({
      q: "",
      status: "all",
      sort: "updated",
      page: 1,
      pageSize: 20
    });
  });

  it("разбирает реальные параметры", () => {
    expect(parseAdminRecipesQuery({ q: "  портер ", status: "hidden", sort: "rating", page: "2", pageSize: "50" })).toEqual({
      q: "портер",
      status: "hidden",
      sort: "rating",
      page: 2,
      pageSize: 50
    });
  });

  it("смена статуса/сорта возвращает на первую страницу, остальные параметры сохраняются", () => {
    const query: AdminRecipesQuery = { q: "портер", status: "all", sort: "rating", page: 4, pageSize: 20 };

    expect(buildAdminRecipesHref(query, { status: "hidden" })).toBe("/admin/recipes?q=%D0%BF%D0%BE%D1%80%D1%82%D0%B5%D1%80&status=hidden&sort=rating");
    expect(buildAdminRecipesHref(query, { page: 3 })).toContain("page=3");
    expect(buildAdminRecipesHref({ q: "", status: "all", sort: "updated", page: 1, pageSize: 20 })).toBe("/admin/recipes");
  });

  it("рейтинг без оценок — прочерк", () => {
    expect(formatAdminRecipeRating({ ratingAvg: 4.62, ratingCount: 12 })).toBe("4.6 (12)");
    expect(formatAdminRecipeRating({ ratingAvg: null, ratingCount: 0 })).toBe("—");
  });
});
