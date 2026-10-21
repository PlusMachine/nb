import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalculatorVerificationBadge } from "../components/calculators/calculator-verification-badge";
import { allCalculatorSlugs, publishedCalculatorSlugs, verifiedCalculatorSlugs } from "../features/calculators/catalog";
import { canViewCalculator, getVisibleCalculatorSlugs, isVisibleCalculatorLink } from "../features/calculators/visibility";

afterEach(() => vi.unstubAllEnvs());

describe("видимость калькуляторов", () => {
  it("сохраняет исходные ручные отметки владельца", () => {
    expect(verifiedCalculatorSlugs).toEqual([
      "abv-attenuation", "refractometer-correction", "hydrometer-correction", "unit-converter", "keg-carbonation"
    ]);
  });

  it("в dev весь реестр доступен гостю", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getVisibleCalculatorSlugs()).toEqual(allCalculatorSlugs);
  });

  it.each([null, "user", "editor", "moderator"])("production: роль %s видит только проверенные и опубликованные", (role) => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getVisibleCalculatorSlugs(role)).toHaveLength(5);
    expect(canViewCalculator("abv-attenuation", role)).toBe(true);
    expect(canViewCalculator("ibu", role)).toBe(false);
  });

  it("production: admin видит весь реестр", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getVisibleCalculatorSlugs("admin")).toEqual(allCalculatorSlugs);
  });

  it("проверка не заменяет публикацию, а публикация не заменяет проверку", () => {
    vi.stubEnv("NODE_ENV", "production");
    const original = [...publishedCalculatorSlugs];
    try {
      publishedCalculatorSlugs.splice(publishedCalculatorSlugs.indexOf("abv-attenuation"), 1);
      publishedCalculatorSlugs.push("ibu");
      for (const slug of ["abv-attenuation", "ibu"]) {
        expect(canViewCalculator(slug, "user")).toBe(false);
        expect(canViewCalculator(slug, "admin")).toBe(true);
      }
    } finally {
      publishedCalculatorSlugs.splice(0, publishedCalculatorSlugs.length, ...original);
    }
  });

  it.each(["development", "production"])("несуществующий slug закрыт даже администратору в %s", (env) => {
    vi.stubEnv("NODE_ENV", env);
    for (const slug of ["unknown", "__proto__", "constructor", "toString"]) {
      expect(canViewCalculator(slug, "admin")).toBe(false);
    }
  });

  it("фильтрует связанные ссылки с query и share, сохраняя внешние разделы", () => {
    vi.stubEnv("NODE_ENV", "production");
    const slugs = getVisibleCalculatorSlugs();
    expect(isVisibleCalculatorLink("/calculators/ibu?volume=20", slugs)).toBe(false);
    expect(isVisibleCalculatorLink("/calculators/ibu/share?volume=20", slugs)).toBe(false);
    expect(isVisibleCalculatorLink("/calculators/abv-attenuation?og=1.050", slugs)).toBe(true);
    expect(isVisibleCalculatorLink("/recipes", slugs)).toBe(true);
  });
});

describe("служебная отметка проверки", () => {
  it("в dev показывает отметку только проверенным", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(renderToStaticMarkup(<CalculatorVerificationBadge slug="abv-attenuation" />)).toContain("✓ проверен");
    expect(renderToStaticMarkup(<CalculatorVerificationBadge slug="ibu" />)).toBe("");
  });

  it("в production не показывает отметку", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(renderToStaticMarkup(<CalculatorVerificationBadge slug="abv-attenuation" />)).toBe("");
  });
});
