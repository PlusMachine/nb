import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OwnerRecipeCardDto } from "../features/recipes/contracts";

const ownerCard: OwnerRecipeCardDto = {
  id: "r-1",
  slug: "public-ipa",
  title: "My Pils",
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

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "u-1", email: "u1@example.com", preferredGravityUnit: "plato" })),
  listAuthorRecipeCards: vi.fn(async () => [ownerCard]),
  cloneRecipeAction: vi.fn(async () => ({ ok: true, message: "ok", recipe: { id: "r-2" } })),
  push: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  // По умолчанию — пусто (как будто cookie не пришла): readInitialView в
  // content.tsx получит `undefined` и откатится к дефолтному "grid", как и
  // раньше без мока. Конкретные тесты подставляют своё значение перед вызовом.
  myRecipesViewCookie: undefined as string | undefined
}));

vi.mock("../lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("../features/recipes/service", () => ({ listAuthorRecipeCards: mocks.listAuthorRecipeCards }));
vi.mock("../app/(app)/app/recipes/actions", () => ({
  deleteRecipeAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  cloneRecipeAction: mocks.cloneRecipeAction
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
  usePathname: vi.fn(() => "/app/recipes"),
  useRouter: vi.fn(() => ({ push: mocks.push })),
  // RecipeTabs (рендерится содержимым страницы) читает ?intent= через
  // useSearchParams — в этих тестах реальный URL не участвует, поэтому
  // пустые параметры (вне brew-режима во всех сценариях ниже).
  useSearchParams: vi.fn(() => new URLSearchParams())
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "nb_my_recipes_view" && mocks.myRecipesViewCookie != null
        ? { value: mocks.myRecipesViewCookie }
        : undefined
  }))
}));

describe("recipes pages wiring", () => {
  it("list page uses listAuthorRecipeCards", async () => {
    const { MyRecipesContent } = await import("../app/(app)/app/recipes/content");
    const view = await MyRecipesContent();
    const html = renderToStaticMarkup(view);

    expect(mocks.listAuthorRecipeCards).toHaveBeenCalledWith("u-1");
    expect(html).toContain("Рецепты");
    expect(html).toContain("My Pils");
    // Черновик/приватный статус больше не подсвечивается бейджем — только «Публичный».
    expect(html).not.toContain("Приватный");
    expect(html).toContain('href="/app/recipes/r-1/edit"');
    expect(html).not.toContain('href="/app/recipes/r-1"');
    // Меню действий (триггер рендерится сразу, содержимое — в Portal, недоступно в SSR-html).
    // Префикс, а не точное совпадение: aria-label теперь включает название рецепта
    // («Действия с рецептом «My Pils»») — см. owner-recipe-card.tsx.
    expect(html).toContain('aria-label="Действия с рецептом');
  });

  it("list page empty state scenario works", async () => {
    mocks.listAuthorRecipeCards.mockResolvedValueOnce([]);
    const { MyRecipesContent } = await import("../app/(app)/app/recipes/content");
    const view = await MyRecipesContent();
    const html = renderToStaticMarkup(view);

    expect(html).toContain("Пока нет рецептов");
  });

  it("intent=brew: честный заголовок, «К рецептам», табы видны, «Создать рецепт» скрыт, карточка ведёт в рецепт (Ф1)", async () => {
    const { MyRecipesContent } = await import("../app/(app)/app/recipes/content");
    const view = await MyRecipesContent({ searchParams: Promise.resolve({ intent: "brew" }) });
    // Рендер не должен падать даже с key-механикой галереи (задача 1 ревью).
    const html = renderToStaticMarkup(view);

    expect(html).toContain("Выберите рецепт и начните варку");
    expect(html).toContain("К рецептам");
    expect(html).not.toContain("Создать рецепт");
    // Табы (в т.ч. «Закладки») больше не прячутся в brew-режиме — единая
    // страница выбора без скрытой смены поведения (Ф1).
    expect(html).toContain("Закладки");
    // Клик по телу карточки ведёт в рецепт как в manage-режиме; варка —
    // отдельной кнопкой «Сварить» на карточке (проверяется в owner-recipe-card.test.tsx).
    expect(html).toContain('href="/app/recipes/r-1/edit"');
    expect(html).toContain("Сварить");
  });

  it("читает вид из cookie nb_my_recipes_view=list — рендерит list-вид", async () => {
    mocks.myRecipesViewCookie = "list";
    try {
      const { MyRecipesContent } = await import("../app/(app)/app/recipes/content");
      const view = await MyRecipesContent();
      const html = renderToStaticMarkup(view);

      expect(html).toContain('aria-label="Списком"');
      expect(html).toMatch(/aria-label="Списком"[^>]*aria-pressed="true"/);
    } finally {
      mocks.myRecipesViewCookie = undefined;
    }
  });

  it("compat route redirects legacy owner detail url to edit", async () => {
    const { default: RecipePage } = await import("../app/(app)/app/recipes/[id]/page");

    await expect(RecipePage({ params: Promise.resolve({ id: "r-1" }) })).rejects.toThrow("NEXT_REDIRECT:/app/recipes/r-1/edit");
    expect(mocks.redirect).toHaveBeenCalledWith("/app/recipes/r-1/edit");
  });
});
