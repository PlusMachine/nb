import { beforeEach, describe, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";

// Server actions модерации рецептов (app/(admin)/admin/recipes/actions.ts). Проверяем
// не сервисный слой (он в admin-recipes-service.test.ts), а сброс кэшей: скрытый рецепт
// иначе висит карточкой на странице стиля (ISR, час) и в ленте главной (процессный
// TTL-слот, 90 с — Next-кэш о нём не знает). @nb/brewing-core НЕ мокаем: маппинг
// styleId → bjcpId должен ломаться в тесте, если сломается в проде.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  revalidatePath: vi.fn(),
  invalidateHomeDataCache: vi.fn(),
  listArticles: vi.fn(),
  hideRecipes: vi.fn(),
  unhideRecipe: vi.fn(),
  deleteRecipeAsModerator: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/features/home/home-data-cache", () => ({ invalidateHomeDataCache: mocks.invalidateHomeDataCache }));
vi.mock("@nb/content", () => ({ listArticles: mocks.listArticles }));

vi.mock("@/features/recipes/admin-service", () => ({
  hideRecipes: mocks.hideRecipes,
  unhideRecipe: mocks.unhideRecipe,
  deleteRecipeAsModerator: mocks.deleteRecipeAsModerator
}));

import { deleteRecipeAction, hideRecipesAction, unhideRecipeAction } from "../app/(admin)/admin/recipes/actions";

const MODERATOR = { id: "mod-1", email: "mod@nb.test", role: "moderator" };

// 21A — реальный BJCP-код (American IPA): styleId рецепта резолвится настоящим
// getBeerStyleById. Один код может стоять у нескольких статей — блок рецептов на
// каждой из них фильтруется по коду, поэтому ревалидировать надо обе.
const AMERICAN_IPA_STYLE_ID = "21A";

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.requireRole.mockResolvedValue(MODERATOR);
  mocks.listArticles.mockResolvedValue([
    { bjcpId: "21A", slug: "american-ipa" },
    { bjcpId: "21A", slug: "amerikanskiy-ipa-2" },
    { bjcpId: "18B", slug: "american-pale-ale" }
  ]);
});

