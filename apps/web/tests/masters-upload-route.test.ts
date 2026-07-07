import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие POST /api/master-images/upload (docs/masters-showcase-review-findings.md, #25):
// сервисный слой (@/features/masters/images), обработка изображений
// (@/features/recipe-images/image-processing) и @/lib/auth/@nb/auth мокаются
// напрямую — по образцу tests/masters-cabinet-actions.test.ts и правилу
// «тесты роутов обязаны мокать @nb/auth». Реальная БД не поднимается.

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  assertRateLimit: vi.fn(async () => {}),
  requestMasterImageUpload: vi.fn(),
  retryMasterImageUpload: vi.fn(),
  completeMasterImageUpload: vi.fn(),
  markMasterImageUploadFailed: vi.fn(),
  deleteMasterImageObjects: vi.fn(async () => {}),
  buildMasterImageStorageKeys: vi.fn(() => ({
    storageKeyOriginal: "orig-key",
    storageKeyLarge: "large-key",
    storageKeyMedium: "medium-key",
    storageKeyThumb: "thumb-key"
  })),
  uploadMasterImageDerivatives: vi.fn(async () => {}),
  processRecipeImageUpload: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@nb/auth", () => ({ assertRateLimit: mocks.assertRateLimit }));

vi.mock("@/features/masters/images", () => ({
  requestMasterImageUpload: mocks.requestMasterImageUpload,
  retryMasterImageUpload: mocks.retryMasterImageUpload,
  completeMasterImageUpload: mocks.completeMasterImageUpload,
  markMasterImageUploadFailed: mocks.markMasterImageUploadFailed,
  deleteMasterImageObjects: mocks.deleteMasterImageObjects,
  buildMasterImageStorageKeys: mocks.buildMasterImageStorageKeys,
  uploadMasterImageDerivatives: mocks.uploadMasterImageDerivatives
}));

vi.mock("@/features/recipe-images/image-processing", () => ({
  processRecipeImageUpload: mocks.processRecipeImageUpload
}));

import { POST } from "../app/api/master-images/upload/route";

const USER = { id: "user-1", role: "user" as const };

const VALID_IMAGE_ID = "11111111-1111-4111-8111-111111111111";
const VALID_ITEM_ID = "22222222-2222-4222-8222-222222222222";

const processedFixture = {
  width: 800,
  height: 600,
  originalBuffer: Buffer.from([1]),
  originalContentType: "image/jpeg",
  originalExtension: "jpg",
  largeBuffer: Buffer.from([2]),
  mediumBuffer: Buffer.from([3]),
  thumbBuffer: Buffer.from([4]),
  blurDataUrl: "data:image/webp;base64,abc"
};

const buildFile = (overrides: Partial<{ type: string; bytes: number }> = {}) => {
  const type = overrides.type ?? "image/jpeg";
  const size = overrides.bytes ?? 10;
  return new File([Buffer.alloc(size, 1)], "photo.jpg", { type });
};

const buildRequest = (fields: Record<string, string> = {}, file: File | null = buildFile()) => {
  const formData = new FormData();
  if (file) {
    formData.set("file", file);
  }
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return new Request("http://local/api/master-images/upload", { method: "POST", body: formData });
};

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.getSessionUser.mockResolvedValue(USER);
  mocks.assertRateLimit.mockResolvedValue(undefined);
  mocks.buildMasterImageStorageKeys.mockReturnValue({
    storageKeyOriginal: "orig-key",
    storageKeyLarge: "large-key",
    storageKeyMedium: "medium-key",
    storageKeyThumb: "thumb-key"
  });
  mocks.uploadMasterImageDerivatives.mockResolvedValue(undefined);
  mocks.deleteMasterImageObjects.mockResolvedValue(undefined);
  mocks.processRecipeImageUpload.mockResolvedValue({ ...processedFixture });
});

