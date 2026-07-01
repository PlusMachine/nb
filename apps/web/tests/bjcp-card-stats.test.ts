import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getArticleBySlug, getBjcpCatalogData } from "@nb/content";
import { describe, expect, it } from "vitest";

import { BjcpArticlePage } from "../components/content/bjcp-article-page";
import { getBjcpCardColorInfo, getBjcpCardStatDisplay } from "../features/content/bjcp-card-stats";

describe("BJCP catalog card stats", () => {
  it("keeps numeric values when BJCP provides explicit ranges", async () => {
    const catalog = await getBjcpCatalogData();
    const style = catalog.styles.find((item) => item.bjcpId === "3C");

    expect(style).toBeDefined();
    expect(getBjcpCardStatDisplay(style!, "abv").value).toBe("4.4 - 5.8%");
  });

  it("shows concise base-style fallback labels for inherited styles", async () => {
    const catalog = await getBjcpCatalogData();
    const style = catalog.styles.find((item) => item.bjcpId === "27-Kellerbier");

    expect(style).toBeDefined();
    expect(getBjcpCardStatDisplay(style!, "abv").value).toBe("как база");
    expect(getBjcpCardStatDisplay(style!, "ibu").value).toBe("как база");
  });

  it("shows concise subtype fallback labels for specialty IPA parent entries", async () => {
    const catalog = await getBjcpCatalogData();
    const style = catalog.styles.find((item) => item.bjcpId === "21B");

    expect(style).toBeDefined();
    expect(getBjcpCardStatDisplay(style!, "abv").value).toBe("по подстилю");
    expect(getBjcpCardStatDisplay(style!, "ibu").value).toBe("по подстилю");
    expect(getBjcpCardColorInfo(style!)).toMatchObject({
      startHex: "#D9F99D",
      averageHex: "#FACC15",
      endHex: "#F97316"
    });
  });

  it("shows darker-than-base fallback for wood-aged color stats", async () => {
    const catalog = await getBjcpCatalogData();
    const style = catalog.styles.find((item) => item.bjcpId === "33A");

    expect(style).toBeDefined();
    expect(getBjcpCardColorInfo(style!).value).toBe("темнее базы");
    expect(getBjcpCardColorInfo(style!)).toMatchObject({
      startHex: "#EAB308",
      averageHex: "#A16207",
      endHex: "#4B2E17"
    });
  });

  it("compresses mixed numeric stats with qualifiers into short card ranges", async () => {
    const catalog = await getBjcpCatalogData();
    const style = catalog.styles.find((item) => item.bjcpId === "23F");

    expect(style).toBeDefined();
    expect(getBjcpCardStatDisplay(style!, "srm").value).toBe("3 – 7");
  });

  it("uses a fruit-spectrum gradient for fruit beer cards without explicit SRM", async () => {
    const catalog = await getBjcpCatalogData();
    const style = catalog.styles.find((item) => item.bjcpId === "29A");

    expect(style).toBeDefined();
    expect(getBjcpCardColorInfo(style!)).toMatchObject({
      value: "по базе",
      startHex: "#FDE047",
      averageHex: "#FB923C",
      endHex: "#F43F5E"
    });
  });

  it("uses themed fallbacks for spice, lager-hazy, and experimental specialty cards", async () => {
    const catalog = await getBjcpCatalogData();
    const [spiceBeer, kellerbier, experimentalBeer] = [
      catalog.styles.find((item) => item.bjcpId === "30A"),
      catalog.styles.find((item) => item.bjcpId === "27-Kellerbier"),
      catalog.styles.find((item) => item.bjcpId === "34C")
    ];

    expect(spiceBeer).toBeDefined();
    expect(kellerbier).toBeDefined();
    expect(experimentalBeer).toBeDefined();

    expect(getBjcpCardColorInfo(spiceBeer!)).toMatchObject({
      startHex: "#F59E0B",
      averageHex: "#84CC16",
      endHex: "#DC2626"
    });
    expect(getBjcpCardColorInfo(kellerbier!)).toMatchObject({
      startHex: "#FDE68A",
      averageHex: "#FBBF24",
      endHex: "#D97706"
    });
    expect(getBjcpCardColorInfo(experimentalBeer!)).toMatchObject({
      startHex: "#F59E0B",
      averageHex: "#EC4899",
      endHex: "#7C3AED"
    });
  });

  it("uses a caramel fallback for alternative sugar beer instead of a neutral strip", async () => {
    const catalog = await getBjcpCatalogData();
    const style = catalog.styles.find((item) => item.bjcpId === "31B");

    expect(style).toBeDefined();
    expect(getBjcpCardColorInfo(style!)).toMatchObject({
      startHex: "#FEF3C7",
      averageHex: "#D97706",
      endHex: "#6B3410"
    });
  });

  it("renders the same fruit gradient on the full BJCP style page", async () => {
    const [catalog, article] = await Promise.all([
      getBjcpCatalogData(),
      getArticleBySlug("bjcp-29a-fruit-beer")
    ]);
    const style = catalog.styles.find((item) => item.bjcpId === "29A");

    expect(article).toBeDefined();
    expect(style).toBeDefined();

    const html = renderToStaticMarkup(
      React.createElement(BjcpArticlePage, {
        article: article!,
        catalogStyle: style!
      })
    );

    expect(html).toContain("#FDE047");
    expect(html).toContain("#FB923C");
    expect(html).toContain("#F43F5E");
  });
});
