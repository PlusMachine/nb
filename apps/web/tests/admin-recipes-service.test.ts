import { beforeEach, describe, expect, it, vi } from "vitest";

// Мутации модерации: скрытие (в т.ч. массовое), возврат и удаление с очисткой
// storage. @nb/db мокаем ровно под эти три пути — важен не SQL, а контракт:
// что уходит в set/where, что возвращается вызывающему и что попадает в аудит.

vi.mock("server-only", () => ({}));

const { mockState, calls } = vi.hoisted(() => ({
  mockState: {
    updateReturning: [] as Array<Record<string, unknown>>,
    recipe: undefined as Record<string, unknown> | undefined,
    /** Строки любого db.select: фото удаляемого рецепта либо состояние не скрывшихся рецептов. */
    selectRows: [] as Array<Record<string, unknown>>
  },
  calls: {
    updates: [] as Array<{ set: Record<string, unknown>; where: unknown }>,
    deletes: [] as unknown[],
    orderBy: [] as unknown[][],
    selects: 0
  }
}));

vi.mock("@nb/db", () => {
  const tableToken = (name: string) =>
    new Proxy({} as Record<string, string>, {
      get: (_target, prop) => `${name}.${String(prop)}`
    });

  const selectBuilder = () => {
    const builder: Record<string, unknown> = {
      from: () => builder,
      leftJoin: () => builder,
      where: () => builder,
      orderBy: (...keys: unknown[]) => {
        calls.orderBy.push(keys);
        return builder;
      },
      limit: () => builder,
      offset: () => builder,
      then: (onFulfilled: (rows: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(mockState.selectRows).then(onFulfilled, onRejected)
    };
    return builder;
  };

  const db = {
    select: () => {
      calls.selects += 1;
      return selectBuilder();
    },
    update: () => {
      const state = { set: {} as Record<string, unknown>, where: undefined as unknown };
      const builder: Record<string, unknown> = {
        set: (values: Record<string, unknown>) => {
          state.set = values;
          return builder;
        },
        where: (where: unknown) => {
          state.where = where;
          return builder;
        },
        returning: async () => {
          calls.updates.push({ set: state.set, where: state.where });
          return mockState.updateReturning;
        }
      };
      return builder;
    },
    delete: () => ({
      where: async (where: unknown) => {
        calls.deletes.push(where);
      }
    }),
    query: {
      recipes: {
        findFirst: async () => mockState.recipe
      }
    }
  };

  return {
    db,
    and: (...args: unknown[]) => args,
    or: (...args: unknown[]) => args,
    eq: (...args: unknown[]) => ["eq", ...args],
    isNull: (...args: unknown[]) => ["isNull", ...args],
    isNotNull: (...args: unknown[]) => ["isNotNull", ...args],
    inArray: (...args: unknown[]) => ["inArray", ...args],
    ilike: (...args: unknown[]) => args,
    asc: (...args: unknown[]) => ["asc", ...args],
    desc: (...args: unknown[]) => ["desc", ...args],
    count: () => "count",
    sql: Object.assign((_strings: unknown, ...values: unknown[]) => ["sql", ...values], {
      raw: (value: unknown) => ({ raw: String(value) })
    }),
    recipeImages: tableToken("recipeImages"),
    recipes: tableToken("recipes"),
    users: tableToken("users")
  };
});

vi.mock("../features/audit/service", () => ({
  recordAuditEvent: vi.fn(async () => {})
}));

vi.mock("../features/recipe-images/service", () => ({
  deleteRecipeImageObjects: vi.fn(async () => {})
}));

import { recordAuditEvent } from "../features/audit/service";
import { deleteRecipeImageObjects } from "../features/recipe-images/service";
import type { AdminRecipesQuery } from "../features/recipes/admin-page-model";
import { deleteRecipeAsModerator, hideRecipes, listAdminRecipes, unhideRecipe } from "../features/recipes/admin-service";

const MODERATOR = { id: "moderator-1", email: "mod@nb.test" };

beforeEach(() => {
  mockState.updateReturning = [];
  mockState.recipe = undefined;
  mockState.selectRows = [];
  calls.updates = [];
  calls.deletes = [];
  calls.orderBy = [];
  calls.selects = 0;
  vi.mocked(recordAuditEvent).mockClear();
  vi.mocked(deleteRecipeImageObjects).mockClear();
});

describe("listAdminRecipes", () => {
  const query = (sort: AdminRecipesQuery["sort"]): AdminRecipesQuery => ({
    q: "",
    status: "all",
    sort,
    page: 1,
    pageSize: 20
  });

  it.each([
    ["updated", ["desc", "recipes.updatedAt"], ["desc", "recipes.id"]],
    ["created", ["desc", "recipes.createdAt"], ["desc", "recipes.id"]],
    ["title", ["asc", "recipes.title"], ["asc", "recipes.id"]],
    ["rating", ["sql", "recipes.ratingAvg"], ["desc", "recipes.id"]]
  ] as const)(
    "сортировка %s: id последним ключом, иначе строки с равным ключом перетасовываются между страницами",
    async (sort, firstKey, tieBreaker) => {
      await listAdminRecipes(query(sort));

      const keys = calls.orderBy[0];
      expect(keys[0]).toEqual(firstKey);
      expect(keys[keys.length - 1]).toEqual(tieBreaker);
    }
  );
});

describe("hideRecipes", () => {
  it("массовое скрытие: скрывает найденные, по остальным отдаёт причину", async () => {
    mockState.updateReturning = [
      { id: "r-1", title: "IPA", slug: "ipa", styleId: "21A-american-ipa" },
      { id: "r-2", title: "Стаут", slug: "stout", styleId: null }
    ];
    // Дочитывание состояния упавших: r-3 уже скрыт кем-то, r-4 в базе нет.
    mockState.selectRows = [{ id: "r-3", hiddenAt: new Date("2026-07-01T00:00:00Z") }];

    const result = await hideRecipes(MODERATOR, ["r-1", "r-2", "r-3", "r-4"], "Плагиат");

    // styleId нужен вызывающему для ревалидации страницы стиля /bjcp/<slug>.
    expect(result.hidden).toEqual([
      { id: "r-1", slug: "ipa", styleId: "21A-american-ipa" },
      { id: "r-2", slug: "stout", styleId: null }
    ]);
    // Причина по каждому — иначе модератор не узнает, что именно не прошло.
    expect(result.failures).toEqual([
      { id: "r-3", reason: "hidden" },
      { id: "r-4", reason: "missing" }
    ]);
  });

  it("строка на месте и не скрыта, но апдейт её не взял — это сбой, а не «уже скрыт»", async () => {
    mockState.updateReturning = [];
    mockState.selectRows = [{ id: "r-9", hiddenAt: null }];

    const result = await hideRecipes(MODERATOR, ["r-9"], "Плагиат");

    expect(result.hidden).toEqual([]);
    expect(result.failures).toEqual([{ id: "r-9", reason: "failed" }]);
  });

  it("всё скрыто — за причинами в БД не ходим", async () => {
    mockState.updateReturning = [{ id: "r-1", title: "IPA", slug: "ipa", styleId: null }];

    const result = await hideRecipes(MODERATOR, ["r-1"], "Плагиат");

    expect(result.failures).toEqual([]);
    expect(calls.selects).toBe(0);
  });

  it("проставляет метку скрытия и снимает «Выбор редакции»", async () => {
    mockState.updateReturning = [{ id: "r-1", title: "IPA", slug: "ipa", styleId: "21A-american-ipa" }];

    await hideRecipes(MODERATOR, ["r-1"], "Плагиат");

    const update = calls.updates[0];
    expect(update.set.hiddenReason).toBe("Плагиат");
    expect(update.set.hiddenByUserId).toBe("moderator-1");
    expect(update.set.hiddenAt).toBeInstanceOf(Date);
    expect(update.set.featuredAt).toBeNull();
    // Уже скрытые повторно не трогаем: в where есть isNull(hidden_at).
    expect(JSON.stringify(update.where)).toContain("recipes.hiddenAt");
  });

  it("пишет в аудит по событию на каждый скрытый рецепт", async () => {
    mockState.updateReturning = [
      { id: "r-1", title: "IPA", slug: "ipa", styleId: "21A-american-ipa" },
      { id: "r-2", title: "Стаут", slug: "stout", styleId: null }
    ];

    await hideRecipes(MODERATOR, ["r-1", "r-2"], "Плагиат");

    expect(recordAuditEvent).toHaveBeenCalledTimes(2);
    expect(vi.mocked(recordAuditEvent).mock.calls[0][0]).toMatchObject({
      actorUserId: "moderator-1",
      actorEmail: "mod@nb.test",
      action: "recipe.hide",
      entityType: "recipe",
      entityId: "r-1",
      payload: { reason: "Плагиат", slug: "ipa" }
    });
  });

  it("причина обязательна", async () => {
    await expect(hideRecipes(MODERATOR, ["r-1"], "  ")).rejects.toThrow();
    expect(calls.updates).toHaveLength(0);
  });

  it("пустой список id — не ходит в БД", async () => {
    const result = await hideRecipes(MODERATOR, [], "Плагиат");

    expect(result).toEqual({ hidden: [], failures: [] });
    expect(calls.updates).toHaveLength(0);
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe("unhideRecipe", () => {
  it("снимает метку и пишет в аудит", async () => {
    mockState.updateReturning = [{ id: "r-1", title: "IPA", slug: "ipa", styleId: "21A-american-ipa" }];

    await expect(unhideRecipe(MODERATOR, "r-1")).resolves.toEqual({ slug: "ipa", styleId: "21A-american-ipa" });

    expect(calls.updates[0].set).toMatchObject({ hiddenAt: null, hiddenReason: null, hiddenByUserId: null });
    expect(vi.mocked(recordAuditEvent).mock.calls[0][0]).toMatchObject({
      action: "recipe.unhide",
      entityId: "r-1"
    });
  });

  it("рецепт не скрыт или не существует — NOT_FOUND", async () => {
    mockState.updateReturning = [];

    await expect(unhideRecipe(MODERATOR, "r-1")).rejects.toThrow("NOT_FOUND");
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe("deleteRecipeAsModerator", () => {
  it("удаляет рецепт и чистит файлы всех его фото в storage", async () => {
    mockState.recipe = { id: "r-1", title: "IPA", slug: "ipa", authorId: "author-1", styleId: "21A-american-ipa" };
    mockState.selectRows = [
      {
        storageKeyOriginal: "recipes/r-1/i-1/original.jpg",
        storageKeyLarge: "recipes/r-1/i-1/large.webp",
        storageKeyMedium: "recipes/r-1/i-1/medium.webp",
        storageKeyThumb: "recipes/r-1/i-1/thumb.webp"
      },
      {
        storageKeyOriginal: null,
        storageKeyLarge: "recipes/r-1/i-2/large.webp",
        storageKeyMedium: null,
        storageKeyThumb: null
      }
    ];

    await expect(deleteRecipeAsModerator(MODERATOR, "r-1")).resolves.toEqual({
      slug: "ipa",
      title: "IPA",
      styleId: "21A-american-ipa"
    });

    expect(calls.deletes).toHaveLength(1);
    expect(deleteRecipeImageObjects).toHaveBeenCalledWith([
      "recipes/r-1/i-1/original.jpg",
      "recipes/r-1/i-1/large.webp",
      "recipes/r-1/i-1/medium.webp",
      "recipes/r-1/i-1/thumb.webp",
      null,
      "recipes/r-1/i-2/large.webp",
      null,
      null
    ]);
    expect(vi.mocked(recordAuditEvent).mock.calls[0][0]).toMatchObject({
      action: "recipe.delete",
      entityId: "r-1",
      payload: { slug: "ipa", authorId: "author-1" }
    });
  });

  it("несуществующий рецепт — NOT_FOUND, ничего не удаляется", async () => {
    mockState.recipe = undefined;

    await expect(deleteRecipeAsModerator(MODERATOR, "r-1")).rejects.toThrow("NOT_FOUND");
    expect(calls.deletes).toHaveLength(0);
    expect(deleteRecipeImageObjects).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});