describe("hideRecipesAction", () => {
  it("скрытие сбрасывает страницу стиля, ленту главной и остальные публичные поверхности", async () => {
    mocks.hideRecipes.mockResolvedValue({
      hidden: [{ id: "r-1", slug: "hidden-ipa", styleId: AMERICAN_IPA_STYLE_ID }],
      failures: []
    });

    const result = await hideRecipesAction(["r-1"], "Плагиат");

    // Полный успех — чистый ok без упавших.
    expect(result).toEqual({ ok: true, processed: 1, failed: [] });
    expect(mocks.requireRole).toHaveBeenCalledWith("moderator");
    expect(mocks.hideRecipes).toHaveBeenCalledWith({ id: "mod-1", email: "mod@nb.test" }, ["r-1"], "Плагиат");

    // Страница стиля держит ISR на час — без этого скрытый рецепт остаётся её карточкой.
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/bjcp/american-ipa");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/bjcp/amerikanskiy-ipa-2");
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/bjcp/american-pale-ale");

    // Лента и счётчики главной — процессный слот мимо Next-кэша.
    expect(mocks.invalidateHomeDataCache).toHaveBeenCalledTimes(1);

    for (const path of ["/admin/recipes", "/recipes", "/", "/sitemap.xml", "/recipes/hidden-ipa", "/beer/hidden-ipa"]) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it("рецепт без BJCP-стиля: страниц стилей нет, но главная всё равно сбрасывается", async () => {
    mocks.hideRecipes.mockResolvedValue({
      hidden: [{ id: "r-2", slug: "no-style", styleId: null }],
      failures: []
    });

    await hideRecipesAction(["r-2"], "Плагиат");

    expect(mocks.revalidatePath).not.toHaveBeenCalledWith(expect.stringContaining("/bjcp/"));
    expect(mocks.listArticles).not.toHaveBeenCalled();
    expect(mocks.invalidateHomeDataCache).toHaveBeenCalledTimes(1);
  });

  // Частичный отказ — штатный исход: успешная часть применена, упавшие рецепты
  // едут в failed вместе с ней, иначе модератор не узнает, что 3 из 50 не прошли.
  it("массовое скрытие: частичный отказ доезжает до результата вместе с причинами", async () => {
    mocks.hideRecipes.mockResolvedValue({
      hidden: [{ id: "r-1", slug: "hidden-ipa", styleId: AMERICAN_IPA_STYLE_ID }],
      failures: [
        { id: "r-3", reason: "hidden" },
        { id: "r-4", reason: "missing" }
      ]
    });

    const result = await hideRecipesAction(["r-1", "r-3", "r-4"], "Плагиат");

    expect(result).toEqual({
      ok: true,
      processed: 1,
      failed: [
        { reason: "hidden", ids: ["r-3"] },
        { reason: "missing", ids: ["r-4"] }
      ]
    });
    // Скрытая часть уже применена — публичные поверхности сбрасываем.
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/bjcp/american-ipa");
    expect(mocks.invalidateHomeDataCache).toHaveBeenCalledTimes(1);
  });

  it("полный отказ: ok:false с причинами по-русски", async () => {
    mocks.hideRecipes.mockResolvedValue({
      hidden: [],
      failures: [
        { id: "r-3", reason: "hidden" },
        { id: "r-4", reason: "missing" },
        { id: "r-5", reason: "missing" }
      ]
    });

    const result = await hideRecipesAction(["r-3", "r-4", "r-5"], "Плагиат");

    expect(result).toEqual({
      ok: false,
      error: "Ничего не скрыто: уже скрыты: 1, не найдены: 2.",
      failed: [
        { reason: "hidden", ids: ["r-3"] },
        { reason: "missing", ids: ["r-4", "r-5"] }
      ]
    });
  });

  it("пустой выбор — в сервис не ходим", async () => {
    const result = await hideRecipesAction([" ", ""], "Плагиат");

    expect(result).toEqual({ ok: false, error: "Не выбрано ни одного рецепта." });
    expect(mocks.hideRecipes).not.toHaveBeenCalled();
    expect(mocks.invalidateHomeDataCache).not.toHaveBeenCalled();
  });

  it("отказ валидации причины показывается пользователю дословно", async () => {
    const parsed = z.string().trim().min(3, "Укажите причину скрытия.").safeParse("  ");
    mocks.hideRecipes.mockRejectedValue((parsed as { success: false; error: ZodError }).error);

    await expect(hideRecipesAction(["r-1"], "  ")).resolves.toEqual({
      ok: false,
      error: "Укажите причину скрытия."
    });
  });

  it("редирект requireRole (гость/недостаточная роль) не проглатывается", async () => {
    mocks.requireRole.mockRejectedValue(Object.assign(new Error("redirect"), { digest: "NEXT_REDIRECT;/login" }));

    await expect(hideRecipesAction(["r-1"], "Плагиат")).rejects.toThrow("redirect");
    expect(mocks.hideRecipes).not.toHaveBeenCalled();
    expect(mocks.invalidateHomeDataCache).not.toHaveBeenCalled();
  });
});

describe("unhideRecipeAction", () => {
  it("возврат рецепта тоже сбрасывает страницу стиля и главную", async () => {
    mocks.unhideRecipe.mockResolvedValue({ slug: "hidden-ipa", styleId: AMERICAN_IPA_STYLE_ID });

    await expect(unhideRecipeAction("r-1")).resolves.toEqual({ ok: true });

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/bjcp/american-ipa");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/recipes/hidden-ipa");
    expect(mocks.invalidateHomeDataCache).toHaveBeenCalledTimes(1);
  });

  it("несуществующий/не скрытый рецепт — понятная ошибка, кэши не трогаем", async () => {
    mocks.unhideRecipe.mockRejectedValue(new Error("NOT_FOUND"));

    await expect(unhideRecipeAction("r-1")).resolves.toEqual({
      ok: false,
      error: "Рецепт не найден — возможно, страницу нужно обновить."
    });
    expect(mocks.invalidateHomeDataCache).not.toHaveBeenCalled();
  });
});

describe("deleteRecipeAction", () => {
  it("удаление сбрасывает страницу стиля и главную", async () => {
    mocks.deleteRecipeAsModerator.mockResolvedValue({
      slug: "hidden-ipa",
      title: "Скрытая IPA",
      styleId: AMERICAN_IPA_STYLE_ID
    });

    await expect(deleteRecipeAction("r-1")).resolves.toEqual({ ok: true });

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/bjcp/american-ipa");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/beer/hidden-ipa");
    expect(mocks.invalidateHomeDataCache).toHaveBeenCalledTimes(1);
  });
});
