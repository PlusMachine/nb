import { describe, expect, it } from "vitest";
import { beerStyleFixtures } from "@nb/brewing-core";
import { getBjcpCatalogData } from "@nb/content";

import {
  parsePublicRecipeFilters,
  resolvePagination,
  resolvePublicRecipeSort,
  resolveStyleScope,
  resolveTextSearchScope
} from "../features/recipes/public-recipe-query";

describe("parsePublicRecipeFilters", () => {
  it("returns defaults for empty input", () => {
    const filters = parsePublicRecipeFilters({});
    expect(filters.sort).toBe("newest");
    expect(filters.page).toBe(1);
    expect(filters.pageSize).toBe(24);
    expect(filters.q).toBeUndefined();
    expect(filters.family).toBeUndefined();
    expect(filters.styleCode).toBeUndefined();
    expect(filters.method).toBeUndefined();
    expect(filters.colorMinSrm).toBeUndefined();
  });

  it("parses a full valid set", () => {
    const filters = parsePublicRecipeFilters({
      q: "  hazy ipa ",
      family: "ipa",
      style: "21A",
      colorMin: "4",
      colorMax: "12",
      abvMin: "5",
      abvMax: "7.5",
      ibuMin: "30",
      ibuMax: "70",
      method: "all_grain,extract",
      sort: "abv_desc",
      page: "3",
      pageSize: "12"
    });
    expect(filters.q).toBe("hazy ipa");
    expect(filters.family).toBe("ipa");
    expect(filters.styleCode).toBe("21A");
    expect(filters.colorMinSrm).toBe(4);
    expect(filters.colorMaxSrm).toBe(12);
    expect(filters.abvMin).toBe(5);
    expect(filters.abvMax).toBe(7.5);
    expect(filters.ibuMin).toBe(30);
    expect(filters.ibuMax).toBe(70);
    expect(filters.method).toEqual(["all_grain", "extract"]);
    expect(filters.sort).toBe("abv_desc");
    expect(filters.page).toBe(3);
    expect(filters.pageSize).toBe(12);
  });

  it("falls back / clamps on garbage and out-of-range", () => {
    const filters = parsePublicRecipeFilters({
      sort: "definitely_not_a_sort",
      page: "abc",
      pageSize: "999",
      colorMin: "-5",
      colorMax: "9000",
      abvMin: "300"
    });
    expect(filters.sort).toBe("newest");
    expect(filters.page).toBe(1);
    expect(filters.pageSize).toBe(48); // clamped to max
    expect(filters.colorMinSrm).toBe(0); // clamped to lo
    expect(filters.colorMaxSrm).toBe(80); // clamped to hi
    expect(filters.abvMin).toBe(20); // clamped to abv hi
  });

  it("resets pageSize below 1 to default and keeps valid enum sorts", () => {
    expect(parsePublicRecipeFilters({ pageSize: "0" }).pageSize).toBe(24);
    expect(parsePublicRecipeFilters({ sort: "popular" }).sort).toBe("popular");
    expect(parsePublicRecipeFilters({ sort: "rating" }).sort).toBe("rating");
  });

  it("swaps inverted ranges", () => {
    const filters = parsePublicRecipeFilters({ abvMin: "9", abvMax: "3" });
    expect(filters.abvMin).toBe(3);
    expect(filters.abvMax).toBe(9);
  });

  it("drops unknown methods, undefined when none valid", () => {
    expect(parsePublicRecipeFilters({ method: "all_grain,bogus" }).method).toEqual(["all_grain"]);
    expect(parsePublicRecipeFilters({ method: "bogus,nope" }).method).toBeUndefined();
  });
});

