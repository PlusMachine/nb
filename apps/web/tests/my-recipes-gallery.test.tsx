import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OwnerRecipeCardDto, RecipeMatchDto } from "../features/recipes/contracts";

// Карточки тянут серверный экшен удаления — мокаем, чтобы не тащить db-слой в тест.
vi.mock("../app/(app)/app/recipes/actions", () => ({
  deleteRecipeAction: vi.fn(async () => ({ ok: true, message: "ok" }))
}));

import { brewabilityRank, sortOwnerRecipeCards } from "../components/recipes/my-recipes-gallery";
import { MyRecipesGallery } from "../components/recipes/my-recipes-gallery";

const baseRecipe: OwnerRecipeCardDto = {
  id: "r-1",
  slug: "base-recipe",
  title: "Base Recipe",
  publicationState: "draft",
  hiddenAt: null,
  hiddenReason: null,
  versionNumber: 1,
  versionCount: 1,
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  styleName: null,
  styleCode: null,
  styleHref: null,
  og: 1.048,
  abv: 5,
  ibu: 28,
  colorSrm: 7,
  heroImage: null,
  styleImageUrl: null,
  styleFit: null,
  brewBatchCount: 0
};

const baseMatch: RecipeMatchDto = {
  recipeId: "r-1",
  matchPercent: 100,
  label: "ready",
  totalLines: 4,
  coveredLines: 4,
  missingCount: 0,
  lines: [],
  targetBatchVolumeL: 20,
  recipeBatchVolumeL: 20,
  scaledToInventory: false,
  hasEquipmentProfile: null
};

const makeMatch = (overrides: Partial<RecipeMatchDto>): RecipeMatchDto => ({ ...baseMatch, ...overrides });

describe("brewabilityRank", () => {
  it("ready без нехватки количества → 0", () => {
    expect(brewabilityRank(makeMatch({ totalLines: 4, coveredLines: 4, missingCount: 0 }))).toBe(0);
  });

  it("ready, но не хватает количества (qtyShort) → 1", () => {
    expect(brewabilityRank(makeMatch({ totalLines: 4, coveredLines: 2, missingCount: 0 }))).toBe(1);
  });

  it("almost (1-2 позиции, покрытие типов ≥70%) → 2", () => {
    expect(brewabilityRank(makeMatch({ totalLines: 4, coveredLines: 3, missingCount: 1 }))).toBe(2);
  });

  it("нет матча (ещё не загружен) → 3", () => {
    expect(brewabilityRank(null)).toBe(3);
  });

  it("матч загружен, но далеко от готовности (не hidden по покрытию) → 3", () => {
    expect(brewabilityRank(makeMatch({ totalLines: 4, coveredLines: 1, missingCount: 3 }))).toBe(3);
  });

  it("пустой состав (totalLines<=0) → 4, ниже всех прочих рангов", () => {
    expect(brewabilityRank(makeMatch({ totalLines: 0, coveredLines: 0, missingCount: 0 }))).toBe(4);
  });

  it("ранги упорядочены: ready < qtyShort < almost < нет матча/далеко < пустой состав", () => {
    const ready = brewabilityRank(makeMatch({ totalLines: 4, coveredLines: 4, missingCount: 0 }));
    const qtyShort = brewabilityRank(makeMatch({ totalLines: 4, coveredLines: 2, missingCount: 0 }));
    const almost = brewabilityRank(makeMatch({ totalLines: 4, coveredLines: 3, missingCount: 1 }));
    const far = brewabilityRank(makeMatch({ totalLines: 4, coveredLines: 1, missingCount: 3 }));
    const empty = brewabilityRank(makeMatch({ totalLines: 0, coveredLines: 0, missingCount: 0 }));

    expect(ready).toBeLessThan(qtyShort);
    expect(qtyShort).toBeLessThan(almost);
    expect(almost).toBeLessThan(far);
    expect(far).toBeLessThan(empty);
  });
});

