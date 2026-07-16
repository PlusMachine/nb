import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@nb/ui";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement("img", { src: props.src as string, alt: (props.alt as string) ?? "" })
}));

// RecipeSaveButton (внутри карточки) использует useRouter()/useToast() — нужны роутер и провайдер.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined })
}));

import { RecipeCard } from "../components/recipes/recipe-card";
import type { PublicRecipeListItem } from "../features/recipes/contracts";

const renderCard = (recipe: PublicRecipeListItem) => (
  renderToStaticMarkup(React.createElement(ToastProvider, null, React.createElement(RecipeCard, { recipe, preferredGravityUnit: "sg" })))
);

const baseItem = (overrides: Partial<PublicRecipeListItem> = {}): PublicRecipeListItem => ({
  id: "r-1",
  slug: "hazy-ipa",
  name: "Hazy IPA",
  author: { id: "u-1", displayName: "Alice Brewer", image: null },
  style: { code: "21A", name: "American IPA" },
  styleHref: "/bjcp/bjcp-21a-american-ipa",
  og: 1.048,
  fg: 1.012,
  abv: 6.2,
  ibu: 45,
  colorSrm: 9.5,
  colorEbc: 19,
  batchSizeL: 20,
  method: null,
  heroImage: null,
  styleImageUrl: null,
  cloneCount: 0,
  rating: null,
  featured: false,
  saveCount: 0,
  publishedAt: "2026-02-01T00:00:00.000Z",
  createdAt: new Date().toISOString(),
  ...overrides
});

describe("RecipeCard", () => {
  it("links to the recipe detail page with the recipe name as accessible text", () => {
    const html = renderCard(baseItem());
    expect(html).toContain('href="/recipes/hazy-ipa"');
    expect(html).toContain("Hazy IPA");
    expect(html).toContain("American IPA · 21A");
  });

  it("renders a color gradient fallback (no image) in the thumb, with SRM in the stat grid", () => {
    const html = renderCard(baseItem());
    expect(html).not.toContain("<img");
    // Компактная миниатюра без фото/стиля не несёт текстовую метку цвета — цвет
    // (число + точка) теперь показывается ячейкой в статах, не поверх обложки.
    expect(html).toContain("SRM");
    expect(html).toContain("9.5");
  });

  it("renders the hero image sharply, without a text overlay on the tiny thumb", () => {
    const html = renderCard(baseItem({ heroImage: { thumbUrl: "/api/recipe-images/img-1/thumb", blurDataUrl: null } }));
    expect(html).toContain('src="/api/recipe-images/img-1/thumb"');
    // Цвет всё ещё виден — ячейкой в статах, а не подписью на миниатюре.
    expect(html).toContain("9.5");
  });

  it("falls back to the lightly blurred BJCP style photo when there is no hero image", () => {
    const html = renderCard(baseItem({ styleImageUrl: "/images/bjcp/21A%20American%20IPA.png" }));
    expect(html).toContain('src="/images/bjcp/21A%20American%20IPA.png"');
    expect(html).toContain("blur"); // лёгкое размытие фото стиля (не выдаём его за фото рецепта)
    expect(html).toContain("9.5"); // цвет всё ещё виден — ячейкой в статах
  });

  it("prefers the recipe hero image over the BJCP style photo", () => {
    const html = renderCard(baseItem({
      heroImage: { thumbUrl: "/api/recipe-images/img-1/thumb", blurDataUrl: null },
      styleImageUrl: "/images/bjcp/21A%20American%20IPA.png"
    }));
    expect(html).toContain('src="/api/recipe-images/img-1/thumb"');
    expect(html).not.toContain("/images/bjcp/21A");
  });

  it("shows the «Новый» badge for a recently created recipe without rating", () => {
    const html = renderCard(baseItem());
    expect(html).toContain("Новый");
  });

  it("does not show «Новый» for an older recipe without rating", () => {
    const html = renderCard(baseItem({ createdAt: "2020-01-01T00:00:00.000Z" }));
    expect(html).not.toContain("Новый");
  });

  it("links the style chip to the BJCP style page when styleHref is present", () => {
    const html = renderCard(baseItem());
    expect(html).toContain('href="/bjcp/bjcp-21a-american-ipa"');
    expect(html).toContain("American IPA · 21A");
  });

  it("renders the style chip as plain text when styleHref is null", () => {
    const html = renderCard(baseItem({ styleHref: null }));
    expect(html).toContain("American IPA · 21A");
    expect(html).not.toContain('href="/bjcp/');
  });

  it("shows a rating with RU-formatted average when present", () => {
    const html = renderCard(baseItem({ rating: { average: 4.7, count: 18 } }));
    expect(html).toContain("4,7");
    expect(html).toContain("(18)");
    expect(html).not.toContain("Новый");
  });

  it("formats the stat row (ABV dot, OG gravity, volume in litres)", () => {
    const html = renderCard(baseItem());
    expect(html).toContain("6.2 %"); // ABV — точка (Ф13: единый разделитель показателей)
    expect(html).toContain("45"); // IBU
    expect(html).toContain("1.048"); // OG — gravity dot
    expect(html).toContain("20 л"); // volume
  });

  it("renders dashes for missing numeric stats and no style badge when style is null", () => {
    const html = renderCard(baseItem({ abv: null, ibu: null, og: null, batchSizeL: null, style: null }));
    expect(html).not.toContain("·"); // style badge absent
    expect(html).toContain("—");
  });
});
