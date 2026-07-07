import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement("img", { src: props.src as string, alt: (props.alt as string) ?? "" })
}));

import { MasterPageView } from "../components/masters/public/master-page-view";
import type { MasterPublishedSnapshot } from "../features/masters/contracts";

const baseSnapshot = (overrides: Partial<MasterPublishedSnapshot> = {}): MasterPublishedSnapshot => ({
  version: 1,
  displayName: "Кузница Иванова",
  city: "Тюмень",
  specializations: ["vessels"],
  summary: "ЦКТ и краны на заказ.",
  about: "Делаем ЦКТ из нержавейки.\n\nДоставка по РФ.",
  contacts: {},
  craftSince: 2018,
  gallery: [],
  items: [],
  publishedAt: "2026-01-01T00:00:00.000Z",
  ...overrides
});

const render = (snapshot: MasterPublishedSnapshot) =>
  renderToStaticMarkup(React.createElement(MasterPageView, { snapshot }));

describe("MasterPageView", () => {
  it("renders the header (name, city, craftSince) and the disclaimer", () => {
    const html = render(baseSnapshot());
    expect(html).toContain("Кузница Иванова");
    expect(html).toContain("Тюмень");
    expect(html).toContain("Делает с 2018");
    expect(html).toContain("Ёмкости и ЦКТ");
    expect(html).toContain("Договаривайтесь с мастером напрямую");
  });

  it("hides the «Изделия» and «Галерея работ» sections when both arrays are empty", () => {
    const html = render(baseSnapshot());
    expect(html).not.toContain("Изделия");
    expect(html).not.toContain("Галерея работ");
  });

  it("renders contact buttons, normalizing a @nick telegram handle to a t.me link", () => {
    const html = render(
      baseSnapshot({
        contacts: {
          telegram: "@ivanov_forge",
          phone: "+7 900 123-45-67",
          email: "master@example.com",
          website: "https://ivanov-forge.example"
        }
      })
    );
    expect(html).toContain('href="https://t.me/ivanov_forge"');
    expect(html).toContain("Написать в Telegram");
    expect(html).toContain('href="tel:+79001234567"');
    expect(html).toContain('href="mailto:master@example.com"');
    expect(html).toContain('href="https://ivanov-forge.example"');
  });

  it("passes through an already-full t.me link unchanged", () => {
    const html = render(baseSnapshot({ contacts: { telegram: "https://t.me/ivanov_forge" } }));
    expect(html).toContain('href="https://t.me/ivanov_forge"');
  });

  it("renders no contact buttons when no contact is set", () => {
    const html = render(baseSnapshot());
    expect(html).not.toContain("Написать в Telegram");
    expect(html).not.toContain("Позвонить");
    expect(html).not.toContain('href="tel:');
    expect(html).not.toContain('href="mailto:');
  });

  it("renders items with a price note badge when items are present", () => {
    const html = render(
      baseSnapshot({
        items: [
          {
            id: "item-1",
            title: "ЦКТ 60 л",
            description: "Нержавейка AISI304, рубашка охлаждения.",
            priceNote: "от 60 000 ₽",
            coverImageId: null,
            images: []
          }
        ]
      })
    );
    expect(html).toContain("Изделия");
    expect(html).toContain("ЦКТ 60 л");
    expect(html).toContain("от 60 000 ₽");
    expect(html).toContain("Нержавейка AISI304");
  });

  it("does not render a price badge when priceNote is absent", () => {
    const html = render(
      baseSnapshot({
        items: [
          {
            id: "item-1",
            title: "Контроллер затирания",
            description: "На заказ.",
            priceNote: null,
            coverImageId: null,
            images: []
          }
        ]
      })
    );
    expect(html).toContain("Контроллер затирания");
    expect(html).not.toContain("от 60 000");
  });

  it("renders the gallery section with thumbnails when gallery is present", () => {
    const html = render(baseSnapshot({ gallery: [{ imageId: "img-1", blurDataUrl: null }] }));
    expect(html).toContain("Галерея работ");
    expect(html).toContain('src="/api/master-images/img-1/thumb"');
  });
});