describe("POST /api/master-images/upload", () => {
  it("отвечает 401 без сессии", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
    expect(mocks.assertRateLimit).not.toHaveBeenCalled();
  });

  it("отвечает 429, когда assertRateLimit кидает", async () => {
    mocks.assertRateLimit.mockRejectedValue(new Error("RATE_LIMITED"));

    const response = await POST(buildRequest());
    const data = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(429);
    expect(data.ok).toBe(false);
    expect(mocks.requestMasterImageUpload).not.toHaveBeenCalled();
  });

  it("happy path: request → processRecipeImageUpload → uploadMasterImageDerivatives → completeMasterImageUpload", async () => {
    const slot = { id: "img-1", profileId: "profile-1" };
    const finalImage = { id: "img-1", status: "ready" };
    mocks.requestMasterImageUpload.mockResolvedValue(slot);
    mocks.completeMasterImageUpload.mockResolvedValue(finalImage);

    const response = await POST(buildRequest({ itemId: VALID_ITEM_ID }));
    const data = (await response.json()) as { ok: boolean; image: unknown };

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true, image: finalImage });

    expect(mocks.requestMasterImageUpload).toHaveBeenCalledWith({
      userId: USER.id,
      itemId: VALID_ITEM_ID,
      mimeType: "image/jpeg",
      sizeBytes: 10
    });
    expect(mocks.retryMasterImageUpload).not.toHaveBeenCalled();
    expect(mocks.processRecipeImageUpload).toHaveBeenCalledTimes(1);
    expect(mocks.uploadMasterImageDerivatives).toHaveBeenCalledWith(
      expect.objectContaining({
        storageKeyOriginal: "orig-key",
        storageKeyLarge: "large-key",
        storageKeyMedium: "medium-key",
        storageKeyThumb: "thumb-key",
        originalBuffer: processedFixture.originalBuffer,
        largeBuffer: processedFixture.largeBuffer,
        mediumBuffer: processedFixture.mediumBuffer,
        thumbBuffer: processedFixture.thumbBuffer
      })
    );
    expect(mocks.completeMasterImageUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        imageId: "img-1",
        userId: USER.id,
        width: processedFixture.width,
        height: processedFixture.height,
        blurDataUrl: processedFixture.blurDataUrl
      })
    );
  });

  it("без itemId передаёт itemId: null в requestMasterImageUpload", async () => {
    mocks.requestMasterImageUpload.mockResolvedValue({ id: "img-1", profileId: "profile-1" });
    mocks.completeMasterImageUpload.mockResolvedValue({ id: "img-1", status: "ready" });

    await POST(buildRequest());

    expect(mocks.requestMasterImageUpload).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: null })
    );
  });

  it("ветка retry: непустой imageId в форме зовёт retryMasterImageUpload вместо request", async () => {
    mocks.retryMasterImageUpload.mockResolvedValue({ id: VALID_IMAGE_ID, profileId: "profile-1" });
    mocks.completeMasterImageUpload.mockResolvedValue({ id: VALID_IMAGE_ID, status: "ready" });

    const response = await POST(buildRequest({ imageId: VALID_IMAGE_ID }));

    expect(response.status).toBe(200);
    expect(mocks.retryMasterImageUpload).toHaveBeenCalledWith({
      imageId: VALID_IMAGE_ID,
      userId: USER.id,
      mimeType: "image/jpeg",
      sizeBytes: 10
    });
    expect(mocks.requestMasterImageUpload).not.toHaveBeenCalled();
  });

  it("откат при падении обработки: processRecipeImageUpload бросает → удаляет объекты и метит failed", async () => {
    const slot = { id: "img-1", profileId: "profile-1" };
    const failedImage = { id: "img-1", status: "failed" };
    mocks.requestMasterImageUpload.mockResolvedValue(slot);
    mocks.processRecipeImageUpload.mockRejectedValue(new Error("INVALID_IMAGE_FILE"));
    mocks.markMasterImageUploadFailed.mockResolvedValue(failedImage);

    const response = await POST(buildRequest());
    const data = (await response.json()) as { ok: boolean; image: unknown };

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.image).toEqual(failedImage);
    expect(mocks.markMasterImageUploadFailed).toHaveBeenCalledWith("img-1", USER.id);
    // storageKeys ещё не построены (processRecipeImageUpload упал раньше) → удалять нечего.
    expect(mocks.deleteMasterImageObjects).toHaveBeenCalledWith([]);
    expect(mocks.completeMasterImageUpload).not.toHaveBeenCalled();
  });

  it("откат при падении загрузки деривативов: удаляет уже собранные ключи и метит failed", async () => {
    const slot = { id: "img-1", profileId: "profile-1" };
    const failedImage = { id: "img-1", status: "failed" };
    mocks.requestMasterImageUpload.mockResolvedValue(slot);
    mocks.uploadMasterImageDerivatives.mockRejectedValue(new Error("STORAGE_DOWN"));
    mocks.markMasterImageUploadFailed.mockResolvedValue(failedImage);

    const response = await POST(buildRequest());
    const data = (await response.json()) as { ok: boolean; image: unknown };

    expect(response.status).toBe(500);
    expect(data.image).toEqual(failedImage);
    expect(mocks.deleteMasterImageObjects).toHaveBeenCalledWith([
      "orig-key",
      "large-key",
      "medium-key",
      "thumb-key"
    ]);
  });

  it.each([
    ["UNSUPPORTED_IMAGE_TYPE", 400],
    ["IMAGE_TOO_LARGE", 400],
    ["IMAGE_LIMIT_REACHED", 400],
    ["PROFILE_LOCKED_PENDING", 409],
    ["NOT_FOUND", 404]
  ])("маппит доменную ошибку %s из requestMasterImageUpload в статус %d", async (message, expectedStatus) => {
    mocks.requestMasterImageUpload.mockRejectedValue(new Error(message));

    const response = await POST(buildRequest());

    expect(response.status).toBe(expectedStatus);
    // uploadSlot ещё не установлен (запрос слота упал первым) → откат не должен звать markMasterImageUploadFailed.
    expect(mocks.markMasterImageUploadFailed).not.toHaveBeenCalled();
  });

  it("отклоняет неподдерживаемый mime-тип файла (UNSUPPORTED_IMAGE_TYPE) до обращения к сервису", async () => {
    const response = await POST(buildRequest({}, buildFile({ type: "image/gif" })));
    const data = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(mocks.requestMasterImageUpload).not.toHaveBeenCalled();
  });

  it("отклоняет слишком большой файл (IMAGE_TOO_LARGE) до обращения к сервису", async () => {
    const response = await POST(buildRequest({}, buildFile({ bytes: 11 * 1024 * 1024 })));

    expect(response.status).toBe(400);
    expect(mocks.requestMasterImageUpload).not.toHaveBeenCalled();
  });

  it("отвечает 400 без файла в форме", async () => {
    const response = await POST(buildRequest({}, null));

    expect(response.status).toBe(400);
  });

  it("отвечает 400 при невалидном uuid в imageId (гард роута)", async () => {
    const response = await POST(buildRequest({ imageId: "garbage" }));
    const data = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(mocks.retryMasterImageUpload).not.toHaveBeenCalled();
    expect(mocks.requestMasterImageUpload).not.toHaveBeenCalled();
  });

  it("отвечает 400 при невалидном uuid в itemId (гард роута)", async () => {
    const response = await POST(buildRequest({ itemId: "not-a-uuid" }));

    expect(response.status).toBe(400);
    expect(mocks.requestMasterImageUpload).not.toHaveBeenCalled();
  });

  it("пустые itemId/imageId — не ошибка (обычный первый аплоад без retry)", async () => {
    mocks.requestMasterImageUpload.mockResolvedValue({ id: "img-1", profileId: "profile-1" });
    mocks.completeMasterImageUpload.mockResolvedValue({ id: "img-1", status: "ready" });

    const response = await POST(buildRequest({ itemId: "", imageId: "" }));

    expect(response.status).toBe(200);
  });
});
