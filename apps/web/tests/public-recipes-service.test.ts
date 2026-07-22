import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeSearchText, swapKeyboardLayout } from "@nb/search";

import { parsePublicRecipeFilters } from "../features/recipes/public-recipe-query";

vi.mock("server-only", () => ({}));

const { mockState } = vi.hoisted(() => ({
  mockState: {
    rows: [] as Record<string, unknown>[],
    // С4 (rescue): очередь наборов строк по проходам поиска — main+count каждого
    // прохода (searchPublicRecipes может звать runSearch дважды: обычный проход
    // + раскладочный фолбэк) идут парой и читают один и тот же элемент очереди.
    // null (по умолчанию) — обратная совместимость, все select'ы читают `rows`.
    rowsQueue: null as Record<string, unknown>[][] | null,
    captured: [] as Array<{
      projection: Record<string, unknown>;
      where: unknown;
      order: unknown;
      limit: number | null;
      offset: number | null;
    }>
  }
}));

vi.mock("@nb/db", () => {
  // Table tokens: any column access -> "table.column" string, so mocked
  // operators can record column identities.
  const tableToken = (name: string) =>
    new Proxy({} as Record<string, string>, {
      get: (_target, prop) => `${name}.${String(prop)}`
    });

  const resolveRows = (projection: Record<string, unknown>) => {
    // Пара main+count делят один индекс очереди: main всегда идёт первым
    // (captured.length становится нечётным после push), count — вторым.
    const queuedRows = mockState.rowsQueue
      ? mockState.rowsQueue[Math.floor((mockState.captured.length - 1) / 2)]
        ?? mockState.rowsQueue.at(-1)
        ?? []
      : mockState.rows;

    if ("value" in projection) {
      return [{ value: queuedRows.length }];
    }
    return queuedRows;
  };

  const makeBuilder = (projection: Record<string, unknown>) => {
    const state = {
      projection,
      where: undefined as unknown,
      order: undefined as unknown,
      limit: null as number | null,
      offset: null as number | null
    };
    const builder: Record<string, unknown> = {
      from: () => builder,
      leftJoin: () => builder,
      where: (clause: unknown) => {
        state.where = clause;
        return builder;
      },
      orderBy: (...order: unknown[]) => {
        state.order = order;
        return builder;
      },
      limit: (value: number) => {
        state.limit = value;
        return builder;
      },
      offset: (value: number) => {
        state.offset = value;
        return builder;
      },
      then: (onFulfilled: (rows: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
        mockState.captured.push({ ...state });
        return Promise.resolve(resolveRows(projection)).then(onFulfilled, onRejected);
      }
    };
    return builder;
  };

  const db = {
    select: (projection: Record<string, unknown>) => makeBuilder(projection)
  };

  // Тег `sql`: реконструирует читаемую строку для проверки NULLS LAST в ORDER BY.
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    let out = "";
    strings.forEach((chunk, index) => {
      out += chunk;
      if (index < values.length) {
        const value = values[index];
        out += value && typeof value === "object" && "raw" in (value as Record<string, unknown>)
          ? String((value as { raw: unknown }).raw)
          : String(value);
      }
    });
    return ["sql", out.trim()];
  };
  sql.raw = (value: unknown) => ({ raw: String(value) });

  return {
    db,
    sql,
    and: (...args: unknown[]) => ["and", ...args],
    or: (...args: unknown[]) => ["or", ...args],
    eq: (...args: unknown[]) => ["eq", ...args],
    gte: (...args: unknown[]) => ["gte", ...args],
    lte: (...args: unknown[]) => ["lte", ...args],
    ilike: (...args: unknown[]) => ["ilike", ...args],
    inArray: (...args: unknown[]) => ["inArray", ...args],
    isNull: (...args: unknown[]) => ["isNull", ...args],
    asc: (value: unknown) => ["asc", value],
    desc: (value: unknown) => ["desc", value],
    count: () => "count",
    recipes: tableToken("recipes"),
    recipeImages: tableToken("recipeImages"),
    recipeIngredients: tableToken("recipeIngredients"),
    recipeRatings: tableToken("recipeRatings"),
    ingredients: tableToken("ingredients"),
    users: tableToken("users"),
    userBrewingSettings: tableToken("userBrewingSettings"),
    userCustomIngredients: tableToken("userCustomIngredients")
  };
});

import { searchPublicRecipes } from "../features/recipes/service";

