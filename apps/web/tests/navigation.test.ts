import { describe, expect, it } from "vitest";

import {
  isPublicPath,
  isWideContentRoute,
  resolveAppNavGroups,
  resolveContentWidthClass,
  type AppChromeUser
} from "../lib/navigation";

describe("isWideContentRoute", () => {
  it("расширяет только точный /recipes", () => {
    expect(isWideContentRoute("/recipes")).toBe(true);
  });

  it("не расширяет каталог", () => {
    expect(isWideContentRoute("/catalog")).toBe(false);
  });

  it("не расширяет рабочую зону рецептов", () => {
    expect(isWideContentRoute("/app/recipes")).toBe(false);
  });

  it("не расширяет вложенные пути /recipes/*", () => {
    expect(isWideContentRoute("/recipes/123")).toBe(false);
  });
});

describe("isPublicPath", () => {
  it.each([
    "/",
    "/recipes",
    "/recipes/abc",
    "/catalog",
    "/catalog/hops",
    "/bjcp/1a",
    "/legal/terms",
    "/articles",
    "/calculators"
  ])("%s — публичный путь", (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  it.each(["/app", "/app/recipes", "/app/ingredients", "/profile", "/admin"])(
    "%s — не публичный путь",
    (pathname) => {
      expect(isPublicPath(pathname)).toBe(false);
    }
  );
});

describe("resolveContentWidthClass", () => {
  it("расширяет /recipes-браузер под ультраширокие", () => {
    expect(resolveContentWidthClass("/recipes")).toBe("max-w-7xl 2xl:max-w-[1600px]");
  });

  it.each(["/bjcp/1a", "/catalog", "/articles", "/calculators", "/login", "/"])(
    "%s — витринная ширина 7xl (одинаково в обеих зонах)",
    (pathname) => {
      expect(resolveContentWidthClass(pathname)).toBe("max-w-7xl");
    }
  );

  it.each(["/app", "/app/recipes", "/app/ingredients", "/profile", "/settings"])(
    "%s — компактная ширина рабочей зоны 6xl",
    (pathname) => {
      expect(resolveContentWidthClass(pathname)).toBe("max-w-6xl");
    }
  );
});

describe("resolveAppNavGroups", () => {
  const baseUser: AppChromeUser = { email: "u@example.com", displayName: "U" };
  const hrefs = (user: AppChromeUser) =>
    resolveAppNavGroups(user)
      .flat()
      .map((item) => item.href);

  it("без профиля мастера «Моя витрина» скрыта, маркет /market доступен", () => {
    const items = hrefs(baseUser);
    expect(items).not.toContain("/app/master");
    expect(items).toContain("/market");
  });

  it("с профилем мастера «Моя витрина» видна", () => {
    expect(hrefs({ ...baseUser, hasMasterProfile: true })).toContain("/app/master");
  });

  it("не оставляет пустых групп (двойной разделитель)", () => {
    for (const group of resolveAppNavGroups(baseUser)) {
      expect(group.length).toBeGreaterThan(0);
    }
  });
});
