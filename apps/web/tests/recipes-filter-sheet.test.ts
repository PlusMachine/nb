import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ navState: { searchParams: "" } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/recipes",
  useSearchParams: () => new URLSearchParams(mocks.navState.searchParams)
}));

import { RecipesFilterControls } from "../components/recipes/recipes-filter-controls";
import { RecipesFilterSheet } from "../components/recipes/recipes-filter-sheet";
import type { RecipeStyleSearchIndex } from "../features/recipes/style-search";

const index: RecipeStyleSearchIndex = {
  families: [
    { id: "ipa_hoppy", nameRu: "IPA и хмелевые", nameEn: "IPA & Hoppy", styleCount: 12, sortOrder: 3 },
    { id: "stout_porter", nameRu: "Стауты и портеры", nameEn: "Stouts & Porters", styleCount: 9, sortOrder: 7 }
  ],
  styles: [
    { code: "21A", title: "American IPA", titleEn: "American IPA", familyIds: ["ipa_hoppy"], familyNameRu: "IPA и хмелевые" },
    { code: "20A", title: "American Porter", titleEn: "American Porter", familyIds: ["stout_porter"], familyNameRu: "Стауты и портеры" }
  ]
};

const familyCounts: Record<string, number> = { ipa_hoppy: 2, stout_porter: 4 };

beforeEach(() => {
  mocks.navState.searchParams = "";
});

describe("RecipesFilterControls", () => {
  it("renders the family list, style search, colour scale, ABV/IBU sliders and a reset button", () => {
    const html = renderToStaticMarkup(React.createElement(RecipesFilterControls, { index, familyCounts }));

    expect(html).toContain("Семейство"); // список семейств
    expect(html).toContain("Все семейства");
    expect(html).toContain("IPA и хмелевые");
    expect(html).toContain("Поиск стиля"); // отдельное поле поиска стиля
    expect(html).toContain("Цвет пива");
    expect(html).toContain("Соломенный, SRM 0–3"); // a11y-метка цветовой шкалы
    expect(html).toContain("ABV");
    expect(html).toContain("IBU");
    expect(html).toContain("Сбросить фильтры");
  });
});

describe("RecipesFilterSheet trigger", () => {
  it("renders the closed trigger with an accessible label and no dialog markup", () => {
    const html = renderToStaticMarkup(React.createElement(RecipesFilterSheet, { index, familyCounts }));
    expect(html).toContain('aria-label="Открыть фильтры"');
    // Закрытый sheet не рендерит диалог.
    expect(html).not.toContain('role="dialog"');
  });

  it("shows the active-filter count badge from the URL", () => {
    mocks.navState.searchParams = "q=ipa&abvMin=5&family=ipa_hoppy";
    const html = renderToStaticMarkup(React.createElement(RecipesFilterSheet, { index, familyCounts }));
    expect(html).toContain(">3<"); // q + abv + family
  });
});