describe("sortOwnerRecipeCards", () => {
  const makeCard = (id: string, updatedAt: string): OwnerRecipeCardDto => ({
    ...baseRecipe,
    id,
    slug: id,
    title: id,
    updatedAt: new Date(updatedAt)
  });

  it('сортирует "brewable" по рангу готовности: ready → ready+qtyShort → almost → нет матча → пустой состав', () => {
    const ready = makeCard("ready", "2026-01-01T00:00:00.000Z");
    const qtyShort = makeCard("qty-short", "2026-01-01T00:00:00.000Z");
    const almost = makeCard("almost", "2026-01-01T00:00:00.000Z");
    const noMatch = makeCard("no-match", "2026-01-01T00:00:00.000Z");
    const empty = makeCard("empty", "2026-01-01T00:00:00.000Z");

    const matches: Record<string, RecipeMatchDto | null> = {
      ready: makeMatch({ totalLines: 4, coveredLines: 4, missingCount: 0 }),
      "qty-short": makeMatch({ totalLines: 4, coveredLines: 2, missingCount: 0 }),
      almost: makeMatch({ totalLines: 4, coveredLines: 3, missingCount: 1 }),
      "no-match": null,
      empty: makeMatch({ totalLines: 0, coveredLines: 0, missingCount: 0 })
    };

    // Специально перемешан, чтобы проверить, что функция сама расставляет порядок.
    const shuffled = [empty, noMatch, almost, qtyShort, ready];
    const sorted = sortOwnerRecipeCards(shuffled, "brewable", (id) => matches[id] ?? null);

    expect(sorted.map((card) => card.id)).toEqual(["ready", "qty-short", "almost", "no-match", "empty"]);
  });

  it('при равном ранге "brewable" сортирует вторично по updatedAt (сначала недавние)', () => {
    const older = makeCard("older", "2026-01-01T00:00:00.000Z");
    const newer = makeCard("newer", "2026-01-05T00:00:00.000Z");

    const sorted = sortOwnerRecipeCards([older, newer], "brewable", () => null);

    expect(sorted.map((card) => card.id)).toEqual(["newer", "older"]);
  });

  it("не мутирует исходный массив", () => {
    const cards = [makeCard("a", "2026-01-01T00:00:00.000Z"), makeCard("b", "2026-01-05T00:00:00.000Z")];
    const original = [...cards];

    sortOwnerRecipeCards(cards, "updated", () => null);

    expect(cards).toEqual(original);
  });
});

