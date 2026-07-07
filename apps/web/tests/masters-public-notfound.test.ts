import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Публичная notFound-вайринг для /masters/[slug] (docs/masters-showcase-review-findings.md, #28):
// закрепляем ловушку «loading.tsx vs 404» (память проекта «loading.tsx vs 404») —
// getPublishedMasterBySlug=null должен приводить к notFound() и в generateMetadata,
// и в теле страницы. По образцу tests/public-recipes-pages-wiring.test.ts /
// tests/articles-detail-page-wiring.test.ts.

// React 18 (используемый в vitest/node) не экспортирует `cache` — [slug]/page.tsx
// использует его для дедупа generateMetadata/страницы; под простым node-рендером
// подменяем identity-обёрткой (тот же приём, что в public-recipes-pages-wiring.test.ts).
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: actual.cache ?? (<T extends (...args: any[]) => any>(fn: T) => fn)
  };
});

const publishedMasterSnapshot = {
  version: 1 as const,
  displayName: "Кузница Иванова",
  city: "Тюмень",
  specializations: ["vessels"],
  summary: "ЦКТ и краны на заказ.",
  about: "Работаем с нержавейкой уже 10 лет.",
  contacts: {},
  craftSince: 2018,
  gallery: [],
  items: [],
  publishedAt: "2026-01-01T00:00:00.000Z"
};

const mocks = vi.hoisted(() => ({
  getPublishedMasterBySlug: vi.fn(),
  listPublishedMasters: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
}));

vi.mock("../features/masters/service", () => ({
  getPublishedMasterBySlug: mocks.getPublishedMasterBySlug,
  listPublishedMasters: mocks.listPublishedMasters
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

beforeEach(() => {
  mocks.getPublishedMasterBySlug.mockReset();
  mocks.listPublishedMasters.mockReset();
  mocks.notFound.mockClear();

  mocks.getPublishedMasterBySlug.mockResolvedValue({ snapshot: publishedMasterSnapshot });
  mocks.listPublishedMasters.mockResolvedValue([]);
});

describe("masters/[slug] notFound wiring", () => {
  it("рендерит страницу мастера, когда getPublishedMasterBySlug находит слаг", async () => {
    const { default: MasterRoute } = await import("../app/(public)/masters/[slug]/page");
    const view = await MasterRoute({ params: Promise.resolve({ slug: "ivanov-forge" }) });

    expect(mocks.getPublishedMasterBySlug).toHaveBeenCalledWith("ivanov-forge");
    expect(view).toBeTruthy();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("вызывает notFound() в теле страницы, когда getPublishedMasterBySlug возвращает null", async () => {
    mocks.getPublishedMasterBySlug.mockResolvedValue(null);
    const { default: MasterRoute } = await import("../app/(public)/masters/[slug]/page");

    await expect(MasterRoute({ params: Promise.resolve({ slug: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it("вызывает notFound() из generateMetadata, когда getPublishedMasterBySlug возвращает null", async () => {
    mocks.getPublishedMasterBySlug.mockResolvedValue(null);
    const { generateMetadata } = await import("../app/(public)/masters/[slug]/page");

    await expect(generateMetadata({ params: Promise.resolve({ slug: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it("generateMetadata строит метаданные (canonical), когда слаг найден", async () => {
    const { generateMetadata } = await import("../app/(public)/masters/[slug]/page");
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "ivanov-forge" }) });

    expect(mocks.getPublishedMasterBySlug).toHaveBeenCalledWith("ivanov-forge");
    expect(metadata.alternates?.canonical).toBe("/masters/ivanov-forge");
  });
});

describe("/masters — пустая витрина", () => {
  it("рендерится без падения и показывает CTA, когда listPublishedMasters вернул []", async () => {
    mocks.listPublishedMasters.mockResolvedValue([]);
    const { default: MastersPage } = await import("../app/(public)/masters/page");
    const view = await MastersPage();

    expect(mocks.listPublishedMasters).toHaveBeenCalled();
    const html = renderToStaticMarkup(view as React.ReactElement);

    expect(html).toContain("Делаете оборудование своими руками");
    expect(html).toContain("Открыть свою витрину");
  });
});
