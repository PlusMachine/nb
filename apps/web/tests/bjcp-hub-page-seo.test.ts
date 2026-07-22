import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getBjcpCatalogData } from "@nb/content";
import { describe, expect, it, vi } from "vitest";

// BjcpCatalog — клиентский компонент (usePathname/useRouter/useSearchParams);
// тот же приём мока next/navigation, что и в recipes-page.test.ts:
// searchParams мутируется per-test через mocks.navState, а не форсится один раз
// на весь файл (иначе легко случайно тестировать только ?view=bjcp, а не дефолт).
const mocks = vi.hoisted(() => ({
  navState: { searchParams: "" }
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/bjcp",
  useSearchParams: () => new URLSearchParams(mocks.navState.searchParams)
}));

describe("bjcp hub page metadata", () => {
  it("has a canonical /bjcp and an openGraph block", async () => {
    const { metadata } = await import("../app/(public)/bjcp/page");

    expect(metadata.alternates).toEqual({ canonical: "/bjcp" });
    expect(metadata.openGraph).toMatchObject({ type: "website", url: "/bjcp", locale: "ru_RU" });
    expect((metadata.openGraph as { siteName?: string } | undefined)?.siteName).toBeTruthy();
    expect((metadata.openGraph as { images?: { url: string }[] } | undefined)?.images?.[0]?.url).toBe(
      "/api/og/sections/bjcp"
    );
  });
});

describe("bjcp hub page — full style index in static HTML by default (A8)", () => {
  it("renders a <Link> for every style in the real BJCP catalog with default (no ?view=bjcp) client state", async () => {
    mocks.navState.searchParams = "";

    const { BjcpCatalog } = await import("../components/content/bjcp-catalog");
    const { BjcpStyleIndex } = await import("../components/content/bjcp-style-index");
    const catalog = await getBjcpCatalogData();

    // Рендерим оба блока страницы вместе, как в app/(public)/bjcp/page.tsx:
    // клиентский каталог (по умолчанию — вид "Семейства", в HTML только часть
    // стилей) + серверный "Указатель стилей" внизу (независимый от состояния
    // клиентского каталога, всегда полный).
    const html = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(BjcpCatalog, { catalog }),
        React.createElement(BjcpStyleIndex, { catalog })
      )
    );

    const styleLinkMatches = html.match(/href="\/bjcp\/[^"]+"/g) ?? [];
    const uniqueStyleLinks = new Set(styleLinkMatches);

    expect(uniqueStyleLinks.size).toBeGreaterThanOrEqual(catalog.styles.length);

    for (const style of catalog.styles) {
      expect(html).toContain(`href="/bjcp/${style.slug}"`);
    }
  });
});

describe("bjcp catalog accordion — all categories in static HTML with ?view=bjcp", () => {
  it("renders a <Link> for every style even for collapsed categories", async () => {
    mocks.navState.searchParams = "view=bjcp";

    const { BjcpCatalog } = await import("../components/content/bjcp-catalog");
    const catalog = await getBjcpCatalogData();

    const html = renderToStaticMarkup(React.createElement(BjcpCatalog, { catalog }));

    const styleLinkMatches = html.match(/href="\/bjcp\/[^"]+"/g) ?? [];
    // >= а не ===: та же ссылка на стиль может дублироваться в других блоках
    // (например, hero-плитках раздела "Семейства"), но каждый стиль каталога
    // обязан попасть в HTML хотя бы раз — независимо от того, какая категория
    // сейчас раскрыта (все категории закрыты по умолчанию).
    expect(styleLinkMatches.length).toBeGreaterThanOrEqual(catalog.styles.length);

    for (const style of catalog.styles) {
      expect(html).toContain(`href="/bjcp/${style.slug}"`);
    }

    // Свёрнутые категории — в DOM, но спрятаны через CSS (`hidden`), не условным
    // рендером: без этого утверждения regression на "показываем только раскрытую"
    // прошёл бы предыдущую проверку случайно (если бы дефолтная категория была открыта).
    expect(html).toContain("hidden");
  });

  it("does not eagerly render <img> tags inside the closed accordion (no image weight for hidden categories)", async () => {
    mocks.navState.searchParams = "view=bjcp";

    const { BjcpCatalog } = await import("../components/content/bjcp-catalog");
    const catalog = await getBjcpCatalogData();

    const html = renderToStaticMarkup(React.createElement(BjcpCatalog, { catalog }));
    expect(html).not.toContain("<img");
  });
});
