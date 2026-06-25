import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ navState: { searchParams: "" } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/recipes",
  useSearchParams: () => new URLSearchParams(mocks.navState.searchParams)
}));

import { RecipeStylePicker } from "../components/recipes/recipe-style-picker";
import type { RecipeStyleSearchIndex } from "../features/recipes/style-search";

const index: RecipeStyleSearchIndex = {
  families: [
    { id: "pale_lagers", nameRu: "Лагеры · светлые", nameEn: "Pale Lagers", styleCount: 8, sortOrder: 1 },
    { id: "ipa_hoppy", nameRu: "IPA и хмелевые", nameEn: "IPA & Hoppy", styleCount: 12, sortOrder: 3 },
    { id: "empty_family", nameRu: "Пустое семейство", nameEn: "Empty", styleCount: 4, sortOrder: 9 }
  ],
  styles: [
    { code: "21A", title: "American IPA", titleEn: "American IPA", familyIds: ["ipa_hoppy"], familyNameRu: "IPA и хмелевые" }
  ]
};

// Реальные числа рецептов на витрине: empty_family отсутствует → 0 → скрыто.
const familyCounts: Record<string, number> = { pale_lagers: 3, ipa_hoppy: 5 };

const render = () =>
  renderToStaticMarkup(React.createElement(RecipeStylePicker, { index, familyCounts }));

beforeEach(() => {
  mocks.navState.searchParams = "";
});

describe("RecipeStylePicker — family list", () => {
  it("renders «Все семейства» plus a full-width row per non-empty family with recipe counts", () => {
    const html = render();
    expect(html).toContain("Семейство");
    expect(html).toContain("Все семейства");
    expect(html).toContain("Лагеры · светлые");
    expect(html).toContain("IPA и хмелевые");
    // Реальные числа рецептов (а не styleCount из справочника).
    expect(html).toContain(">3<");
    expect(html).toContain(">5<");
    // styleCount каталога (8/12) больше не показываем.
    expect(html).not.toContain(">8<");
    expect(html).not.toContain(">12<");
  });

  it("hides families with zero recipes on the page", () => {
    const html = render();
    expect(html).not.toContain("Пустое семейство");
  });

  it("marks «Все семейства» active when nothing is selected", () => {
    // Первая строка (Все семейства) — нажата.
    expect(render()).toContain('aria-pressed="true"');
  });

  it("marks the selected family active", () => {
    mocks.navState.searchParams = "family=ipa_hoppy";
    const html = render();
    // Активная строка семейства присутствует.
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("IPA и хмелевые");
  });
});

describe("RecipeStylePicker — style search", () => {
  it("shows an always-visible search field (no disclosure toggle)", () => {
    const html = render();
    expect(html).toContain("Поиск стиля");
    expect(html).toContain("American IPA"); // placeholder
    expect(html).not.toContain("aria-expanded");
  });

  it("renders the selected style as a removable row when no query is typed", () => {
    mocks.navState.searchParams = "style=21A";
    const html = render();
    expect(html).toContain(">21A<"); // код в отдельном span
    expect(html).toContain("American IPA");
    expect(html).toContain("Убрать стиль");
  });
});
