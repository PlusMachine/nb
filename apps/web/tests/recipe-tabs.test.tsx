import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usePathname: vi.fn(() => "/app/recipes")
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname
}));

import { RecipeTabs } from "../components/recipes/recipe-tabs";

const renderTabs = () => renderToStaticMarkup(React.createElement(RecipeTabs));

/**
 * HTML одной ссылки-таба по её href (нежадно до закрывающего </a>). Порядок
 * атрибутов у `<a>` зависит от того, задан ли aria-current, поэтому href ищем
 * где угодно внутри открывающего тега, а не только первым атрибутом.
 */
const linkHtml = (html: string, href: string): string => {
  const match = html.match(new RegExp(`<a [^>]*href="${href}"[^>]*>.*?</a>`));
  if (!match) {
    throw new Error(`tab link with href="${href}" not found in: ${html}`);
  }
  return match[0];
};

describe("RecipeTabs", () => {
  afterEach(() => {
    mocks.usePathname.mockReset();
  });

  it('marks "Найти" (уходит из рабочей зоны на витрину) иконкой-стрелкой', () => {
    mocks.usePathname.mockReturnValue("/app/recipes");
    const html = renderTabs();
    const findTab = linkHtml(html, "/recipes");
    expect(findTab).toContain("svg");
    expect(findTab).toContain("lucide");
  });

  it('не помечает "Мои" и "Сохранённые" (остаются в рабочей зоне)', () => {
    mocks.usePathname.mockReturnValue("/app/recipes");
    const html = renderTabs();
    expect(linkHtml(html, "/app/recipes")).not.toContain("svg");
    expect(linkHtml(html, "/app/saved")).not.toContain("svg");
  });

  it("активный таб получает aria-current=\"page\", остальные — нет", () => {
    mocks.usePathname.mockReturnValue("/app/saved");
    const html = renderTabs();
    expect(linkHtml(html, "/app/saved")).toContain('aria-current="page"');
    expect(linkHtml(html, "/app/recipes")).not.toContain("aria-current");
    expect(linkHtml(html, "/recipes")).not.toContain("aria-current");
  });
});
