import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentArticleDto, TiptapDoc } from "@/features/content-articles/contracts";

// React 18 (используемый в vitest/node) не экспортирует `cache` — это API
// React-канала, который Next.js полифиллит собственной сборкой React только
// внутри своего рантайма. [slug]/page.tsx использует `cache` для дедупа
// generateMetadata/страницы — под простым node-рендером в тестах его нужно
// подменить identity-обёрткой, иначе импорт страницы падает на этапе загрузки
// модуля (см. тот же приём в ingredient-catalog-metadata-ui.test.ts).
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: actual.cache ?? (<T extends (...args: any[]) => any>(fn: T) => fn)
  };
});

const bodyJson: TiptapDoc = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Первый шаг — санитайзинг оборудования." }] }
  ]
};

const publishedArticle: ContentArticleDto = {
  id: "article-1",
  type: "guide",
  status: "published",
  slug: "kak-svarit-pervoe-pivo",
  title: "Как сварить первое пиво",
  excerpt: "Пошаговый гайд для первой варки.",
  bodyJson,
  metaJson: {},
  coverImageUrl: "/images/articles/kak-svarit-pervoe-pivo.jpg",
  seoTitle: "Как сварить первое пиво — гайд для новичков",
  seoDescription: "Разбираем первую варку по шагам: оборудование, санитайзинг, затирание, брожение.",
  readingMinutes: 8,
  isFeatured: true,
  authorId: "u-1",
  authorName: "Редакция NB",
  reviewerId: null,
  publishedAt: new Date("2026-06-01T10:00:00Z"),
  createdAt: new Date("2026-05-20T10:00:00Z"),
  updatedAt: new Date("2026-06-15T10:00:00Z")
};

// Легаси BJCP-статья из @nb/content — раньше жила на /articles/<slug>,
// теперь каноническая /bjcp/<slug>.
const legacyBjcpArticle = { slug: "bjcp-1a-american-light-lager" };

const mocks = vi.hoisted(() => ({
  getPublishedContentArticleBySlug: vi.fn(async (_slug: string): Promise<ContentArticleDto | null> => null),
  getArticleBySlug: vi.fn(async (_slug: string): Promise<{ slug: string } | null> => null),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  })
}));

vi.mock("@/features/content-articles/service", () => ({
  getPublishedContentArticleBySlug: mocks.getPublishedContentArticleBySlug
}));
vi.mock("@nb/content", () => ({
  getArticleBySlug: mocks.getArticleBySlug
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  permanentRedirect: mocks.permanentRedirect
}));

beforeEach(() => {
  mocks.getPublishedContentArticleBySlug.mockReset();
  mocks.getArticleBySlug.mockReset();
  mocks.notFound.mockClear();
  mocks.permanentRedirect.mockClear();

  mocks.getPublishedContentArticleBySlug.mockResolvedValue(null);
  mocks.getArticleBySlug.mockResolvedValue(null);
});

describe("article detail page — generateMetadata", () => {
  it("builds metadata from the CMS article: seoTitle, canonical, OG article", async () => {
    mocks.getPublishedContentArticleBySlug.mockResolvedValue(publishedArticle);
    const { generateMetadata } = await import("../app/(public)/articles/[slug]/page");

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "kak-svarit-pervoe-pivo" }) });

    expect(mocks.getPublishedContentArticleBySlug).toHaveBeenCalledWith("kak-svarit-pervoe-pivo");
    expect(metadata.title).toBe(publishedArticle.seoTitle);
    expect(metadata.alternates).toEqual({ canonical: "/articles/kak-svarit-pervoe-pivo" });
    expect(metadata.openGraph).toMatchObject({ type: "article" });
  });

  it("calls notFound for a slug that matches neither the CMS nor legacy content", async () => {
    const { generateMetadata } = await import("../app/(public)/articles/[slug]/page");

    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "nesuschestvuyuschiy-slug" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it("redirects permanently to /bjcp/<slug> for a legacy @nb/content slug", async () => {
    mocks.getArticleBySlug.mockResolvedValue(legacyBjcpArticle);
    const { generateMetadata } = await import("../app/(public)/articles/[slug]/page");

    await expect(
      generateMetadata({ params: Promise.resolve({ slug: legacyBjcpArticle.slug }) })
    ).rejects.toThrow(`NEXT_REDIRECT:/bjcp/${legacyBjcpArticle.slug}`);
    expect(mocks.permanentRedirect).toHaveBeenCalledWith(`/bjcp/${legacyBjcpArticle.slug}`);
  });
});

describe("article detail page — render", () => {
  it("renders the article body, breadcrumb and JSON-LD without throwing", async () => {
    mocks.getPublishedContentArticleBySlug.mockResolvedValue(publishedArticle);
    const { default: ArticleDetailPage } = await import("../app/(public)/articles/[slug]/page");

    const view = await ArticleDetailPage({ params: Promise.resolve({ slug: "kak-svarit-pervoe-pivo" }) });
    const html = renderToStaticMarkup(view);

    expect(html).toContain("Как сварить первое пиво");
    expect(html).toContain("санитайзинг оборудования");
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain("application/ld+json");
    expect(html).toContain("BlogPosting");
    expect(html).toContain("BreadcrumbList");
  });

  it("throws notFound for a missing slug in the page body too", async () => {
    const { default: ArticleDetailPage } = await import("../app/(public)/articles/[slug]/page");

    await expect(
      ArticleDetailPage({ params: Promise.resolve({ slug: "nesuschestvuyuschiy-slug" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