const baseRow = () => ({
  id: "r-1",
  slug: "hazy-ipa",
  title: "Hazy IPA",
  authorId: "u-1",
  styleId: "21A",
  og: 1.06,
  fg: 1.012,
  abv: 6.2,
  ibu: 45,
  color: 9.5,
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  updatedAt: new Date("2026-02-01T00:00:00.000Z"),
  createdAt: new Date("2026-02-01T00:00:00.000Z"),
  heroImageId: "img-1",
  ratingAvg: null,
  ratingCount: 0,
  cloneCount: 7,
  authorDisplayName: "Alice",
  authorImage: "https://example.test/alice.png",
  heroThumbKey: "recipes/r-1/thumb.webp",
  heroBlurDataUrl: "data:image/png;base64,blur"
});

const mainQuery = () => mockState.captured.find((q) => q.limit != null);
const countQuery = () => mockState.captured.find((q) => "value" in q.projection);

beforeEach(() => {
  mockState.rows = [];
  mockState.rowsQueue = null;
  mockState.captured = [];
});

describe("searchPublicRecipes", () => {
  it("maps rows to PublicRecipeListItem (style, colorEbc, batchSizeL, heroImage)", async () => {
    mockState.rows = [baseRow()];
    const result = await searchPublicRecipes(parsePublicRecipeFilters({}));

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(24);
    expect(result.items).toHaveLength(1);

    const item = result.items[0];
    expect(item.name).toBe("Hazy IPA");
    expect(item.author).toEqual({ id: "u-1", displayName: "Alice", image: "https://example.test/alice.png" });
    expect(item.style).toEqual({ code: "21A", name: expect.any(String) });
    expect(item.colorSrm).toBe(9.5);
    expect(item.colorEbc).toBe(19); // round(9.5 * 1.97)
    expect(item.batchSizeL).toBe(20); // 20000 ml -> 20 L
    expect(item.method).toBeNull();
    expect(item.cloneCount).toBe(7); // «Скопировали N раз» — из recipes.clone_count, а не заглушка
    expect(item.rating).toBeNull();
    expect(item.heroImage).toEqual({
      thumbUrl: "/api/recipe-images/img-1/thumb",
      blurDataUrl: "data:image/png;base64,blur"
    });
    expect(item.publishedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(item.createdAt).toBe("2026-02-01T00:00:00.000Z");
    expect(item.styleHref).toMatch(/^\/bjcp\/bjcp-21a/);
  });

  it("handles null style / color / hero gracefully", async () => {
    mockState.rows = [
      { ...baseRow(), styleId: null, color: null, heroImageId: null, heroThumbKey: null, authorImage: null }
    ];
    const item = (await searchPublicRecipes(parsePublicRecipeFilters({}))).items[0];
    expect(item.style).toBeNull();
    expect(item.colorSrm).toBeNull();
    expect(item.colorEbc).toBeNull();
    expect(item.heroImage).toBeNull();
    expect(item.author.image).toBeNull();
  });

  it("always filters to published and orders newest by updatedAt desc by default", async () => {
    mockState.rows = [baseRow()];
    await searchPublicRecipes(parsePublicRecipeFilters({}));

    const where = mainQuery()!.where as unknown[];
    expect(where[0]).toBe("and");
    expect(where).toContainEqual(["eq", "recipes.publicationState", "published"]);
    expect(mainQuery()!.order).toEqual([["desc", "recipes.updatedAt"]]);
  });

  it("builds WHERE for q + ranges and ORDER for abv_desc with secondary key", async () => {
    mockState.rows = [baseRow()];
    await searchPublicRecipes(
      parsePublicRecipeFilters({ q: "ipa", abvMin: "5", ibuMax: "60", sort: "abv_desc", page: "2", pageSize: "10" })
    );

    const main = mainQuery()!;
    const where = main.where as unknown[];
    expect(where).toContainEqual(["eq", "recipes.publicationState", "published"]);
    // Текстовый OR теперь строится по вариантам запроса (транслит/curated-словарь,
    // см. resolveTextSearchScope) — «ipa» остаётся среди них, но не единственный.
    const orClause = where.find(
      (clause): clause is unknown[] => Array.isArray(clause) && clause[0] === "or"
    );
    expect(orClause).toContainEqual(["ilike", "recipes.title", "%ipa%"]);
    expect(orClause).toContainEqual(["ilike", "users.displayName", "%ipa%"]);
    expect(where).toContainEqual(["gte", "recipes.abv", 5]);
    expect(where).toContainEqual(["lte", "recipes.ibu", 60]);
    expect(main.order).toEqual([["desc", "recipes.abv"], ["desc", "recipes.updatedAt"]]);
    expect(main.limit).toBe(10);
    expect(main.offset).toBe(10);
  });

  // Ф7 (P2 ревью волны 4): % и _ — служебные символы Postgres LIKE/ILIKE (wildcard
  // и single-char match) — экранируем их В САМОМ варианте до подстановки в `%...%`,
  // иначе они действуют как маска вместо буквального символа запроса.
  it("экранирует % в варианте запроса перед подстановкой в ilike-паттерн", async () => {
    mockState.rows = [baseRow()];
    await searchPublicRecipes(parsePublicRecipeFilters({ q: "50%off" }));

    const where = mainQuery()!.where as unknown[];
    const orClause = where.find(
      (clause): clause is unknown[] => Array.isArray(clause) && clause[0] === "or"
    );
    expect(orClause).toContainEqual(["ilike", "recipes.title", "%50\\%off%"]);
  });

  it("экранирует _ (буквальный литерал через Ф4-фолбэк для пунктуационного запроса)", async () => {
    mockState.rows = [baseRow()];
    await searchPublicRecipes(parsePublicRecipeFilters({ q: "_" }));

    const where = mainQuery()!.where as unknown[];
    const orClause = where.find(
      (clause): clause is unknown[] => Array.isArray(clause) && clause[0] === "or"
    );
    expect(orClause).toContainEqual(["ilike", "recipes.title", "%\\_%"]);
  });

  it("applies an IN filter on styleId for a style/family scope", async () => {
    mockState.rows = [baseRow()];
    await searchPublicRecipes(parsePublicRecipeFilters({ style: "21A" }));

    const where = mainQuery()!.where as unknown[];
    const inArrayClause = where.find(
      (clause): clause is unknown[] => Array.isArray(clause) && clause[0] === "inArray"
    );
    expect(inArrayClause).toBeTruthy();
    expect(inArrayClause![1]).toBe("recipes.styleId");
    expect(inArrayClause![2]).toContain("21A");
  });

  it("runs a separate count query for total", async () => {
    mockState.rows = [baseRow(), { ...baseRow(), id: "r-2" }];
    const result = await searchPublicRecipes(parsePublicRecipeFilters({}));
    expect(result.total).toBe(2);
    expect(countQuery()).toBeTruthy();
  });

  it("orders rating sort by bayesian score desc NULLS LAST with secondary updatedAt", async () => {
    // Сортировка «По рейтингу» идёт по байесовскому скору (rating_bayes), а не по
    // голому среднему — чтобы одна оценка 5.0 не обгоняла 4.8 при сотне оценок.
    // Наружу при этом по-прежнему отдаётся честный ratingAvg (см. тесты ниже).
    mockState.rows = [baseRow()];
    await searchPublicRecipes(parsePublicRecipeFilters({ sort: "rating" }));

    expect(mainQuery()!.order).toEqual([
      ["sql", "recipes.ratingBayes desc nulls last"],
      ["desc", "recipes.updatedAt"]
    ]);
  });

  it("maps rating from denormalized fields when ratingCount > 0", async () => {
    mockState.rows = [{ ...baseRow(), ratingAvg: 4.6667, ratingCount: 3 }];
    const item = (await searchPublicRecipes(parsePublicRecipeFilters({}))).items[0];
    expect(item.rating).toEqual({ average: 4.7, count: 3 });
  });

  it("keeps rating null when there are no ratings (count 0)", async () => {
    mockState.rows = [{ ...baseRow(), ratingAvg: null, ratingCount: 0 }];
    const item = (await searchPublicRecipes(parsePublicRecipeFilters({}))).items[0];
    expect(item.rating).toBeNull();
  });

  // С4 (rescue): раскладочный фолбэк — первый проход не находит ничего, второй
  // (includeLayoutVariants) находит строки → rescue.correctedQuery заполняется.
  it("заполняет rescue.correctedQuery при раскладочном фолбэке (второй проход находит строки)", async () => {
    mockState.rowsQueue = [[], [baseRow()]];
    const q = "vjpfbr";

    const result = await searchPublicRecipes(parsePublicRecipeFilters({ q }));

    expect(result.total).toBe(1);
    expect(result.rescue).toEqual({
      correctedQuery: normalizeSearchText(swapKeyboardLayout(q))
    });
  });

  it("rescue отсутствует при обычном запросе (первый проход уже нашёл строки)", async () => {
    mockState.rows = [baseRow()];

    const result = await searchPublicRecipes(parsePublicRecipeFilters({ q: "ipa" }));

    expect(result.total).toBe(1);
    expect(result.rescue).toBeFalsy();
  });

  it("rescue отсутствует, если раскладочный фолбэк тоже не нашёл строк", async () => {
    mockState.rowsQueue = [[], []];

    const result = await searchPublicRecipes(parsePublicRecipeFilters({ q: "vjpfbr" }));

    expect(result.total).toBe(0);
    expect(result.rescue).toBeFalsy();
  });
});
