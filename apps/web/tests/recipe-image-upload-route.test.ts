import { Blob } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(async () => ({ id: "image-1", status: "ready" })),
  process: vi.fn(async () => ({ originalExtension: "png", originalBuffer: Buffer.from("png"), originalContentType: "image/png", largeBuffer: Buffer.from("large"), mediumBuffer: Buffer.from("medium"), thumbBuffer: Buffer.from("thumb"), width: 100, height: 100, blurDataUrl: null })),
}));
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => ({ id: "owner-1" }) }));
vi.mock("@nb/auth", () => ({ assertRateLimit: async () => {} }));
vi.mock("@/features/recipe-images/image-processing", () => ({ processRecipeImageUpload: mocks.process }));
vi.mock("@/features/recipe-images/service", () => ({
  buildRecipeImageAltFallback: () => "Recipe",
  buildRecipeImageStorageKeys: () => ({ originalKey: "original", largeKey: "large", mediumKey: "medium", thumbKey: "thumb" }),
  completeRecipeImageUpload: mocks.complete,
  createRecipeDraftIfNeededForImageUpload: async () => ({ id: "recipe-1", title: "Recipe" }),
  deleteRecipeImageObjects: async () => {}, markRecipeImageUploadFailed: async () => {},
  requestRecipeImageUpload: async () => ({ id: "image-1", recipeId: "recipe-1" }),
  retryRecipeImageUpload: async () => ({ id: "image-1", recipeId: "recipe-1" }),
  uploadRecipeImageDerivatives: async () => {},
}));
import { POST } from "../app/api/recipe-images/upload/route";
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("recipe photo upload across Node runtimes", () => {
  it("accepts a real multipart file when global File is absent (Node 18)", async () => {
    const data = new FormData();
    data.set("recipeId", "recipe-1");
    data.set("file", new Blob(["png"], { type: "image/png" }) as unknown as globalThis.Blob, "photo.png");
    const request = new Request("http://localhost/api/recipe-images/upload", { method: "POST", body: data });
    vi.stubGlobal("File", undefined);
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ok: true, image: {id: "image-1"}});
    expect(mocks.process).toHaveBeenCalledWith(Buffer.from("png"), "image/png");
  });
  it("rejects a text form field used in place of a file", async () => {
    const data = new FormData();data.set("file", "photo.png");
    vi.stubGlobal("File", undefined);
    const response = await POST(new Request("http://localhost/api/recipe-images/upload", { method:"POST", body:data }));
    expect(response.status).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
  });
});
