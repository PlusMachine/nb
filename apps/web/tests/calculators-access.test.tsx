import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  setFavoriteCalculator: vi.fn(async () => ({ favorite: true })),
  getFavoriteCalculatorSlugs: vi.fn(async (_id: string, slugs: string[]) => new Set(slugs)),
  isCalculatorFavorite: vi.fn(async () => true),
  renderOgCardResponse: vi.fn(async (_view: unknown, cache: string) => new Response("image", { headers: { "Cache-Control": cache } }))
}));
vi.mock("@/lib/auth", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ APP_URL: "https://example.test", SITE_NAME: "NB" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); }
}));
vi.mock("@/components/calculators/calculator-page-client", () => ({
  CalculatorPageClient: () => null
}));
vi.mock("@/features/calculators/favorites-service", () => ({
  setFavoriteCalculator: mocks.setFavoriteCalculator,
  getFavoriteCalculatorSlugs: mocks.getFavoriteCalculatorSlugs,
  isCalculatorFavorite: mocks.isCalculatorFavorite
}));
vi.mock("@/features/og/render", () => ({
  assertOgRateLimit: vi.fn(async () => {}),
  ogStaticFallback: () => new Response(null, { status: 302 }),
  renderOgCardResponse: mocks.renderOgCardResponse,
  renderOgFallbackResponse: vi.fn(async () => new Response("fallback"))
}));

import CalculatorsPage from "../app/(public)/calculators/page";
import CalculatorPage, { generateMetadata, generateStaticParams } from "../app/(public)/calculators/[slug]/page";
import CalculatorSharePage, { generateMetadata as shareMetadata } from "../app/(public)/calculators/[slug]/share/page";
import { GET } from "../app/api/og/calculators/[slug]/route";
import { loadFavoriteCalculatorState, loadFavoriteCalculatorStates, toggleFavoriteCalculatorAction } from "../app/(public)/calculators/favorite-actions";
import { canAccessCalculator } from "../features/calculators/access";
import { calculators } from "../features/calculators/catalog";

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
const shareParams = (slug: string) => ({ ...params(slug), searchParams: Promise.resolve({ wortGravity: "1.050" }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  mocks.getSessionUser.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("серверный доступ к калькуляторам", () => {
  it.each([null, "user", "editor", "moderator"])("production: %s получает отфильтрованный каталог и 404 на закрытые страницы", async (role) => {
    mocks.getSessionUser.mockResolvedValue(role ? { id: "test", role } : null);
    const html = renderToStaticMarkup(await CalculatorsPage());
    expect(html.match(/data-calculator-card=/g)).toHaveLength(5);
    expect(html).toContain('data-calculator-card="abv-attenuation"');
    expect(html).not.toContain('data-calculator-card="ibu"');
    expect(html).not.toContain("✓ проверен");
    expect(html).not.toContain("Варка и рецепт");
    expect(html).not.toContain("Дрожжи и хмель");
    expect(html).not.toContain("праймер");
    expect(html).not.toContain("ibu");

    for (const route of [CalculatorPage, generateMetadata]) {
      await expect(route(params("ibu"))).rejects.toThrow("NEXT_NOT_FOUND");
    }
    for (const route of [CalculatorSharePage, shareMetadata]) {
      await expect(route(shareParams("ibu"))).rejects.toThrow("NEXT_NOT_FOUND");
    }
  });

  it("admin видит все калькуляторы, открывает закрытый и share; служебной отметки в production нет", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "admin-test", role: "admin" });
    const html = renderToStaticMarkup(await CalculatorsPage());
    expect(html.match(/data-calculator-card=/g)).toHaveLength(17);
    expect(html).not.toContain("✓ проверен");
    expect(renderToStaticMarkup(await CalculatorPage(params("ibu")))).toContain("Горечь пива (IBU)");
    expect(renderToStaticMarkup(await CalculatorSharePage(shareParams("ibu")))).toContain("Горечь пива (IBU)");
    expect((await generateMetadata(params("ibu"))).robots).toEqual({ index: false, follow: false });
  });

  it("публичный расчёт и его metadata не требуют сессии; SSG содержит только публичные калькуляторы", async () => {
    expect(await canAccessCalculator("abv-attenuation")).toBe(true);
    expect(renderToStaticMarkup(await CalculatorPage(params("abv-attenuation")))).toContain("Крепость, сбраживание и калории");
    await generateMetadata(params("abv-attenuation"));
    expect(mocks.getSessionUser).not.toHaveBeenCalled();
    expect(generateStaticParams()).toHaveLength(5);
    expect(generateStaticParams()).not.toContainEqual({ slug: "ibu" });
  });

  it("в dev гость видит весь каталог с пятью исходными отметками; открывает любой расчёт", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const html = renderToStaticMarkup(await CalculatorsPage());
    expect(html.match(/data-calculator-card=/g)).toHaveLength(17);
    expect(html.match(/✓ проверен/g)).toHaveLength(5);
    expect(renderToStaticMarkup(await CalculatorPage(params("abv-attenuation")))).toContain("✓ проверен");
    for (const item of calculators) {
      expect(await canAccessCalculator(item.slug)).toBe(true);
    }
    expect(mocks.getSessionUser).not.toHaveBeenCalled();
  });

  it("OG закрытого калькулятора не отдаётся гостю и не попадает в публичный кэш для admin", async () => {
    const request = new Request("https://example.test/api/og/calculators/ibu");
    const denied = await GET(request, params("ibu"));
    expect(denied.status).toBe(404);
    expect(mocks.renderOgCardResponse).not.toHaveBeenCalled();
    expect(denied.headers.get("Cache-Control")).toBe("private, no-store");

    mocks.getSessionUser.mockResolvedValue({ id: "test", role: "admin" });
    const allowed = await GET(request, params("ibu"));
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("Cache-Control")).toBe("private, no-store");

    const publicResponse = await GET(new Request("https://example.test/api/og/calculators/abv-attenuation"), params("abv-attenuation"));
    expect(publicResponse.headers.get("Cache-Control")).toContain("public");
  });

  it("скрытый калькулятор нельзя добавить в избранное; сохранённые скрытые не возвращаются", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "test", role: "user" });
    expect(await toggleFavoriteCalculatorAction({ slug: "ibu", next: true })).toMatchObject({ ok: false });
    expect(mocks.setFavoriteCalculator).not.toHaveBeenCalled();
    expect(await loadFavoriteCalculatorState("ibu")).toEqual({ authenticated: true, favorite: false });
    expect(mocks.isCalculatorFavorite).not.toHaveBeenCalled();
    expect(await loadFavoriteCalculatorStates(["ibu", "abv-attenuation"])).toEqual(["abv-attenuation"]);
    expect(await toggleFavoriteCalculatorAction({ slug: "ibu", next: false })).toMatchObject({ ok: true });
    expect(mocks.setFavoriteCalculator).toHaveBeenCalledWith("test", "ibu", false);
  });
});
