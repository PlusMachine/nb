import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие GET /api/master-images/[imageId]/[variant] (docs/masters-showcase-review-findings.md, #26):
// сервисный слой (@/features/masters/service) и @/lib/auth мокаются напрямую,
// по образцу tests/masters-cabinet-actions.test.ts. Реальная БД не поднимается.

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getMasterImageAsset: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/features/masters/service", () => ({ getMasterImageAsset: mocks.getMasterImageAsset }));

import { GET } from "../app/api/master-images/[imageId]/[variant]/route";

const VALID_IMAGE_ID = "11111111-1111-4111-8111-111111111111";

const buildContext = (imageId: string, variant: string) => ({
  params: Promise.resolve({ imageId, variant })
});

beforeEach(() => {
  mocks.getSessionUser.mockReset();
  mocks.getMasterImageAsset.mockReset();
  mocks.getSessionUser.mockResolvedValue(null);
});

describe("GET /api/master-images/[imageId]/[variant]", () => {
  it("отвечает 404 при невалидном variant, не обращаясь к сервису", async () => {
    const response = await GET(new Request("http://local"), buildContext(VALID_IMAGE_ID, "huge"));
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(data.error).toBe("INVALID_VARIANT");
    expect(mocks.getMasterImageAsset).not.toHaveBeenCalled();
  });

  it("отвечает 404 при невалидном uuid imageId, не обращаясь к сервису (гард роута)", async () => {
    const response = await GET(new Request("http://local"), buildContext("not-a-uuid", "thumb"));
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(data.error).toBe("NOT_FOUND");
    expect(mocks.getMasterImageAsset).not.toHaveBeenCalled();
  });

  it("успех: 200 с телом и правильными заголовками для публичного (immutable) кеша", async () => {
    const body = Buffer.from([1, 2, 3, 4]);
    mocks.getMasterImageAsset.mockResolvedValue({
      body,
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable"
    });

    const response = await GET(new Request("http://local"), buildContext(VALID_IMAGE_ID, "thumb"));
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);

    expect(mocks.getMasterImageAsset).toHaveBeenCalledWith({
      imageId: VALID_IMAGE_ID,
      variant: "thumb",
      viewer: null
    });
  });

  it("успех: 200 с приватным кешем для непубличного (владелец/модератор) доступа", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "owner-1", role: "user" });
    mocks.getMasterImageAsset.mockResolvedValue({
      body: Buffer.from([9]),
      contentType: "image/jpeg",
      cacheControl: "private, max-age=3600"
    });

    const response = await GET(new Request("http://local"), buildContext(VALID_IMAGE_ID, "original"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(mocks.getMasterImageAsset).toHaveBeenCalledWith({
      imageId: VALID_IMAGE_ID,
      variant: "original",
      viewer: { id: "owner-1", role: "user" }
    });
  });

  it("маппит FORBIDDEN из сервиса в 404", async () => {
    mocks.getMasterImageAsset.mockRejectedValue(new Error("FORBIDDEN"));

    const response = await GET(new Request("http://local"), buildContext(VALID_IMAGE_ID, "large"));
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(data.error).toBe("FORBIDDEN");
  });

  it("маппит NOT_FOUND из сервиса в 404", async () => {
    mocks.getMasterImageAsset.mockRejectedValue(new Error("NOT_FOUND"));

    const response = await GET(new Request("http://local"), buildContext(VALID_IMAGE_ID, "medium"));
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(data.error).toBe("NOT_FOUND");
  });

  it("маппит прочую ошибку сервиса в 500 IMAGE_FETCH_FAILED", async () => {
    mocks.getMasterImageAsset.mockRejectedValue(new Error("STORAGE_DOWN"));

    const response = await GET(new Request("http://local"), buildContext(VALID_IMAGE_ID, "thumb"));
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(data.error).toBe("IMAGE_FETCH_FAILED");
  });
});
