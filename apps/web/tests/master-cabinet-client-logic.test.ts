import { describe, expect, it, vi } from "vitest";

// Покрытие двух точечных фиксов клиентской логики кабинета мастера (/app/master,
// docs/masters-showcase-review-findings.md #14, #16). Обе функции — чистые,
// поэтому вынесены как именованные экспорты из "use client"-файлов специально
// ради юнит-теста (по образцу buildMasterProfileFormPayload в
// master-profile-fields.tsx). "./actions" мокаем, чтобы не тащить db-слой в тест
// импортом master-items-section.tsx/master-image-manager.tsx (см. тот же приём в
// tests/owner-recipe-card.test.tsx).

vi.mock("../app/(app)/app/master/actions", () => ({
  createMasterItemAction: vi.fn(),
  updateMasterItemAction: vi.fn(),
  deleteMasterItemAction: vi.fn(),
  reorderMasterItemsAction: vi.fn(),
  setMasterItemCoverAction: vi.fn(),
  deleteMasterImageAction: vi.fn(),
  reorderMasterImagesAction: vi.fn()
}));

import { remapImagesAfterItemDeletion } from "../app/(app)/app/master/master-items-section";
import { parseUploadResponse, type MasterImageCardItem } from "../app/(app)/app/master/master-image-manager";

const baseImage: MasterImageCardItem = {
  id: "img-1",
  profileId: "profile-1",
  itemId: null,
  sortOrder: 0,
  blurDataUrl: null,
  status: "ready",
  thumbUrl: "/thumb.jpg",
  mediumUrl: "/medium.jpg",
  largeUrl: "/large.jpg",
  originalUrl: "/original.jpg",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("remapImagesAfterItemDeletion (находка #14)", () => {
  it("переносит itemId=null только фото удалённого изделия", () => {
    const images: MasterImageCardItem[] = [
      { ...baseImage, id: "img-1", itemId: "item-1" },
      { ...baseImage, id: "img-2", itemId: "item-2" },
      { ...baseImage, id: "img-3", itemId: null }
    ];

    const result = remapImagesAfterItemDeletion(images, "item-1");

    expect(result.find((image) => image.id === "img-1")?.itemId).toBeNull();
    expect(result.find((image) => image.id === "img-2")?.itemId).toBe("item-2");
    expect(result.find((image) => image.id === "img-3")?.itemId).toBeNull();
  });

  it("не удаляет и не теряет записи — только меняет itemId", () => {
    const images: MasterImageCardItem[] = [
      { ...baseImage, id: "img-1", itemId: "item-1" },
      { ...baseImage, id: "img-2", itemId: "item-1" }
    ];

    const result = remapImagesAfterItemDeletion(images, "item-1");

    expect(result).toHaveLength(2);
    expect(result.every((image) => image.itemId === null)).toBe(true);
  });

  it("если совпадений нет — возвращает эквивалентный список без изменений", () => {
    const images: MasterImageCardItem[] = [{ ...baseImage, id: "img-1", itemId: "item-2" }];

    const result = remapImagesAfterItemDeletion(images, "item-1");

    expect(result).toEqual(images);
  });
});

describe("parseUploadResponse (находка #16)", () => {
  it("нормализует createdAt/updatedAt из ISO-строк в Date", () => {
    const body = JSON.stringify({
      ok: true,
      image: { ...baseImage, createdAt: "2026-02-03T10:00:00.000Z", updatedAt: "2026-02-03T10:05:00.000Z" }
    });

    const parsed = parseUploadResponse(body);

    expect(parsed.image?.createdAt).toBeInstanceOf(Date);
    expect(parsed.image?.updatedAt).toBeInstanceOf(Date);
    expect(parsed.image?.createdAt.toISOString()).toBe("2026-02-03T10:00:00.000Z");
    // getTime() — именно то, что зовёт sortItems; раньше кидало TypeError на строке.
    expect(() => parsed.image?.createdAt.getTime()).not.toThrow();
  });

  it("пустая строка ответа → {} без падения", () => {
    expect(parseUploadResponse("")).toEqual({});
  });

  it("битый JSON → {} без падения", () => {
    expect(parseUploadResponse("{not json")).toEqual({});
  });

  it("ответ без image (ошибка без слота) — image остаётся undefined", () => {
    const parsed = parseUploadResponse(JSON.stringify({ ok: false, message: "Не удалось." }));
    expect(parsed.image).toBeUndefined();
    expect(parsed.message).toBe("Не удалось.");
  });
});
