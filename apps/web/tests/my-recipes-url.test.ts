import { describe, expect, it } from "vitest";

import {
  mergeMyRecipesQuery,
  parseMyRecipesQuery,
  parseMyRecipesSort,
  parseMyRecipesStatus,
  parseMyRecipesView
} from "../features/recipes/my-recipes-url";

describe("parseMyRecipesView", () => {
  it("принимает grid/list", () => {
    expect(parseMyRecipesView("grid")).toBe("grid");
    expect(parseMyRecipesView("list")).toBe("list");
  });

  it("мусор/отсутствие → null", () => {
    expect(parseMyRecipesView("table")).toBeNull();
    expect(parseMyRecipesView(undefined)).toBeNull();
    expect(parseMyRecipesView(null)).toBeNull();
    expect(parseMyRecipesView("")).toBeNull();
  });
});

describe("parseMyRecipesQuery", () => {
  it("возвращает строку как есть", () => {
    expect(parseMyRecipesQuery("ipa")).toBe("ipa");
  });

  it("берёт первое значение из массива", () => {
    expect(parseMyRecipesQuery(["stout", "porter"])).toBe("stout");
  });

  it("отсутствие/не-строка → пустая строка", () => {
    expect(parseMyRecipesQuery(undefined)).toBe("");
    expect(parseMyRecipesQuery(null)).toBe("");
    expect(parseMyRecipesQuery([])).toBe("");
  });
});

describe("parseMyRecipesSort", () => {
  it("принимает все валидные значения", () => {
    expect(parseMyRecipesSort("updated")).toBe("updated");
    expect(parseMyRecipesSort("brewable")).toBe("brewable");
    expect(parseMyRecipesSort("name")).toBe("name");
    expect(parseMyRecipesSort("abv")).toBe("abv");
    expect(parseMyRecipesSort("ibu")).toBe("ibu");
  });

  it("мусор/отсутствие → null", () => {
    expect(parseMyRecipesSort("popular")).toBeNull();
    expect(parseMyRecipesSort(undefined)).toBeNull();
    expect(parseMyRecipesSort(null)).toBeNull();
    expect(parseMyRecipesSort("")).toBeNull();
  });
});

describe("parseMyRecipesStatus", () => {
  it("принимает все валидные значения", () => {
    expect(parseMyRecipesStatus("all")).toBe("all");
    expect(parseMyRecipesStatus("published")).toBe("published");
    expect(parseMyRecipesStatus("private")).toBe("private");
  });

  it("мусор/отсутствие → null", () => {
    expect(parseMyRecipesStatus("draft")).toBeNull();
    expect(parseMyRecipesStatus(undefined)).toBeNull();
    expect(parseMyRecipesStatus(null)).toBeNull();
    expect(parseMyRecipesStatus("")).toBeNull();
  });
});

describe("mergeMyRecipesQuery", () => {
  it("сохраняет intent=brew и незнакомые параметры", () => {
    const qs = mergeMyRecipesQuery(
      "?intent=brew&foo=bar",
      { q: "ipa", sort: "brewable", status: "all" },
      "updated"
    );
    const params = new URLSearchParams(qs);
    expect(params.get("intent")).toBe("brew");
    expect(params.get("foo")).toBe("bar");
    expect(params.get("q")).toBe("ipa");
    expect(params.get("sort")).toBe("brewable");
  });

  it("удаляет дефолты: пустой q (после trim), sort === defaultSort, status === \"all\"", () => {
    const qs = mergeMyRecipesQuery(
      "?q=old&sort=name&status=published",
      { q: "   ", sort: "updated", status: "all" },
      "updated"
    );
    expect(qs).toBe("");
  });

  it("ставит недефолтные значения", () => {
    const qs = mergeMyRecipesQuery("", { q: "stout", sort: "name", status: "private" }, "updated");
    const params = new URLSearchParams(qs);
    expect(params.get("q")).toBe("stout");
    expect(params.get("sort")).toBe("name");
    expect(params.get("status")).toBe("private");
  });

  it("пустой currentSearch + дефолтные значения → пустая строка", () => {
    expect(mergeMyRecipesQuery("", { q: "", sort: "updated", status: "all" }, "updated")).toBe("");
  });

  it("не теряет закодированные значения (кириллица, пробелы)", () => {
    const qs = mergeMyRecipesQuery(
      "?intent=brew",
      { q: "ипа престиж", sort: "updated", status: "all" },
      "updated"
    );
    const params = new URLSearchParams(qs);
    expect(params.get("q")).toBe("ипа престиж");
    expect(params.get("intent")).toBe("brew");
  });
});
