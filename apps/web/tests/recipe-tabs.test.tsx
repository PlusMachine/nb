import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usePathname: vi.fn(() => "/app/recipes"),
  // По умолчанию — вне brew-режима (пустые search-параметры); тест на
  // сохранение ?intent=brew подставляет своё значение.
  useSearchParams: vi.fn(() => new URLSearchParams())
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
  useSearchParams: mocks.useSearchParams
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
    mocks.useSearchParams.mockReset();
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
  });

  it('marks "Найти" (уходит из рабочей зоны на витрину) иконкой-стрелкой', () => {
    mocks.usePathname.mockReturnValue("/app/recipes");
    const html = renderTabs();
    const findTab = linkHtml(html, "/recipes");
    expect(findTab).toContain("svg");
    expect(findTab).toContain("lucide");
  });

  it('не помечает "Мои" и "Закладки" (остаются в рабочей зоне)', () => {
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

  // Ф1: на /app/recipes?intent=brew таб «Мои» указывает на тот же маршрут —
  // без сохранения параметра клик по нему (пусть и по уже активному табу)
  // тихо вернул бы из выбора рецепта для варки в обычное управление.
  it("в brew-режиме таб «Мои» сохраняет ?intent=brew, остальные — нет", () => {
    mocks.usePathname.mockReturnValue("/app/recipes");
    mocks.useSearchParams.mockReturnValue(new URLSearchParams("intent=brew"));
    const html = renderTabs();
    expect(linkHtml(html, "/app/recipes\\?intent=brew")).toContain(">Мои<");
    expect(linkHtml(html, "/app/saved")).toContain(">Закладки<");
    expect(linkHtml(html, "/recipes")).toContain(">Найти<");
  });

  it("вне brew-режима таб «Мои» ведёт на голый /app/recipes без параметров", () => {
    mocks.usePathname.mockReturnValue("/app/recipes");
    const html = renderTabs();
    expect(linkHtml(html, "/app/recipes")).toContain(">Мои<");
  });
});
