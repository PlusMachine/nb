import { beforeEach, describe, expect, it, vi } from "vitest";

// Изолированный файл: мокает @nb/content целиком с синтетической статьёй без
// собственного hero (heroImageUrl === DEFAULT_BJCP_HERO_IMAGE_URL), чтобы
// детерминированно проверить ветку "нет живого фото" — независимо от того,
// сколько реальных стилей сейчас синхронизировано с картинками
// (см. bjcp-style-page-seo.test.ts для сценария "фото есть", на реальном контенте).

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: actual.cache ?? (<T extends (...args: any[]) => any>(fn: T) => fn)
  };
});

const DEFAULT_BJCP_HERO_IMAGE_URL = "/images/bjcp-placeholder.png";

const fakeCategory = {
  id: "99",
  nameRu: "Тестовая категория",
  nameEn: "Test category",
  overviewRu: null,
  articleCount: 1,
  firstStyleId: "99Z",
  lastStyleId: "99Z",
  styleCodeRange: "99Z"
};

const fakeArticle = {
  slug: "bjcp-99z-placeholder-style",
  kind: "bjcp_style" as const,
  bjcpId: "99Z",
  bjcpHeading: "99Z. Placeholder Style",
  title: "Тестовый стиль без фото",
  titleEn: "Placeholder Style",
  description: "Описание тестового стиля.",
  eyebrow: "99Z · BJCP 2021",
  category: fakeCategory,
  heroImageUrl: DEFAULT_BJCP_HERO_IMAGE_URL,
  colorBand: "gold" as const,
  publishedAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
  readingMinutes: 3,
  isFeatured: false,
  stats: [],
  vitalStatistics: {
    og: null,
    fg: null,
    ibu: null,
    srm: null,
    abv: null,
    note: null,
    sessionAbv: null,
    standardAbv: null,
    doubleAbv: null
  },
  vitalStatisticsText: null,
  sections: [],
  keywords: ["BJCP", "Тестовый стиль без фото"],
  seoTitle: "Тестовый стиль без фото (99Z) — стиль пива BJCP",
  seoDescription: "Описание тестового стиля.",
  source: { document: null, fileName: null, language: null, translationScope: null, notes: null }
};

vi.mock("@nb/content", () => ({
  DEFAULT_BJCP_HERO_IMAGE_URL,
  getArticleBySlug: vi.fn(async (slug: string) => (slug === fakeArticle.slug ? fakeArticle : null)),
  listArticles: vi.fn(async () => [fakeArticle]),
  getBjcpCatalogData: vi.fn(async () => ({ uiStrategy: {} as any, families: [], categories: [], styles: [] }))
}));

vi.mock("@/features/recipes/service", () => ({
  listPublicRecipesForStyle: vi.fn(async () => ({ items: [], total: 0 }))
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  })
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bjcp style page — OG/twitter image without a real hero photo", () => {
  it("omits openGraph/twitter images when heroImageUrl is only the shared BJCP placeholder", async () => {
    const { generateMetadata } = await import("../app/(public)/bjcp/[slug]/page");

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: fakeArticle.slug }) });

    expect(metadata.openGraph?.images).toBeUndefined();
    // Без своего фото twitter card вовсе не объявляем — падает на сайтовый дефолт.
    expect(metadata.twitter).toBeUndefined();
  });
});
