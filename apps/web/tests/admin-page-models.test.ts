import { describe, expect, it } from "vitest";

import {
  buildAdminIngredientsHref,
  buildIngredientAliasesPreview,
  parseAdminIngredientsPageParams
} from "../features/ingredients/admin-page-model";
import type { IngredientCatalogItemDto } from "../features/ingredients/contracts";
import {
  buildAdminArticlesHref,
  countAdminArticlesByStatus,
  filterAdminArticles,
  paginateAdminArticles,
  parseAdminArticlesPageParams
} from "../features/content-articles/admin-page-model";
import type { ContentArticleListItem } from "../features/content-articles/contracts";
import {
  buildAdminFeedbackHref,
  countFeedbackByStatus,
  filterFeedback,
  paginateFeedback,
  parseAdminFeedbackPageParams
} from "../features/feedback/admin-page-model";
import type { FeedbackDto } from "../features/feedback/contracts";

const buildArticle = (overrides: Partial<ContentArticleListItem> = {}): ContentArticleListItem => ({
  id: "article-1",
  type: "guide",
  status: "draft",
  slug: "kak-svarit",
  title: "Как сварить первое пиво",
  excerpt: null,
  coverImageUrl: null,
  readingMinutes: 5,
  isFeatured: false,
  authorName: "Редакция",
  publishedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ...overrides
});

const buildFeedback = (overrides: Partial<FeedbackDto> = {}): FeedbackDto => ({
  id: "feedback-1",
  kind: "bug",
  message: "Кнопка не работает",
  contactEmail: null,
  pageUrl: "https://example.com/app/recipes",
  pagePath: "/app/recipes",
  context: {},
  status: "new",
  submittedByUserId: null,
  submitterName: "Иван",
  moderatorId: null,
  resolutionNote: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides
});

describe("admin ingredients page model", () => {
  it("parses url params and falls back on garbage", () => {
    expect(parseAdminIngredientsPageParams({
      q: "  каскад ",
      category: "hop",
      status: "draft",
      sort: "updated",
      page: "3",
      pageSize: "100"
    })).toEqual({
      q: "каскад",
      category: "hop",
      status: "draft",
      sort: "updated",
      page: 3,
      pageSize: 100
    });

    expect(parseAdminIngredientsPageParams({
      category: "nonsense",
      status: "nonsense",
      sort: "nonsense",
      page: "-2",
      pageSize: "7"
    })).toEqual({
      q: "",
      category: undefined,
      status: undefined,
      sort: "brand",
      page: 1,
      pageSize: 50
    });
  });

  it("keeps defaults out of the query and carries the page size", () => {
    expect(buildAdminIngredientsHref("/admin/ingredients", {})).toBe("/admin/ingredients");
    expect(buildAdminIngredientsHref("/admin/ingredients", { pageSize: 50 })).toBe("/admin/ingredients");
    expect(buildAdminIngredientsHref("/admin/ingredients", { pageSize: 100, page: 2 }))
      .toBe("/admin/ingredients?page=2&pageSize=100");
    expect(buildAdminIngredientsHref("/admin/ingredients", { q: " хмель ", status: "archived" }))
      .toBe("/admin/ingredients?q=%D1%85%D0%BC%D0%B5%D0%BB%D1%8C&status=archived");
  });

  it("previews aliases with a tail counter", () => {
    const alias = (value: string): IngredientCatalogItemDto["aliases"][number] => ({
      id: value,
      locale: "ru",
      alias: value,
      aliasNormalized: value,
      source: "admin",
      isEnabled: true
    });

    expect(buildIngredientAliasesPreview([])).toBeNull();
    expect(buildIngredientAliasesPreview([alias("а"), alias("б")])).toBe("а, б");
    expect(buildIngredientAliasesPreview([alias("а"), alias("б"), alias("в"), alias("г"), alias("д")]))
      .toBe("а, б, в, г +1");
  });
});

describe("admin articles page model", () => {
  it("filters by title, slug and author", () => {
    const items = [
      buildArticle({ id: "a", title: "Хмель в IPA" }),
      buildArticle({ id: "b", title: "Солод", slug: "solod-guide" }),
      buildArticle({ id: "c", title: "Дрожжи", authorName: "Пётр" })
    ];

    expect(filterAdminArticles(items, "хмель").map((item) => item.id)).toEqual(["a"]);
    expect(filterAdminArticles(items, "solod").map((item) => item.id)).toEqual(["b"]);
    expect(filterAdminArticles(items, "пётр").map((item) => item.id)).toEqual(["c"]);
    expect(filterAdminArticles(items, "  ").map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("counts statuses and clamps the page to the last one", () => {
    const items = [
      buildArticle({ id: "a", status: "draft" }),
      buildArticle({ id: "b", status: "published" }),
      buildArticle({ id: "c", status: "published" })
    ];

    expect(countAdminArticlesByStatus(items)).toEqual({ draft: 1, published: 2, archived: 0 });

    const page = paginateAdminArticles(items, 99, 2);
    expect(page).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(page.items.map((item) => item.id)).toEqual(["c"]);
  });

  it("parses params and builds hrefs without defaults", () => {
    expect(parseAdminArticlesPageParams({ status: "published", page: "2", pageSize: "50" }))
      .toEqual({ q: "", status: "published", page: 2, pageSize: 50 });
    expect(parseAdminArticlesPageParams({ status: "nope", page: "0", pageSize: "3" }))
      .toEqual({ q: "", status: undefined, page: 1, pageSize: 20 });

    expect(buildAdminArticlesHref("/admin/articles", {})).toBe("/admin/articles");
    expect(buildAdminArticlesHref("/admin/articles", { status: "draft", page: 3 }))
      .toBe("/admin/articles?status=draft&page=3");
  });
});

describe("admin feedback page model", () => {
  it("filters by message, author and page path", () => {
    const items = [
      buildFeedback({ id: "a", message: "Не сохраняется рецепт" }),
      buildFeedback({ id: "b", submitterName: "Мария" }),
      buildFeedback({ id: "c", pagePath: "/catalog/hops" })
    ];

    expect(filterFeedback(items, "рецепт").map((item) => item.id)).toEqual(["a"]);
    expect(filterFeedback(items, "мария").map((item) => item.id)).toEqual(["b"]);
    expect(filterFeedback(items, "/catalog").map((item) => item.id)).toEqual(["c"]);
  });

  it("counts statuses and paginates", () => {
    const items = [
      buildFeedback({ id: "a", status: "new" }),
      buildFeedback({ id: "b", status: "resolved" }),
      buildFeedback({ id: "c", status: "new" })
    ];

    expect(countFeedbackByStatus(items)).toEqual({ new: 2, in_progress: 0, resolved: 1, dismissed: 0 });

    const page = paginateFeedback(items, 1, 2);
    expect(page).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(page.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("parses params and builds hrefs", () => {
    expect(parseAdminFeedbackPageParams({ status: "in_progress", q: " баг " }))
      .toEqual({ q: "баг", status: "in_progress", page: 1, pageSize: 20 });

    expect(buildAdminFeedbackHref("/admin/feedback", { status: "new" }))
      .toBe("/admin/feedback?status=new");
    expect(buildAdminFeedbackHref("/admin/feedback", {})).toBe("/admin/feedback");
  });
});
