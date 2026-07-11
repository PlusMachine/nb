import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// MasterImage → next/image; тот же мок, что и у RecipeCard-тестов.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement("img", { src: props.src as string, alt: (props.alt as string) ?? "" })
}));

import { MarketItemCard } from "../components/masters/public/market-item-card";
import { buildMarketItemCards, type MarketItemCardDto, type MasterPublishedSnapshot } from "../features/masters/contracts";

const baseItem = (overrides: Partial<MarketItemCardDto> = {}): MarketItemCardDto => ({
  itemId: "item-1",
  title: "Мельница для солода",
  priceNote: "от 12 000 ₽",
  coverImage: null,
  masterSlug: "kuznya-ivanova",
  masterDisplayName: "Кузница Иванова",
  masterCity: "Тюмень",
  ...overrides
});

describe("MarketItemCard", () => {
  it("вся карточка — ссылка к изделию на странице мастера (якорь #item-<id>)", () => {
    const html = renderToStaticMarkup(React.createElement(MarketItemCard, { item: baseItem() }));
    expect(html).toContain('href="/masters/kuznya-ivanova#item-item-1"');
    expect(html).toContain("Мельница для солода");
    expect(html).toContain("от 12 000 ₽");
    expect(html).toContain("Кузница Иванова");
    expect(html).toContain("Тюмень");
  });

  it("без обложки — плейсхолдер (нет <img>)", () => {
    const html = renderToStaticMarkup(React.createElement(MarketItemCard, { item: baseItem() }));
    expect(html).not.toContain("<img");
  });

  it("с обложкой — medium-вариант фото", () => {
    const html = renderToStaticMarkup(
      React.createElement(MarketItemCard, { item: baseItem({ coverImage: { imageId: "img-1", blurDataUrl: null } }) })
    );
    expect(html).toContain('src="/api/master-images/img-1/medium"');
  });

  it("без priceNote — карточка рендерится без чипа цены", () => {
    const html = renderToStaticMarkup(React.createElement(MarketItemCard, { item: baseItem({ priceNote: null }) }));
    expect(html).not.toContain("12 000");
  });
});

const snapshot = (items: MasterPublishedSnapshot["items"]): MasterPublishedSnapshot => ({
  version: 1,
  displayName: "Кузница Иванова",
  city: "Тюмень",
  specializations: ["vessels"],
  summary: "ЦКТ и краны на заказ.",
  about: "Работаем с нержавейкой уже 10 лет.",
  contacts: {},
  craftSince: 2018,
  gallery: [],
  items,
  publishedAt: "2026-01-01T00:00:00.000Z"
});

describe("buildMarketItemCards", () => {
  const images = [
    { imageId: "img-a", blurDataUrl: null },
    { imageId: "img-b", blurDataUrl: null }
  ];

  it("маппит изделия снапшота в карточки с данными мастера", () => {
    const cards = buildMarketItemCards("kuznya-ivanova", snapshot([
      { id: "i1", title: "ЦКТ 60 л", description: "", priceNote: "45 000 ₽", coverImageId: null, images: [] },
      { id: "i2", title: "Кран", description: "", priceNote: null, coverImageId: null, images: [] }
    ]));

    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      itemId: "i1",
      title: "ЦКТ 60 л",
      priceNote: "45 000 ₽",
      masterSlug: "kuznya-ivanova",
      masterDisplayName: "Кузница Иванова",
      masterCity: "Тюмень"
    });
  });

  it("обложка: coverImageId → первое фото → null (приоритет как у resolveItemCoverIndex)", () => {
    const [byCoverId] = buildMarketItemCards("s", snapshot([
      { id: "i1", title: "t", description: "", priceNote: null, coverImageId: "img-b", images }
    ]));
    expect(byCoverId?.coverImage?.imageId).toBe("img-b");

    const [firstFallback] = buildMarketItemCards("s", snapshot([
      { id: "i1", title: "t", description: "", priceNote: null, coverImageId: "missing", images }
    ]));
    expect(firstFallback?.coverImage?.imageId).toBe("img-a");

    const [noImages] = buildMarketItemCards("s", snapshot([
      { id: "i1", title: "t", description: "", priceNote: null, coverImageId: null, images: [] }
    ]));
    expect(noImages?.coverImage).toBeNull();
  });
});