describe("MyRecipesGallery", () => {
  it("initialQuery фильтрует список при первом рендере", () => {
    const recipes: OwnerRecipeCardDto[] = [
      { ...baseRecipe, id: "r-1", slug: "ipa-deluxe", title: "IPA Deluxe" },
      { ...baseRecipe, id: "r-2", slug: "stout-night", title: "Stout Night" }
    ];
    const html = renderToStaticMarkup(
      <MyRecipesGallery recipes={recipes} preferredGravityUnit="plato" initialQuery="ipa" />
    );

    expect(html).toContain("IPA Deluxe");
    expect(html).not.toContain("Stout Night");
  });

  it("initialStatus фильтрует список при первом рендере", () => {
    const recipes: OwnerRecipeCardDto[] = [
      { ...baseRecipe, id: "r-1", slug: "public-one", title: "Public One", publicationState: "published" },
      { ...baseRecipe, id: "r-2", slug: "draft-one", title: "Draft One", publicationState: "draft" }
    ];
    const html = renderToStaticMarkup(
      <MyRecipesGallery recipes={recipes} preferredGravityUnit="plato" initialStatus="published" />
    );

    expect(html).toContain("Public One");
    expect(html).not.toContain("Draft One");
  });

  it("в brew-режиме статус-фильтр скрыт, а в manage — показан", () => {
    // Тулбар (и с ним фильтр статуса) появляется только выше TOOLBAR_THRESHOLD.
    const recipes: OwnerRecipeCardDto[] = Array.from({ length: 7 }, (_, index) => ({
      ...baseRecipe,
      id: `r-${index}`,
      slug: `recipe-${index}`,
      title: `Recipe ${index}`
    }));

    const manageHtml = renderToStaticMarkup(
      <MyRecipesGallery recipes={recipes} preferredGravityUnit="plato" intent="manage" />
    );
    const brewHtml = renderToStaticMarkup(
      <MyRecipesGallery recipes={recipes} preferredGravityUnit="plato" intent="brew" />
    );

    expect(manageHtml).toContain('aria-label="Фильтр по статусу"');
    expect(brewHtml).not.toContain('aria-label="Фильтр по статусу"');
  });

  it("тулбар виден при рецептах ≤ порога, если initialQuery недефолтный (иначе некуда сбросить фильтр)", () => {
    const recipes: OwnerRecipeCardDto[] = [
      { ...baseRecipe, id: "r-1", slug: "one", title: "One" },
      { ...baseRecipe, id: "r-2", slug: "two", title: "Two" }
    ];

    const html = renderToStaticMarkup(
      <MyRecipesGallery recipes={recipes} preferredGravityUnit="plato" initialQuery="one" />
    );

    expect(html).toContain('id="my-recipes-search"');
  });

  it("больше 12 рецептов → первая порция из 12 карточек и кнопка «Показать ещё»", () => {
    const recipes: OwnerRecipeCardDto[] = Array.from({ length: 15 }, (_, index) => ({
      ...baseRecipe,
      id: `r-${index}`,
      slug: `recipe-${index}`,
      title: `Recipe ${index}`
    }));

    const html = renderToStaticMarkup(
      <MyRecipesGallery recipes={recipes} preferredGravityUnit="plato" />
    );

    for (let index = 0; index < 12; index += 1) {
      expect(html).toContain(`Recipe ${index}`);
    }
    for (let index = 12; index < 15; index += 1) {
      expect(html).not.toContain(`Recipe ${index}`);
    }
    expect(html).toContain("Показать ещё");
  });

  it("не больше 12 рецептов → кнопка «Показать ещё» не рендерится", () => {
    const recipes: OwnerRecipeCardDto[] = Array.from({ length: 12 }, (_, index) => ({
      ...baseRecipe,
      id: `r-${index}`,
      slug: `recipe-${index}`,
      title: `Recipe ${index}`
    }));

    const html = renderToStaticMarkup(
      <MyRecipesGallery recipes={recipes} preferredGravityUnit="plato" />
    );

    expect(html).not.toContain("Показать ещё");
  });

  it("«Ёлки-палки» находится по запросу «елки» (ё≠е нормализуется)", () => {
    const recipes: OwnerRecipeCardDto[] = [
      { ...baseRecipe, id: "r-1", slug: "yolki-palki", title: "Ёлки-палки" },
      { ...baseRecipe, id: "r-2", slug: "other", title: "Другой рецепт" }
    ];

    const html = renderToStaticMarkup(
      <MyRecipesGallery recipes={recipes} preferredGravityUnit="plato" initialQuery="елки" />
    );

    expect(html).toContain("Ёлки-палки");
    expect(html).not.toContain("Другой рецепт");
  });

  it("рецепт со стилем «Американский стаут» находится по «cnfen» — раскладочный фолбэк от «стаут»", () => {
    const recipes: OwnerRecipeCardDto[] = [
      { ...baseRecipe, id: "r-1", slug: "stout", title: "Тёмное варево", styleName: "Американский стаут" },
      { ...baseRecipe, id: "r-2", slug: "other", title: "Светлый лагер", styleName: "Пилснер" }
    ];

    const html = renderToStaticMarkup(
      <MyRecipesGallery recipes={recipes} preferredGravityUnit="plato" initialQuery="cnfen" />
    );

    expect(html).toContain("Тёмное варево");
    expect(html).not.toContain("Светлый лагер");
  });

  it("рецепт находится по коду стиля BJCP (например «21A»)", () => {
    const recipes: OwnerRecipeCardDto[] = [
      { ...baseRecipe, id: "r-1", slug: "ipa", title: "Нейтральное название", styleCode: "21A" },
      { ...baseRecipe, id: "r-2", slug: "other", title: "Другой рецепт", styleCode: "16B" }
    ];

    const html = renderToStaticMarkup(
      <MyRecipesGallery recipes={recipes} preferredGravityUnit="plato" initialQuery="21A" />
    );

    expect(html).toContain("Нейтральное название");
    expect(html).not.toContain("Другой рецепт");
  });

  it("мусорный запрос «qqqzzz» даёт пустой список", () => {
    const recipes: OwnerRecipeCardDto[] = [
      { ...baseRecipe, id: "r-1", slug: "one", title: "Один рецепт" },
      { ...baseRecipe, id: "r-2", slug: "two", title: "Второй рецепт" }
    ];

    const html = renderToStaticMarkup(
      <MyRecipesGallery recipes={recipes} preferredGravityUnit="plato" initialQuery="qqqzzz" />
    );

    expect(html).not.toContain("Один рецепт");
    expect(html).not.toContain("Второй рецепт");
    expect(html).toContain("Ничего не найдено");
  });

  it("рецепт «Session-IPA» находится по запросу «-» — легаси литеральный фолбэк на сырую строку", () => {
    // Запрос целиком из пунктуации нормализуется в пустую строку (normalizeSearchText
    // вырезает «-»), buildSearchQueryVariants даёт [] — без фолбэка фильтр молча
    // отдавал бы 0 совпадений вместо литерального substring-поиска по «-».
    const recipes: OwnerRecipeCardDto[] = [
      { ...baseRecipe, id: "r-1", slug: "session-ipa", title: "Session-IPA" },
      { ...baseRecipe, id: "r-2", slug: "other", title: "Другой рецепт" }
    ];

    const html = renderToStaticMarkup(
      <MyRecipesGallery recipes={recipes} preferredGravityUnit="plato" initialQuery="-" />
    );

    expect(html).toContain("Session-IPA");
    expect(html).not.toContain("Другой рецепт");
  });
});