describe("resolvePublicRecipeSort", () => {
  it("maps each sort to a column/direction", () => {
    expect(resolvePublicRecipeSort("newest")).toEqual({ key: "updatedAt", direction: "desc" });
    expect(resolvePublicRecipeSort("abv_desc")).toEqual({ key: "abv", direction: "desc" });
    expect(resolvePublicRecipeSort("abv_asc")).toEqual({ key: "abv", direction: "asc" });
    expect(resolvePublicRecipeSort("ibu_desc")).toEqual({ key: "ibu", direction: "desc" });
    expect(resolvePublicRecipeSort("ibu_asc")).toEqual({ key: "ibu", direction: "asc" });
    expect(resolvePublicRecipeSort("color_asc")).toEqual({ key: "color", direction: "asc" });
    expect(resolvePublicRecipeSort("color_desc")).toEqual({ key: "color", direction: "desc" });
    expect(resolvePublicRecipeSort("name")).toEqual({ key: "title", direction: "asc" });
  });

  it("maps popular to save_count desc (число сохранений)", () => {
    expect(resolvePublicRecipeSort("popular")).toEqual({ key: "saveCount", direction: "desc" });
  });

  it("maps rating to rating_avg desc NULLS LAST (Phase D)", () => {
    expect(resolvePublicRecipeSort("rating")).toEqual({ key: "rating", direction: "desc", nullsLast: true });
  });
});

describe("resolvePagination", () => {
  it("computes limit/offset", () => {
    expect(resolvePagination(1, 24)).toEqual({ limit: 24, offset: 0, page: 1, pageSize: 24 });
    expect(resolvePagination(3, 10)).toEqual({ limit: 10, offset: 20, page: 3, pageSize: 10 });
  });

  it("clamps defensively", () => {
    expect(resolvePagination(0, 1000)).toEqual({ limit: 48, offset: 0, page: 1, pageSize: 48 });
  });
});

describe("resolveStyleScope", () => {
  it("returns null when no style/family filter", async () => {
    expect(await resolveStyleScope({})).toBeNull();
  });

  it("maps a styleKey/code to its fixture id", async () => {
    const sample = beerStyleFixtures[0];
    const scope = await resolveStyleScope({ styleCode: sample.styleKey ?? sample.bjcpId });
    expect(scope).toContain(sample.id);
  });

  it("returns [] for an unknown family (no rows, no crash)", async () => {
    expect(await resolveStyleScope({ family: "___no_such_family___" })).toEqual([]);
  });

  it("maps a real /bjcp family to a non-empty set of known fixture ids", async () => {
    const catalog = await getBjcpCatalogData();
    const family = catalog.families.find((entry) => entry.styleIds.length > 0);
    expect(family).toBeTruthy();

    const scope = await resolveStyleScope({ family: family!.id });
    expect(scope).not.toBeNull();
    expect(scope!.length).toBeGreaterThan(0);

    const knownIds = new Set(beerStyleFixtures.map((style) => style.id));
    for (const id of scope!) {
      expect(knownIds.has(id)).toBe(true);
    }
  });
});

