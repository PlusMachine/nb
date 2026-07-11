import { describe, expect, it } from "vitest";

import type { MasterPublishedSnapshot } from "../features/masters/contracts";
import {
  buildMarketListMetadata,
  buildMasterBreadcrumbJsonLd,
  buildMasterJsonLd,
  buildMasterPageMetadata
} from "../features/masters/seo";

const baseSnapshot: MasterPublishedSnapshot = {
  version: 1,
  displayName: "Кузница Иванова",
  city: "Тюмень",
  specializations: ["vessels", "automation"],
  summary: "ЦКТ и краны на заказ, доставка по РФ.",
  about: "Делаем оборудование из нержавейки.",
  contacts: { phone: "+7 900 123-45-67" },
  craftSince: 2018,
  gallery: [{ imageId: "img-1", blurDataUrl: null }],
  items: [],
  publishedAt: "2026-01-01T00:00:00.000Z"
};

describe("masters seo", () => {
  it("builds market list metadata with a fixed title and canonical /market", () => {
    const metadata = buildMarketListMetadata();
    expect(metadata.title).toBe("Маркет пивоварного оборудования от мастеров");
    expect(metadata.alternates?.canonical).toBe("/market");
  });

  it("builds master page metadata with the name, specializations and city in the title", () => {
    const metadata = buildMasterPageMetadata("kuznya-ivanova", baseSnapshot);
    expect(metadata.title).toBe("Кузница Иванова — Ёмкости и ЦКТ, Автоматика, Тюмень");
    expect(metadata.description).toBe(baseSnapshot.summary);
    expect(metadata.alternates?.canonical).toBe("/masters/kuznya-ivanova");
  });

  it("uses the first gallery image as an absolute OG image", () => {
    const metadata = buildMasterPageMetadata("kuznya-ivanova", baseSnapshot);
    expect(metadata.openGraph?.images).toEqual(["/api/master-images/img-1/large"]);
  });

  it("includes telephone in LocalBusiness JSON-LD only when the profile has one", () => {
    const withPhone = buildMasterJsonLd("kuznya-ivanova", baseSnapshot, { baseUrl: "https://nb.example" }) as Record<
      string,
      unknown
    >;
    expect(withPhone["@type"]).toBe("LocalBusiness");
    expect(withPhone.telephone).toBe("+7 900 123-45-67");
    expect((withPhone.address as Record<string, unknown>).addressLocality).toBe("Тюмень");
    expect(withPhone.image).toBe("https://nb.example/api/master-images/img-1/large");

    const withoutPhone = buildMasterJsonLd(
      "kuznya-ivanova",
      { ...baseSnapshot, contacts: {}, gallery: [] },
      { baseUrl: "https://nb.example" }
    ) as Record<string, unknown>;
    expect(withoutPhone.telephone).toBeUndefined();
    expect(withoutPhone.image).toBeUndefined();
  });

  it("builds a breadcrumb Главная → Маркет → displayName", () => {
    const jsonLd = buildMasterBreadcrumbJsonLd("kuznya-ivanova", baseSnapshot, { baseUrl: "https://nb.example" }) as {
      itemListElement: { name: string; item: string }[];
    };
    expect(jsonLd.itemListElement.map((item) => item.name)).toEqual(["Главная", "Маркет", "Кузница Иванова"]);
    expect(jsonLd.itemListElement[1]?.item).toBe("https://nb.example/market");
    expect(jsonLd.itemListElement[2]?.item).toBe("https://nb.example/masters/kuznya-ivanova");
  });
});
