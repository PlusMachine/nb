import { describe, expect, it } from "vitest";

import robots from "../app/robots";

// robots.ts всегда возвращает единственный rules-объект (не массив per-UA
// правил) — приводим тип точечно, чтобы не городить guard на объединении типов
// next.js (RobotsFile.rules: RuleObject | RuleObject[]).
const rulesOf = () => robots().rules as { allow?: string | string[]; disallow?: string | string[] };
const asArray = (value: string | string[] | undefined) => ([] as string[]).concat(value ?? []);

describe("robots", () => {
  it("закрывает приватные, служебные и технические пути от индексации", () => {
    const disallow = asArray(rulesOf().disallow);

    const expectedDisallow = [
      "/api/",
      "/app",
      "/admin",
      "/login",
      "/profile",
      "/settings",
      "/recipes/id/",
      "/catalog/new",
      "/catalog/custom/",
      "/ui-playground",
      "/offline"
    ];

    for (const path of expectedDisallow) {
      expect(disallow, `disallow должен содержать ${path}`).toContain(path);
    }
  });

  it("явно открывает фото рецептов краулеру картинок, несмотря на общий disallow /api/", () => {
    const allow = asArray(rulesOf().allow);

    expect(allow).toContain("/api/recipe-images/");
  });

  it("не задаёт мёртвую директиву host", () => {
    expect(robots().host).toBeUndefined();
  });

  it("указывает на sitemap.xml по APP_URL", () => {
    expect(robots().sitemap).toBe("http://localhost:3000/sitemap.xml");
  });
});
