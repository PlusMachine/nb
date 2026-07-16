import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ToastProvider } from "@nb/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicRecipeListItem } from "@/features/recipes/contracts";

// React 18 (используемый в vitest/node) не экспортирует `cache` — полифиллим
// identity-обёрткой, иначе импорт страницы падает на этапе загрузки модуля
// (тот же приём, что в articles-detail-page-wiring.test.ts).
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: actual.cache ?? (<T extends (...args: any[]) => any>(fn: T) => fn)
  };
});

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement("img", { src: props.src as string, alt: (props.alt as string) ?? "" })
}));

const mocks = vi.hoisted(() => ({
  listPublicRecipesForStyle: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  })
}));

vi.mock("@/features/recipes/service", () => ({
  listPublicRecipesForStyle: mocks.listPublicRecipesForStyle
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/bjcp/bjcp-1a-american-light-lager",
  useSearchParams: () => new URLSearchParams(),
  notFound: mocks.notFound,
  permanentRedirect: mocks.permanentRedirect
}));

const recipeFixture = (overrides: Partial<PublicRecipeListItem> = {}): PublicRecipeListItem => ({
  id: "r-1",
  slug: "hazy-lager",
  name: "Hazy Light Lager",
  author: { id: "u-1", displayName: "Alice", image: null },
  style: { code: "1A", name: "American Light Lager" },
  styleHref: "/bjcp/bjcp-1a-american-light-lager",
  og: 1.032,
  fg: 1.006,
  abv: 3.6,
  ibu: 10,
  colorSrm: 2.5,
  colorEbc: 5,
  batchSizeL: 20,
  method: null,
  heroImage: null,
  styleImageUrl: null,
  cloneCount: 0,
  rating: null,
  featured: false,
  saveCount: 3,
  publishedAt: "2026-02-01T00:00:00.000Z",
  createdAt: "2026-02-01T00:00:00.000Z",
  ...overrides
});

beforeEach(() => {
  mocks.listPublicRecipesForStyle.mockReset();
  mocks.notFound.mockClear();
  mocks.permanentRedirect.mockClear();
  mocks.listPublicRecipesForStyle.mockResolvedValue({ items: [recipeFixture()], total: 1 });
});

