import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ navState: { searchParams: "" } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/recipes",
  useSearchParams: () => new URLSearchParams(mocks.navState.searchParams)
}));

import { RecipesColorScale } from "../components/recipes/recipes-color-scale";

beforeEach(() => {
  mocks.navState.searchParams = "";
});

describe("RecipesColorScale", () => {
  it("renders 7 selectable colour segments with accessible labels", () => {
    const html = renderToStaticMarkup(React.createElement(RecipesColorScale));
    expect(html).toContain("Цвет пива");
    // Названия оттенков как a11y-метки (цвет не единственный сигнал).
    expect(html).toContain("Соломенный, SRM 0–3");
    expect(html).toContain("Чёрный, SRM 30–80");
    // Все сегменты — кнопки-переключатели.
    expect(html.match(/aria-pressed/g)?.length).toBe(7);
  });

  it("shows «Любой цвет» when nothing is selected", () => {
    const html = renderToStaticMarkup(React.createElement(RecipesColorScale));
    expect(html).toContain("Любой цвет");
  });

  it("marks the active band when colorMin/colorMax match", () => {
    mocks.navState.searchParams = "colorMin=6&colorMax=9";
    const html = renderToStaticMarkup(React.createElement(RecipesColorScale));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Янтарный");
    expect(html).toContain("SRM 6–9");
  });
});