describe("resolveTextSearchScope", () => {
  it("пустой/пробельный q -> пустой scope (без похода в каталог)", async () => {
    expect(await resolveTextSearchScope(undefined)).toEqual({ titleVariants: [], styleIds: [] });
    expect(await resolveTextSearchScope("   ")).toEqual({ titleVariants: [], styleIds: [] });
  });

  it("«пил» -> среди вариантов title есть и «пилснер», и «pilsner» (для «Летнего пилснера» и «Pilsner Urquell»)", async () => {
    const scope = await resolveTextSearchScope("пил");
    expect(scope.titleVariants).toContain("пилснер");
    expect(scope.titleVariants).toContain("pilsner");
  });

  it("«вайцен»/«weizen» -> уверенный матч по стилю 10A (Weissbier/Weizen, напр. Weihenstephaner)", async () => {
    const style10A = beerStyleFixtures.find((style) => (style.styleKey ?? style.bjcpId) === "10A");
    expect(style10A).toBeTruthy();

    const ruScope = await resolveTextSearchScope("вайцен");
    expect(ruScope.styleIds).toContain(style10A!.id);

    const enScope = await resolveTextSearchScope("weizen");
    expect(enScope.styleIds).toContain(style10A!.id);
  });

  it("случайный мусор не тащит стили (нет fuzzy-матча по стилю)", async () => {
    const scope = await resolveTextSearchScope("zzzqwerty12345");
    expect(scope.styleIds).toEqual([]);
  });

  it("«gbkcyth» (раскладка «пилснер») без includeLayoutVariants не даёт пилснер-вариантов", async () => {
    const scope = await resolveTextSearchScope("gbkcyth");
    expect(scope.titleVariants).not.toContain("пилснер");
    expect(scope.titleVariants).not.toContain("pilsner");
  });

  it("«gbkcyth» с includeLayoutVariants:true находит пилснер-варианты вторым проходом", async () => {
    const scope = await resolveTextSearchScope("gbkcyth", { includeLayoutVariants: true });
    expect(scope.titleVariants).toContain("пилснер");
    expect(scope.titleVariants).toContain("pilsner");
  });

  // Ф3 (P1 ревью волны 4): короткие запросы («и», «s») давали случайные стили через
  // prefix-скоринг без нижнего порога длины — «и» матчил ['2A','2B','2C','15A','15B','15C'].
  it("однобуквенный запрос («и»/«s») не матчит стиль — длина ниже порога 3 символов", async () => {
    expect((await resolveTextSearchScope("и")).styleIds).toEqual([]);
    expect((await resolveTextSearchScope("s")).styleIds).toEqual([]);
  });

  it("двухбуквенный запрос тоже не матчит стиль", async () => {
    expect((await resolveTextSearchScope("во")).styleIds).toEqual([]);
  });

  // Ф8 (регрессия волны 4, живой прогон): «и» транслитерировалось в «i» через
  // buildBjcpQueryVariants, а ilike '%i%' по title/author матчил почти все
  // опубликованные рецепты (44/44 вместо честного substring-совпадения по «и»).
  // Ниже порога MIN_QUERY_EXPANSION_LENGTH варианты вообще не расширяются.
  it("«и» -> titleVariants ровно [\"и\"], без транслита/синонимов", async () => {
    const scope = await resolveTextSearchScope("и");
    expect(scope.titleVariants).toEqual(["и"]);
    expect(scope.styleIds).toEqual([]);
  });

  it("«и» с includeLayoutVariants:true тоже даёт ровно [\"и\"] (раскладочный фолбэк не подключается для коротких запросов)", async () => {
    const scope = await resolveTextSearchScope("и", { includeLayoutVariants: true });
    expect(scope.titleVariants).toEqual(["и"]);
    expect(scope.styleIds).toEqual([]);
  });

  it("двухбуквенный «пи» -> titleVariants ровно [\"пи\"] (тоже ниже порога расширения)", async () => {
    const scope = await resolveTextSearchScope("пи");
    expect(scope.titleVariants).toEqual(["пи"]);
    expect(scope.styleIds).toEqual([]);
  });

  // Ф4 (P1 ревью волны 4): чисто пунктуационный запрос не должен молча терять
  // текстовое условие — иначе buildTextSearchCondition вернёт null и поиск отдаст
  // ВСЕ рецепты вместо ожидаемого «ничего не нашлось».
  it("«???» -> titleVariants=[\"???\"] (буквальный литерал, SQL-условие не пропадает)", async () => {
    const scope = await resolveTextSearchScope("???");
    expect(scope.titleVariants).toEqual(["???"]);
    expect(scope.styleIds).toEqual([]);
  });

  it("«...» и «-» тоже дают буквальный titleVariant, а не пустой scope", async () => {
    expect((await resolveTextSearchScope("...")).titleVariants).toEqual(["..."]);
    expect((await resolveTextSearchScope("-")).titleVariants).toEqual(["-"]);
  });

  // Ф6 (P2 ревью волны 4): общий кап 16 вариантов, включая раскладочный фолбэк —
  // без него OR-цепочка ilike в фолбэк-проходе не ограничена.
  it("общий набор вариантов (с includeLayoutVariants) не превышает капа 16", async () => {
    const withoutLayout = await resolveTextSearchScope("пил");
    const withLayout = await resolveTextSearchScope("пил", { includeLayoutVariants: true });
    expect(withoutLayout.titleVariants.length).toBeLessThanOrEqual(16);
    expect(withLayout.titleVariants.length).toBeLessThanOrEqual(16);
  });
});