describe("bjcp style page — legacy alias redirect", () => {
  it("redirects generateMetadata for a legacy alias slug to the canonical /bjcp/<slug>", async () => {
    const { generateMetadata } = await import("../app/(public)/bjcp/[slug]/page");

    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "bjcp-21b-rye-rye-ipa" }) })
    ).rejects.toThrow("NEXT_REDIRECT:/bjcp/bjcp-21b-rye-ipa");
    expect(mocks.permanentRedirect).toHaveBeenCalledWith("/bjcp/bjcp-21b-rye-ipa");
  });

  it("redirects the page body for the same legacy alias slug", async () => {
    const { default: BjcpStylePage } = await import("../app/(public)/bjcp/[slug]/page");

    await expect(
      BjcpStylePage({ params: Promise.resolve({ slug: "bjcp-21b-rye-rye-ipa" }) })
    ).rejects.toThrow("NEXT_REDIRECT:/bjcp/bjcp-21b-rye-ipa");
  });

  it("does not redirect for the canonical slug itself", async () => {
    const { generateMetadata } = await import("../app/(public)/bjcp/[slug]/page");

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "bjcp-21b-rye-ipa" }) });
    expect(mocks.permanentRedirect).not.toHaveBeenCalled();
    expect(metadata.alternates).toEqual({ canonical: "http://localhost:3000/bjcp/bjcp-21b-rye-ipa" });
  });

  it("calls notFound for a slug matching no article at all", async () => {
    const { generateMetadata } = await import("../app/(public)/bjcp/[slug]/page");

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "no-such-style-anywhere" }) });
    // Не найденный слаг — мягкая метадата "Стиль не найден", а не notFound() (см. код):
    // notFound() бросается только в теле страницы.
    expect(metadata.title).toBe("Стиль не найден");

    const { default: BjcpStylePage } = await import("../app/(public)/bjcp/[slug]/page");
    await expect(
      BjcpStylePage({ params: Promise.resolve({ slug: "no-such-style-anywhere" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("bjcp style page — OG/twitter image", () => {
  it("includes an absolute openGraph/twitter image for a style with a real hero photo", async () => {
    const { generateMetadata } = await import("../app/(public)/bjcp/[slug]/page");

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "bjcp-1a-american-light-lager" }) });
    expect(metadata.openGraph?.images).toEqual([
      { url: "http://localhost:3000/images/bjcp/1A%20%E2%80%94%20American%20Light%20Lager.png", alt: expect.any(String) }
    ]);
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect((metadata.twitter as any)?.images).toEqual(["http://localhost:3000/images/bjcp/1A%20%E2%80%94%20American%20Light%20Lager.png"]);
  });

  // Реальный контент: сейчас у всех 128 стилей есть свой синхронизированный hero
  // (см. public/images/bjcp) — сценарий "только плейсхолдер" покрыт отдельным
  // файлом bjcp-style-page-placeholder-image.test.ts с мокнутым @nb/content,
  // а не подбором стиля без фото (список фото меняется независимо от этого теста).
});

describe("bjcp style page — render", () => {
  it("renders breadcrumbs without ?view=, a matching BreadcrumbList JSON-LD, and an Article JSON-LD without fictitious dates", async () => {
    mocks.listPublicRecipesForStyle.mockResolvedValue({ items: [], total: 0 });
    const { default: BjcpStylePage } = await import("../app/(public)/bjcp/[slug]/page");

    const view = await BjcpStylePage({ params: Promise.resolve({ slug: "bjcp-1a-american-light-lager" }) });
    const html = renderToStaticMarkup(React.createElement(ToastProvider, null, view));

    // Обе крошки ведут на чистый /bjcp — не на параметрическую копию хаба.
    expect(html).not.toContain("?view=bjcp");
    expect(html).not.toContain("category=");
    expect(html).toContain('href="/bjcp"');
    expect(html).toContain('aria-label="Breadcrumb"');

    expect(html).toContain("application/ld+json");
    expect(html).toContain("BreadcrumbList");
    expect(html).toContain("http://localhost:3000/bjcp\"");

    expect(html).toContain('"@type":"Article"');
    expect(html).toContain("mainEntityOfPage");
    expect(html).toContain("http://localhost:3000/bjcp/bjcp-1a-american-light-lager");
    expect(html).toContain("icon-512.png");
    expect(html).not.toContain("datePublished");
    expect(html).not.toContain("dateModified");
  });

  it("renders server-fetched style recipes (cards + /recipes/<slug> links) directly in the HTML", async () => {
    mocks.listPublicRecipesForStyle.mockResolvedValue({
      items: [recipeFixture({ id: "r-42", slug: "my-hazy-lager", name: "My Hazy Lager" })],
      total: 1
    });
    const { default: BjcpStylePage } = await import("../app/(public)/bjcp/[slug]/page");

    const view = await BjcpStylePage({ params: Promise.resolve({ slug: "bjcp-1a-american-light-lager" }) });
    const html = renderToStaticMarkup(React.createElement(ToastProvider, null, view));

    expect(mocks.listPublicRecipesForStyle).toHaveBeenCalledWith("1A", 6);
    expect(html).toContain('href="/recipes/my-hazy-lager"');
    expect(html).toContain("My Hazy Lager");
  });

  it("falls back to an empty recipes snapshot (no crash) when the DB call throws, e.g. on a DB-less SSG build", async () => {
    mocks.listPublicRecipesForStyle.mockRejectedValue(new Error("DB unavailable at build time"));
    const { default: BjcpStylePage } = await import("../app/(public)/bjcp/[slug]/page");

    const view = await BjcpStylePage({ params: Promise.resolve({ slug: "bjcp-1a-american-light-lager" }) });
    const html = renderToStaticMarkup(React.createElement(ToastProvider, null, view));

    expect(html).toContain("American Light Lager");
  });

  // Перелинковка стиль → калькуляторы (M8, P2 аудита): статичный набор ссылок
  // рядом с переходом по соседним стилям.
  it("renders links to relevant calculators next to the sibling-styles navigation", async () => {
    mocks.listPublicRecipesForStyle.mockResolvedValue({ items: [], total: 0 });
    const { default: BjcpStylePage } = await import("../app/(public)/bjcp/[slug]/page");

    const view = await BjcpStylePage({ params: Promise.resolve({ slug: "bjcp-1a-american-light-lager" }) });
    const html = renderToStaticMarkup(React.createElement(ToastProvider, null, view));

    expect(html).toContain("Калькуляторы");
    expect(html).toContain('href="/calculators/ibu"');
    expect(html).toContain('href="/calculators/abv-attenuation"');
    expect(html).toContain('href="/calculators/beer-color"');
    expect(html).toContain('href="/calculators/priming-sugar"');
  });
});
